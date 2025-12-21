import request from 'supertest';
import express from 'express';
import { metricsRegistry } from '../src/services/metrics.js';
import { metrics } from '../src/services/metrics.js';
import assert from 'node:assert';
import { test } from 'node:test';

const app = express();
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

test('Metrics Endpoint - Returns Prometheus Format', async () => {
  // Simulate some activity
  metrics.eventsIngested.inc({ type: 'account', source: 'websocket' });
  metrics.bufferDepth.set(5);

  const res = await request(app).get('/metrics');
  
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /helios_events_ingested_total/);
  assert.match(res.text, /helios_buffer_depth/);
  assert.match(res.text, /type="account"/);
});
