import { test } from 'node:test';
import assert from 'node:assert';
import { processBatch } from '../consumer/executor.ts';

test('Executor - Process Batch', async (t) => {
  await t.test('should construct and sign a transaction for a batch of events', async () => {
    const mockEvents = [
      { 
        type: 'program_logs', 
        parsed: { 
          name: 'deposit', 
          args: { amount: 100000000, user: 'User1111111111111111111111111111111111111' } 
        } 
      },
      { 
        type: 'program_logs', 
        parsed: { 
          name: 'deposit', 
          args: { amount: 200000000, user: 'User2222222222222222222222222222222222222' } 
        } 
      }
    ];

    const result = await (processBatch as any)(mockEvents);

    assert.ok(result.signature, 'Signature should be present');
    assert.strictEqual(result.userCount, 2, 'Should process 2 users');
    assert.strictEqual(result.totalLamports, 300000000, 'Should have correct total amount');
  });
});
