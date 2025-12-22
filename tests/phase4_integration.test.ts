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

    // Add IDL for the address
    const mockIdl = {
      version: "0.1.0",
      name: "vault",
      instructions: [
        {
          name: "deposit",
          accounts: [{ name: "vault", isMut: true, isSigner: false }],
          args: [{ name: "amount", type: "u64" }]
        }
      ]
    };
    dbService.saveIdl(address, mockIdl);

    // Add Subscription (Program Type)
    const sub = {
      address,
      type: 'program' as const,
      webhooks: JSON.stringify([executorUrl]),
      transformer_path: wasmPath
    };
    dbService.addSubscription(sub);

    // Manually inject into monitor
    await (monitor as any).subscribe(sub);
  });

  await t.test('Simulate Accumulation (4 Events)', async () => {
    const address = 'So11111111111111111111111111111111111111112';
    
    // Mock getParsedTransaction
    (connection as any).getParsedTransaction = async () => ({
      transaction: {
        message: {
          instructions: [
            {
              programId: new PublicKey(address),
              data: 'dummy_data'
            }
          ]
        }
      }
    });

    const { decoderService } = await import('../src/services/decoder.js');
    (decoderService as any).decodeInstruction = async () => ({
         name: 'deposit',
         args: { amount: 100000000, user: 'UserX' }
    });

    // Send 4 events
    for (let i = 0; i < 4; i++) {
      await monitorAny.handleLogs(
        dbService.getSubscriptions()[0], 
        { signature: `sig_${i}`, logs: [], err: null }, 
        { slot: i }
      );
    }
    
    // Force flush
    monitorAny.flushBuffer();

    // Give it a moment for HTTP requests
    await new Promise(r => setTimeout(r, 500));

    assert.strictEqual(lastBatch, null, 'Should NOT have triggered webhook yet (Total ~0.4 SOL)');
  });

  await t.test('Trigger Threshold (5th Event)', async () => {
    const logs = {
      signature: 'sig_final',
      logs: ['Program ... success'],
      err: null
    };

    // Ensure mock remains
    const { decoderService } = await import('../src/services/decoder.js');
    (decoderService as any).decodeInstruction = async () => ({
         name: 'deposit',
         args: { amount: 100000000, user: 'UserFinal' }
    });

    await monitorAny.handleLogs(
        dbService.getSubscriptions()[0], 
        logs, 
        { slot: 100 }
    );

    // Force flush
    monitorAny.flushBuffer();

    // Wait for HTTP
    await new Promise(r => setTimeout(r, 1000));

    assert.ok(lastBatch, 'Should have triggered webhook (Total 0.5 SOL)');
    assert.strictEqual(lastBatch!.length, 1, 'Batch should contain the triggered event payload');
  });

  // Cleanup
  monitor.stop();
  executorServer.close();
});
