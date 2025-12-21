import { MonitorService } from '../src/services/monitor.js';
import { MockConnection } from './mocks/connection.js';
import { dbService } from '../src/db/database.js';
import { metrics } from '../src/services/metrics.js';
import { PublicKey } from '@solana/web3.js';
import assert from 'node:assert';
import { test, beforeEach, afterEach } from 'node:test';

const MOCK_ADDR = 'So11111111111111111111111111111111111111112';

// Helper to reset DB state
function resetDb() {
  dbService.reset();
  metrics.bufferDepth.set(0);
  metrics.activeSubscriptions.set(0);
}

test('MonitorService - Subscribes and Buffers Events', async (t) => {
  try {
    resetDb();
    // Add a subscription
    dbService.addSubscription({ address: MOCK_ADDR, type: 'account' });

    const mockConn = new MockConnection('http://localhost');
    const monitor = new MonitorService(mockConn as any);

    await monitor.start();

    // Verify active subscription metric
    const activeSubs = await metrics.activeSubscriptions.get();
    assert.strictEqual(activeSubs.values[0].value, 1);

    // Simulate Event
    const accountInfo = {
      lamports: 5000,
      data: Buffer.from(''),
      owner: new PublicKey(MOCK_ADDR),
      executable: false
    };

    mockConn.simulateAccountChange(new PublicKey(MOCK_ADDR), accountInfo as any, 100);

    // Check buffer depth (should be 1)
    const depth = await metrics.bufferDepth.get();
    assert.strictEqual(depth.values[0].value, 1);

    monitor.stop();
  } catch (err) {
    console.error(err);
    throw err;
  }
});

test('MonitorService - Filtering Logic', async () => {
  try {
    resetDb();
    // Add a filtered subscription (lamports > 10000)
    const filter = JSON.stringify({ ">": [{ "var": "lamports" }, 10000] });
    dbService.addSubscription({ 
      address: MOCK_ADDR, 
      type: 'account',
      filter_rules: filter 
    });

    const mockConn = new MockConnection('http://localhost');
    const monitor = new MonitorService(mockConn as any);
    await monitor.start();

    // 1. Simulate Ignored Event (5000 lamports)
    console.log('Simulating ignored event...');
    mockConn.simulateAccountChange(new PublicKey(MOCK_ADDR), {
      lamports: 5000,
      data: Buffer.from(''),
      owner: new PublicKey(MOCK_ADDR),
      executable: false
    } as any, 101);

    let depth = await metrics.bufferDepth.get();
    console.log('Buffer depth after ignored event:', depth.values[0].value);
    assert.strictEqual(depth.values[0].value, 0, 'Event should be filtered out');

    // 2. Simulate Matched Event (15000 lamports)
    console.log('Simulating matched event...');
    mockConn.simulateAccountChange(new PublicKey(MOCK_ADDR), {
      lamports: 15000,
      data: Buffer.from(''),
      owner: new PublicKey(MOCK_ADDR),
      executable: false
    } as any, 102);

    depth = await metrics.bufferDepth.get();
    console.log('Buffer depth after matched event:', depth.values[0].value);
    assert.strictEqual(depth.values[0].value, 1, 'Event should be buffered');

    monitor.stop();
  } catch (err) {
    console.error(err);
    throw err;
  }
});
