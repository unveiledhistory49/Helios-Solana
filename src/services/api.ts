import express from 'express';
import { config } from '../utils/config.js';
import { dbService } from '../db/database.js';
import { monitorService } from '../services/monitor.js';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/events', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const events = dbService.getEvents(limit, offset);
  res.json(events);
});

app.get('/subscriptions', (req, res) => {
  const subs = dbService.getSubscriptions();
  res.json(subs);
});

app.post('/subscriptions', async (req, res) => {
  const { address, type, label } = req.body;
  if (!address || !type) {
    return res.status(400).json({ error: 'Address and type are required' });
  }

  try {
    await monitorService.addSubscription(address, type, label);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export function startServer() {
  return app.listen(config.port, () => {
    console.log(`API Server running on port ${config.port}`);
  });
}
