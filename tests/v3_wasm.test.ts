import assert from 'node:assert';
import test, { describe, it, before, after } from 'node:test';
import path from 'path';
import { fileURLToPath } from 'url';
import { MonitorService } from '../src/services/monitor.js';
import { dbService } from '../src/db/database.js';
import { PublicKey, AccountInfo } from '@solana/web3.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('V3 WASM Transformer', () => {
  let monitor: MonitorService;
  const wasmPath = path.resolve(__dirname, '../examples/basic_transform/target/wasm32-unknown-unknown/release/basic_transform.wasm');

  before(async () => {
    // Ensure WASM exists
    if (!fs.existsSync(wasmPath)) {
        throw new Error(`WASM file not found at ${wasmPath}. Run 'cargo build' first.`);
    }

    dbService.reset();
    monitor = new MonitorService();
  });

  after(() => {
    monitor.stop();
  });

  it('should transform event data before buffering', async () => {
    const address = 'So11111111111111111111111111111111111111112';
    
    // Add subscription with transformer
    await monitor.addSubscription(address, 'account', undefined, wasmPath);
    
    // Simulate Event
    const accountInfo = {
        data: Buffer.from('test data'),
        executable: false,
        lamports: 1000,
        owner: new PublicKey('11111111111111111111111111111111'),
    } as AccountInfo<Buffer>;

    const context = { slot: 12345 };
    
    // Call private handleAccountChange
    // We need to fetch the sub record first to pass it in
    const subs = dbService.getSubscriptions();
    const sub = subs.find(s => s.address === address);
    assert.ok(sub, "Subscription should exist");

    await (monitor as any).handleAccountChange(
        sub, 
        accountInfo, 
        context, 
        'websocket'
    );
    
    // Check Buffer
    const buffer = (monitor as any).eventBuffer;
    assert.strictEqual(buffer.length, 1);
    
    const event = buffer[0];
    
    // Check for WASM modification
    assert.strictEqual(event.wasm_processed, true);
    assert.strictEqual(event.processed_at, "Helios WASM");
    
    // Check DB for ORIGINAL event (untransformed)
    const storedEvents = dbService.getEvents();
    assert.strictEqual(storedEvents.length, 1);
    
    // storedEvents[0] is the EventRecord from SQLite. 
    // It has: id, type, address, signature, slot, timestamp, data.
    // It does NOT have "wasm_processed" because that's not a column.
    // The "data" field contains the inner JSON.
    
    // Ensure we didn't somehow corrupt the DB record
    assert.strictEqual(storedEvents[0].address, address);
  });
});
