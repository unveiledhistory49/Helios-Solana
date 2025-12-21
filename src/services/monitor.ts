import { Connection, PublicKey, type Logs, type Context, type AccountInfo } from '@solana/web3.js';
import { config } from '../utils/config.js';
import { dbService, type SubscriptionRecord } from '../db/database.js';
import { decoderService } from './decoder.js';
import { WasmEngine } from './wasm_engine.js';
import axios from 'axios';
import { createHash, createHmac } from 'crypto';
import jsonLogic from 'json-logic-js';
import { metrics } from './metrics.js';

export class MonitorService {
  private connection: Connection;
  private subscriptionIds: Map<string, { id: number; type: 'account' | 'program' }> = new Map();
  private subscriptionMap: Map<string, SubscriptionRecord> = new Map();
  private wasmEngines: Map<string, WasmEngine> = new Map();
  private lastAccountState: Map<string, string> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private webhookInterval: NodeJS.Timeout | null = null;

  // Batching Configuration
  private eventBuffer: any[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_TIMEOUT_MS = 500;

  constructor(connection?: Connection) {
    if (connection) {
      this.connection = connection;
    } else {
      this.connection = new Connection(config.rpcUrl, {
        wsEndpoint: config.wssUrl,
        commitment: 'confirmed',
      });
    }
  }

  async start() {
    console.log('Starting Monitor Service...');
    const subs = dbService.getSubscriptions();
    console.log(`Loading ${subs.length} subscriptions from database.`);
    
    metrics.activeSubscriptions.set(subs.length);

    for (const sub of subs) {
      await this.subscribe(sub);
    }

    // Start buffer flushing timer
    this.startFlushTimer();
    // Start fallback polling
    this.startPolling();
    // Start webhook retry processor
    this.startWebhookProcessor();
  }

  stop() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.webhookInterval) clearInterval(this.webhookInterval);
    if (this.flushTimer) clearInterval(this.flushTimer);

    metrics.activeSubscriptions.set(0);

    for (const { id, type } of this.subscriptionIds.values()) {
      if (type === 'account') {
        this.connection.removeAccountChangeListener(id).catch(console.error);
      } else {
        this.connection.removeOnLogsListener(id).catch(console.error);
      }
    }
    this.subscriptionIds.clear();
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flushBuffer();
    }, this.FLUSH_TIMEOUT_MS);
  }

  private getSignature(payload: string): string | null {
    if (!config.webhookSecret) return null;
    return createHmac('sha256', config.webhookSecret)
      .update(payload)
      .digest('hex');
  }

  private async flushBuffer() {
    if (this.eventBuffer.length === 0) return;

    // Take current buffer and reset
    const buffer = [...this.eventBuffer];
    this.eventBuffer = [];
    metrics.bufferDepth.set(0);

    const batches = new Map<string, any[]>();

    const addToBatch = (url: string, event: any) => {
      if (!batches.has(url)) batches.set(url, []);
      batches.get(url)!.push(event);
    };

    for (const event of buffer) {
      // Global Webhook
      if (config.webhookUrl) {
        addToBatch(config.webhookUrl, event);
      }

      // Per-Subscription Webhooks
      const sub = this.subscriptionMap.get(event.address);
      if (sub && sub.webhooks) {
        try {
          const urls = JSON.parse(sub.webhooks);
          if (Array.isArray(urls)) {
            for (const url of urls) {
              addToBatch(url, event);
            }
          }
        } catch (e) {
          console.error(`Invalid webhooks JSON for ${event.address}`, e);
        }
      }
    }

    for (const [url, batch] of batches) {
      this.sendBatch(url, batch);
    }
  }

  private async sendBatch(url: string, batch: any[]) {
    const timer = metrics.webhookDuration.startTimer();
    try {
      const payloadStr = JSON.stringify(batch);
      const signature = this.getSignature(payloadStr);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (signature) {
        headers['X-Helios-Signature'] = signature;
      }

      // Send as an array of events
      await axios.post(url, payloadStr, { 
        headers,
        timeout: 10000 
      });
      timer(); // End timer
    } catch (error: any) {
      timer();
      metrics.webhookFailures.inc({ reason: error.code || 'unknown' });
      console.error(`Batch webhook dispatch failed to ${url}: ${error.message}. Queueing ${batch.length} events.`);
      // Queue the entire batch as a single payload for retry efficiency
      // Note: passing 0 as eventId since this is a batch
      dbService.queueWebhook(0, batch, url);
    }
  }

  private async subscribe(sub: SubscriptionRecord) {
    this.subscriptionMap.set(sub.address, sub);

    // Load Transformer if needed
    if (sub.transformer_path && !this.wasmEngines.has(sub.transformer_path)) {
      try {
        console.log(`Loading WASM transformer: ${sub.transformer_path}`);
        const engine = new WasmEngine();
        await engine.loadModule(sub.transformer_path);
        this.wasmEngines.set(sub.transformer_path, engine);
      } catch (e) {
        console.error(`Failed to load transformer for ${sub.address}:`, e);
      }
    }

    if (this.subscriptionIds.has(sub.address)) return;

    const pubkey = new PublicKey(sub.address);

    if (sub.type === 'account') {
      const id = this.connection.onAccountChange(
        pubkey,
        (accountInfo, context) => this.handleAccountChange(sub, accountInfo, context, 'websocket'),
        'confirmed'
      );
      this.subscriptionIds.set(sub.address, { id, type: 'account' });
      console.log(`Subscribed to account: ${sub.address}`);
    } else if (sub.type === 'program') {
      const id = this.connection.onLogs(
        pubkey,
        (logs, context) => this.handleLogs(sub, logs, context),
        'confirmed'
      );
      this.subscriptionIds.set(sub.address, { id, type: 'program' });
      console.log(`Subscribed to program logs: ${sub.address}`);
    }
  }

  private getAccountStateHash(info: AccountInfo<Buffer>): string {
    const data = info.data.toString('base64');
    return createHash('sha256')
      .update(`${info.lamports}:${data}:${info.owner.toBase58()}`)
      .digest('hex');
  }

  private applyTransformer(sub: SubscriptionRecord, eventData: any): any | null {
    if (!sub.transformer_path) return eventData;

    const engine = this.wasmEngines.get(sub.transformer_path);
    if (!engine) return eventData;

    try {
      const inputJson = JSON.stringify(eventData);
      const outputJson = engine.runTransform(inputJson);
      
      if (outputJson === null) return null; // Filtered out
      return JSON.parse(outputJson);
    } catch (e) {
      console.error(`Transformer failed for ${sub.address}:`, e);
      return eventData;
    }
  }

  private async handleAccountChange(
    sub: SubscriptionRecord, 
    accountInfo: AccountInfo<Buffer>, 
    context: Context,
    source: 'websocket' | 'poll' = 'websocket'
  ) {
    const currentHash = this.getAccountStateHash(accountInfo);
    const lastHash = this.lastAccountState.get(sub.address);

    if (currentHash === lastHash) return;
    this.lastAccountState.set(sub.address, currentHash);

    const dataStr = accountInfo.data.toString('base64');
    const ownerStr = accountInfo.owner.toBase58();

    let decoded = null;
    if (sub.schema) {
      // If a specific schema (account name) is provided, try decoding it
      // using the owner program as the IDL source.
      decoded = await decoderService.decodeAccountData(ownerStr, sub.schema, dataStr);
    }

    // Filter Check
    if (sub.filter_rules) {
      try {
        const rules = JSON.parse(sub.filter_rules);
        const logicData = {
          lamports: accountInfo.lamports,
          owner: ownerStr,
          executable: accountInfo.executable,
          parsed: decoded || {},
          enrichment: null
        };
        
        if (!jsonLogic.apply(rules, logicData)) {
          // Event filtered out
          return;
        }
      } catch (e) {
        console.error(`Error applying filter for ${sub.address}:`, e);
      }
    }

    const event = {
      type: source === 'websocket' ? 'account_change' : 'poll_change',
      address: sub.address,
      signature: source === 'websocket' ? 'websocket_event' : 'poll_event',
      slot: context.slot,
      timestamp: Date.now(),
      data: JSON.stringify({
        lamports: accountInfo.lamports,
        data: dataStr,
        owner: ownerStr,
        executable: accountInfo.executable,
      }),
      parsed: decoded,
      enrichment: null
    };

    metrics.eventsIngested.inc({ type: 'account', source });

    const eventId = dbService.saveEvent(event);
    
    const eventForWebhook = { ...event, id: eventId };
    const transformed = this.applyTransformer(sub, eventForWebhook);

    if (transformed) {
      this.bufferEvent(transformed);
    }
  }

  private async handleLogs(sub: SubscriptionRecord, logs: Logs, context: Context) {
    let decoded = null;
    let enrichment = null;
    
    // Attempt to decode the instruction if we have an IDL for this program
    try {
      const tx = await this.connection.getParsedTransaction(logs.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (tx) {
        if (config.enrichTransactions) {
          enrichment = tx;
        }

        if (tx.transaction.message.instructions) {
          // Find the instruction that belongs to our subscribed program
          const relevantIxs = tx.transaction.message.instructions.filter(ix => 
            ix.programId.toBase58() === sub.address && 'data' in ix
          );

          if (relevantIxs.length > 0) {
            const ixData = (relevantIxs[0] as any).data; // Base58 encoded in parsed tx
            decoded = await decoderService.decodeInstruction(sub.address, ixData);
          }
        }
      }
    } catch (err) {
      // Transaction might not be available yet or parsing failed
    }

    // Filter Check
    if (sub.filter_rules) {
      try {
        const rules = JSON.parse(sub.filter_rules);
        const logicData = {
          logs: logs.logs,
          signature: logs.signature,
          parsed: decoded || {},
          enrichment: enrichment || {}
        };
        
        if (!jsonLogic.apply(rules, logicData)) {
          return;
        }
      } catch (e) {
        console.error(`Error applying filter for logs ${sub.address}:`, e);
      }
    }

    const event = {
      type: 'program_logs',
      address: sub.address,
      signature: logs.signature,
      slot: context.slot,
      timestamp: Date.now(),
      data: JSON.stringify({
        logs: logs.logs,
        err: logs.err,
      }),
      parsed: decoded,
      enrichment: enrichment
    };

    metrics.eventsIngested.inc({ type: 'program', source: 'websocket' });

    const eventId = dbService.saveEvent(event);
    
    const eventForWebhook = { ...event, id: eventId };
    const transformed = this.applyTransformer(sub, eventForWebhook);

    if (transformed) {
      this.bufferEvent(transformed);
    }
  }

  private bufferEvent(payload: any) {
    this.eventBuffer.push(payload);
    metrics.bufferDepth.set(this.eventBuffer.length);
    
    // If buffer is full, flush immediately
    if (this.eventBuffer.length >= this.BATCH_SIZE) {
      this.flushBuffer();
    }
  }

  private startWebhookProcessor() {
    this.webhookInterval = setInterval(async () => {
      const pending = dbService.getPendingWebhooks();
      for (const item of pending) {
        try {
          // item.payload is already a JSON string (could be array or object)
          // We need to calculate signature for the stored payload string
          const signature = this.getSignature(item.payload);
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (signature) {
            headers['X-Helios-Signature'] = signature;
          }

          const url = item.url || config.webhookUrl;
          if (!url) {
            console.error(`No webhook URL for retry item ${item.id}`);
            dbService.markWebhookFailed(item.id);
            continue;
          }

          await axios.post(url, item.payload, { 
            headers,
            timeout: 10000 
          });
          
          dbService.markWebhookComplete(item.id);
          console.log(`Retry successful for webhook ${item.id}`);
        } catch (error: any) {
          console.error(`Retry failed for webhook ${item.id}: ${error.message}`);
          dbService.markWebhookFailed(item.id);
        }
      }
    }, 5000); // Check every 5 seconds
  }

  private startPolling() {
    this.pollInterval = setInterval(async () => {
      const subs = dbService.getSubscriptions().filter((s: SubscriptionRecord) => s.type === 'account');
      for (const sub of subs) {
        try {
          const pubkey = new PublicKey(sub.address);
          const { value: accountInfo, context } = await this.connection.getAccountInfoAndContext(pubkey);
          if (accountInfo) {
            await this.handleAccountChange(sub, accountInfo, context, 'poll');
          }
        } catch (e) {
          console.error(`Polling failed for ${sub.address}`);
        }
      }
    }, config.pollIntervalMs);
  }

  async addSubscription(address: string, type: 'account' | 'program', label?: string, transformerPath?: string) {
    const sub: SubscriptionRecord = { address, type };
    if (label) sub.label = label;
    if (transformerPath) sub.transformer_path = transformerPath;
    
    dbService.addSubscription(sub);
    await this.subscribe(sub);
  }
}

export const monitorService = new MonitorService();