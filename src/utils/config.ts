import dotenv from 'dotenv';
import type { Config } from '../types/config.js';

dotenv.config();

export const config: Config = {
  rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  wssUrl: process.env.WSS_URL || 'wss://api.mainnet-beta.solana.com',
  dbPath: process.env.DB_PATH || './events.db',
  ...(process.env.WEBHOOK_URL ? { webhookUrl: process.env.WEBHOOK_URL } : {}),
  ...(process.env.WEBHOOK_SECRET ? { webhookSecret: process.env.WEBHOOK_SECRET } : {}),
  port: parseInt(process.env.PORT || '3000', 10),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '30000', 10),
  enrichTransactions: process.env.ENRICH_TRANSACTIONS === 'true',
};
