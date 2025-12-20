import Database from 'better-sqlite3';
import { config } from '../utils/config.js';

export interface EventRecord {
  id?: number;
  type: string;
  address: string;
  signature: string;
  slot: number;
  timestamp: number;
  data: string;
}

export interface SubscriptionRecord {
  address: string;
  type: 'account' | 'program';
  label?: string;
}

export class DatabaseService {
  private db: Database.Database;

  constructor() {
    this.db = new Database(config.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        address TEXT NOT NULL,
        signature TEXT NOT NULL,
        slot INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        address TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        label TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_address ON events(address);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

      CREATE TABLE IF NOT EXISTS webhook_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER,
        payload TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        next_retry INTEGER NOT NULL,
        status TEXT DEFAULT 'pending'
      );
    `);
  }

  saveEvent(event: EventRecord) {
    const stmt = this.db.prepare(`
      INSERT INTO events (type, address, signature, slot, timestamp, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(event.type, event.address, event.signature, event.slot, event.timestamp, event.data);
    return result.lastInsertRowid;
  }

  getEvents(limit = 100, offset = 0) {
    const stmt = this.db.prepare(`
      SELECT * FROM events ORDER BY timestamp DESC LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset) as EventRecord[];
  }

  addSubscription(sub: SubscriptionRecord) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO subscriptions (address, type, label)
      VALUES (?, ?, ?)
    `);
    return stmt.run(sub.address, sub.type, sub.label || null);
  }

  getSubscriptions() {
    const stmt = this.db.prepare(`SELECT * FROM subscriptions`);
    return stmt.all() as SubscriptionRecord[];
  }

  removeSubscription(address: string) {
    const stmt = this.db.prepare(`DELETE FROM subscriptions WHERE address = ?`);
    return stmt.run(address);
  }

  // Webhook Queue Methods
  queueWebhook(eventId: number | bigint, payload: any) {
    const stmt = this.db.prepare(`
      INSERT INTO webhook_queue (event_id, payload, next_retry, status)
      VALUES (?, ?, ?, 'pending')
    `);
    return stmt.run(eventId, JSON.stringify(payload), Date.now());
  }

  getPendingWebhooks(limit = 10) {
    const stmt = this.db.prepare(`
      SELECT * FROM webhook_queue 
      WHERE status = 'pending' AND next_retry <= ? 
      LIMIT ?
    `);
    return stmt.all(Date.now(), limit) as any[];
  }

  markWebhookComplete(id: number) {
    const stmt = this.db.prepare(`
      UPDATE webhook_queue SET status = 'completed' WHERE id = ?
    `);
    return stmt.run(id);
  }

  markWebhookFailed(id: number) {
    // Exponential backoff: retry_count^2 * 1000ms (1s, 4s, 9s, 16s...)
    // Max retries = 5, then fail permanently
    const stmt = this.db.prepare(`
      UPDATE webhook_queue 
      SET retry_count = retry_count + 1,
          next_retry = ? + (retry_count * retry_count * 1000),
          status = CASE WHEN retry_count >= 5 THEN 'failed' ELSE 'pending' END
      WHERE id = ?
    `);
    return stmt.run(Date.now(), id);
  }
}

export const dbService = new DatabaseService();
