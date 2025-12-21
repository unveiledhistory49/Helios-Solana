import { MonitorService } from '../src/services/monitor.js';
import { MockConnection } from './mocks/connection.js';
import { dbService } from '../src/db/database.js';
import { metrics } from '../src/services/metrics.js';
import { PublicKey } from '@solana/web3.js';
import assert from 'node:assert';
import { test } from 'node:test';

const MOCK_ADDR = 'So11111111111111111111111111111111111111112';

test('Load Test - 1000 Events Ingestion', async () => {
  dbService.reset();
  metrics.activeSubscriptions.set(0);
  metrics.bufferDepth.set(0);
  metrics.eventsIngested.reset();

  dbService.addSubscription({ address: MOCK_ADDR, type: 'account' });

  const mockConn = new MockConnection('http://localhost');
  const monitor = new MonitorService(mockConn as any);
  await monitor.start();

  const startTime = Date.now();
  const EVENT_COUNT = 1000;

  console.log(`Starting ingestion of ${EVENT_COUNT} events...`);

  for (let i = 0; i < EVENT_COUNT; i++) {
    mockConn.simulateAccountChange(new PublicKey(MOCK_ADDR), {
      lamports: i,
      data: Buffer.from(''),
      owner: new PublicKey(MOCK_ADDR),
      executable: false
    } as any, i);
    
    // Slight yield to allow event loop to breathe, simulating network bursts
    if (i % 100 === 0) await new Promise(r => setImmediate(r));
  }

  const duration = Date.now() - startTime;
  console.log(`Ingested ${EVENT_COUNT} events in ${duration}ms`);
  console.log(`Rate: ${(EVENT_COUNT / (duration / 1000)).toFixed(2)} events/sec`);

  // Verify DB count
  const stmt = dbService['db'].prepare('SELECT COUNT(*) as count FROM events');
  const result = stmt.get() as any;
  assert.strictEqual(result.count, EVENT_COUNT);

  // Verify Metrics
  const ingested = await metrics.eventsIngested.get();
  // Sum up all labels
  const total = ingested.values.reduce((acc, v) => acc + v.value, 0);
  assert.strictEqual(total, EVENT_COUNT);

  monitor.stop();
});
