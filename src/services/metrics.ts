import client from 'prom-client';

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
  app: 'helios-solana'
});

// Enable the collection of default metrics (gc, memory, etc.)
client.collectDefaultMetrics({ register });

export const metrics = {
  eventsIngested: new client.Counter({
    name: 'helios_events_ingested_total',
    help: 'Total number of events ingested from Solana',
    labelNames: ['type', 'source'], // type: account/log, source: ws/poll
    registers: [register]
  }),

  webhookDuration: new client.Histogram({
    name: 'helios_webhook_delivery_duration_seconds',
    help: 'Duration of webhook delivery requests in seconds',
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [register]
  }),

  webhookFailures: new client.Counter({
    name: 'helios_webhook_failures_total',
    help: 'Total number of failed webhook delivery attempts',
    labelNames: ['reason'],
    registers: [register]
  }),

  bufferDepth: new client.Gauge({
    name: 'helios_buffer_depth',
    help: 'Current number of events in the internal buffer waiting for flush',
    registers: [register]
  }),

  activeSubscriptions: new client.Gauge({
    name: 'helios_active_subscriptions',
    help: 'Number of active subscriptions',
    registers: [register]
  })
};

export const metricsRegistry = register;
