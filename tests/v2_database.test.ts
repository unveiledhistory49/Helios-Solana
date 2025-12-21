import { dbService } from '../src/db/database.js';
import assert from 'node:assert';
import { test } from 'node:test';

test('Database - Webhook Queue & Retry Logic', async () => {
  dbService.reset();

  // 1. Queue a failed event
  const payload = { id: 1, type: 'test' };
  const res = dbService.queueWebhook(1, payload);
  const queueId = res.lastInsertRowid as number;

  let pending = dbService.getPendingWebhooks();
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].retry_count, 0);

  // 2. Mark as failed (Retry 1)
  // Backoff: 1^2 * 1000 = 1000ms
  dbService.markWebhookFailed(queueId);
  
  // Should NOT be pending immediately (next_retry is in future)
  pending = dbService.getPendingWebhooks();
  assert.strictEqual(pending.length, 0);

  // 3. Check status in DB directly
  const stmt = dbService['db'].prepare('SELECT * FROM webhook_queue WHERE id = ?');
  const record = stmt.get(queueId) as any;
  assert.strictEqual(record.retry_count, 1);
  assert.ok(record.next_retry > Date.now());

  // 4. Simulate Max Retries
  // Manually update to 5 retries
  dbService['db'].prepare('UPDATE webhook_queue SET retry_count = 5 WHERE id = ?').run(queueId);
  dbService.markWebhookFailed(queueId); // Should fail permanently

  const finalRecord = stmt.get(queueId) as any;
  assert.strictEqual(finalRecord.status, 'failed');
});
