import { Connection, PublicKey, type Logs, type Context, type AccountInfo } from '@solana/web3.js';
import { config } from '../utils/config.js';
import { dbService, type SubscriptionRecord } from '../db/database.js';
import { decoderService } from './decoder.js';
import axios from 'axios';
import { createHash, createHmac } from 'crypto';

export class MonitorService {
  private connection: Connection;
  private subscriptionIds: Map<string, { id: number; type: 'account' | 'program' }> = new Map();
  private lastAccountState: Map<string, string> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private webhookInterval: NodeJS.Timeout | null = null;

  // Batching Configuration
  private eventBuffer: any[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_TIMEOUT_MS = 500;

  constructor() {
    this.connection = new Connection(config.rpcUrl, {
      wsEndpoint: config.wssUrl,
      commitment: 'confirmed',
    });
  }

  async start() {
    console.log('Starting Monitor Service...');
    const subs = dbService.getSubscriptions();
    console.log(`Loading ${subs.length} subscriptions from database.`);
    
    for (const sub of subs) {
      this.subscribe(sub);
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
    const batch = [...this.eventBuffer];
    this.eventBuffer = [];

    if (!config.webhookUrl) return;

    try {
      const payloadStr = JSON.stringify(batch);
      const signature = this.getSignature(payloadStr);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (signature) {
        headers['X-Helios-Signature'] = signature;
      }

      // Send as an array of events
      await axios.post(config.webhookUrl, payloadStr, { 
        headers,
        timeout: 10000 
      });
    } catch (error: any) {
      console.error(`Batch webhook dispatch failed: ${error.message}. Queueing ${batch.length} events.`);
      // Queue the entire batch as a single payload for retry efficiency
      // Note: passing 0 as eventId since this is a batch
      dbService.queueWebhook(0, batch);
    }
  }

  private subscribe(sub: SubscriptionRecord) {
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
    };

    const eventId = dbService.saveEvent(event);
    
    // Add internal ID to payload for reference, then buffer
    this.bufferEvent({ ...event, id: eventId });
  }

  private async handleLogs(sub: SubscriptionRecord, logs: Logs, context: Context) {
    let decoded = null;
    
    // Attempt to decode the instruction if we have an IDL for this program
    try {
      const tx = await this.connection.getParsedTransaction(logs.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (tx && tx.transaction.message.instructions) {
        // Find the instruction that belongs to our subscribed program
        // This is a simplified approach, real transactions might have many calls.
        const relevantIxs = tx.transaction.message.instructions.filter(ix => 
          ix.programId.toBase58() === sub.address && 'data' in ix
        );

        if (relevantIxs.length > 0) {
          const ixData = (relevantIxs[0] as any).data; // Base58 encoded in parsed tx
          decoded = await decoderService.decodeInstruction(sub.address, ixData);
        }
      }
    } catch (err) {
      // Transaction might not be available yet or parsing failed
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
      parsed: decoded
    };

    const eventId = dbService.saveEvent(event);
    this.bufferEvent({ ...event, id: eventId });
  }

  private bufferEvent(payload: any) {
    this.eventBuffer.push(payload);
    
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

          await axios.post(config.webhookUrl!, item.payload, { 
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

  async addSubscription(address: string, type: 'account' | 'program', label?: string) {
    const sub: SubscriptionRecord = { address, type };
    if (label) sub.label = label;
    dbService.addSubscription(sub);
    this.subscribe(sub);
  }
}

export const monitorService = new MonitorService();