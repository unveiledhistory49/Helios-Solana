import { test } from 'node:test';
import assert from 'node:assert';
import { processBatch } from '../consumer/executor.ts';

test('Executor - Process Batch', async (t) => {
  await t.test('should construct and sign a transaction for a batch of events', async () => {
    const mockEvents = [
      { type: 'deposit', amount: 10 },
      { type: 'deposit', amount: 20 }
    ];

    const result = await processBatch(mockEvents);

    assert.ok(result.signedTx, 'Transaction should be created');
    assert.strictEqual(result.signedTx.signatures.length, 1, 'Transaction should be signed');
    assert.ok(result.signedTx.verifySignatures(), 'Signature should be valid');
  });
});
