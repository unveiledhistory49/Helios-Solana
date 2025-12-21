import { MonitorService } from '../src/services/monitor.js';
import { MockConnection } from './mocks/connection.js';
import { dbService } from '../src/db/database.js';
import { config } from '../src/utils/config.js';
import { metrics } from '../src/services/metrics.js';
import { PublicKey } from '@solana/web3.js';
import express from 'express';
import assert from 'node:assert';
import { test } from 'node:test';

const MOCK_ADDR = 'So11111111111111111111111111111111111111112';
const TEST_PORT = 5000;
const BASE_URL = `http://localhost:${TEST_PORT}`;

test('Multicast Webhooks', async () => {
  // 1. Setup Mock Server
  const received: Record<string, number> = { global: 0, sub1: 0, sub2: 0 };
  const app = express();
  app.use(express.json());

  app.post('/global', (req, res) => { received.global++; res.sendStatus(200); });
  app.post('/sub1', (req, res) => { received.sub1++; res.sendStatus(200); });
  app.post('/sub2', (req, res) => { received.sub2++; res.sendStatus(200); });

  const server = app.listen(TEST_PORT);

  try {
    // 2. Setup Monitor & DB
    dbService.reset();
    metrics.activeSubscriptions.set(0);
    metrics.bufferDepth.set(0);
    
    // Configure Global Webhook
    (config as any).webhookUrl = `${BASE_URL}/global`;

    // Add subscription with multiple webhooks
    dbService.addSubscription({
      address: MOCK_ADDR,
      type: 'account',
      webhooks: JSON.stringify([`${BASE_URL}/sub1`, `${BASE_URL}/sub2`])
    });

    const mockConn = new MockConnection('http://localhost');
    const monitor = new MonitorService(mockConn as any);
    
    // Inject mock connection to ensure it's used (MonitorService constructor handles this if passed)
    // Actually monitorService uses the passed connection in constructor.
    
    await monitor.start();

    // 3. Simulate Event
    mockConn.simulateAccountChange(new PublicKey(MOCK_ADDR), {
      lamports: 1000,
      data: Buffer.from(''),
      owner: new PublicKey(MOCK_ADDR),
      executable: false
    } as any, 100);

    // Wait for buffer flush (500ms default) + network
    await new Promise(r => setTimeout(r, 1000));

    // 4. Verify
    assert.strictEqual(received.global, 1, 'Global webhook should receive event');
    assert.strictEqual(received.sub1, 1, 'Sub1 should receive event');
    assert.strictEqual(received.sub2, 1, 'Sub2 should receive event');

    monitor.stop();
  } finally {
    server.close();
  }
});
