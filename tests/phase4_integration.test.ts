import { test } from 'node:test';
import assert from 'node:assert';
import { app, lastBatch } from '../consumer/executor.js';
import { dbService } from '../src/db/database.js';
import { MonitorService } from '../src/services/monitor.js';
import { Connection, PublicKey } from '@solana/web3.js';
import path from 'path';
import fs from 'fs';

test('Phase 4 - End-to-End Integration', async (t) => {
  // 1. Setup Executor
  const EXECUTOR_PORT = 4002;
  const executorUrl = `http://localhost:${EXECUTOR_PORT}/webhook`;
  let executorServer: any;

  // Reset DB
  dbService.reset();

  // Mock connection (we won't use it for real RPC calls in this simulation)
  const connection = new Connection('https://api.devnet.solana.com');
  const monitor = new MonitorService(connection);
  const monitorAny = monitor as any;

  await t.test('Setup Executor Service', async () => {
    return new Promise<void>((resolve) => {
      executorServer = app.listen(EXECUTOR_PORT, () => {
        console.log(`[Test] Executor listening on ${EXECUTOR_PORT}`);
        resolve();
      });
    });
  });

  await t.test('Setup Helios with WASM', async () => {
    const wasmPath = path.resolve('transformer/dca_logic/target/wasm32-unknown-unknown/release/dca_logic.wasm');
    const address = 'So11111111111111111111111111111111111111112';

    await monitor.start();

    // Add Subscription
    dbService.addSubscription({
      address,
      type: 'account',
      webhooks: JSON.stringify([executorUrl]),
      transformer_path: wasmPath
    });

    // Manually inject into monitor
    await (monitor as any).subscribe({
      address,
      type: 'account',
      webhooks: JSON.stringify([executorUrl]),
      transformer_path: wasmPath
    });
  });

  await t.test('Simulate Accumulation (9 Events)', async () => {
    const address = 'So11111111111111111111111111111111111111112';
    
    // Mock Account Info
    const accountInfo = {
      lamports: 1000000000,
      owner: new PublicKey('11111111111111111111111111111111'),
      data: Buffer.from('{"amount": 100000000}'), // 0.1 SOL (mock data format for our WASM)
      executable: false,
      rentEpoch: 0
    };

    // Send 9 events
    for (let i = 0; i < 9; i++) {
      const uniqueAccountInfo = {
        ...accountInfo,
        lamports: accountInfo.lamports + i // Vary state to bypass deduplication
      };
      await monitorAny.handleAccountChange(
        dbService.getSubscriptions()[0], 
        uniqueAccountInfo, 
        { slot: i }, 
        'websocket'
      );
    }
    
    // Force flush
    monitorAny.flushBuffer();

    // Give it a moment for HTTP requests
    await new Promise(r => setTimeout(r, 500));

    assert.strictEqual(lastBatch, null, 'Should NOT have triggered webhook yet (Total ~0.9 SOL)');
  });

  await t.test('Trigger Threshold (10th Event)', async () => {
    const address = 'So11111111111111111111111111111111111111112';
    
    const accountInfo = {
      lamports: 1000000000,
      owner: new PublicKey('11111111111111111111111111111111'),
      data: Buffer.from('{"amount": 100000000}'), // 0.1 SOL
      executable: false,
      rentEpoch: 0
    };

    // 10th Event
    const uniqueAccountInfo10 = {
        ...accountInfo,
        lamports: accountInfo.lamports + 100 // Ensure unique
    };
    await monitorAny.handleAccountChange(
        dbService.getSubscriptions()[0], 
        uniqueAccountInfo10, 
        { slot: 100 }, 
        'websocket'
    );

    // Force flush
    monitorAny.flushBuffer();

    // Wait for HTTP
    await new Promise(r => setTimeout(r, 1000));

    assert.ok(lastBatch, 'Should have triggered webhook (Total 1.0 SOL)');
    assert.strictEqual(lastBatch!.length, 1, 'Batch should contain the triggered event payload');
  });

  // Cleanup
  monitor.stop();
  executorServer.close();
});
