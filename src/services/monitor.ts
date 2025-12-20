import { Connection, PublicKey, type Logs, type Context, type AccountInfo } from '@solana/web3.js';
import { config } from '../utils/config.js';
import { dbService, type SubscriptionRecord } from '../db/database.js';
import axios from 'axios';
import { createHash } from 'crypto';

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

  private async flushBuffer() {
    if (this.eventBuffer.length === 0) return;

    // Take current buffer and reset
    const batch = [...this.eventBuffer];
    this.eventBuffer = [];

    if (!config.webhookUrl) return;

    try {
      // Send as an array of events
      await axios.post(config.webhookUrl, batch, { timeout: 10000 });
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

    const event = {
      type: source === 'websocket' ? 'account_change' : 'poll_change',
      address: sub.address,
      signature: source === 'websocket' ? 'websocket_event' : 'poll_event',
      slot: context.slot,
      timestamp: Date.now(),
      data: JSON.stringify({
        lamports: accountInfo.lamports,
        data: accountInfo.data.toString('base64'),
        owner: accountInfo.owner.toBase58(),
        executable: accountInfo.executable,
      }),
    };

    const eventId = dbService.saveEvent(event);
    
    // Add internal ID to payload for reference, then buffer
    this.bufferEvent({ ...event, id: eventId });
  }

  private async handleLogs(sub: SubscriptionRecord, logs: Logs, context: Context) {
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
          await axios.post(config.webhookUrl!, JSON.parse(item.payload), { timeout: 10000 });
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