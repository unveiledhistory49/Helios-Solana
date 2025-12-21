export interface Config {
  rpcUrl: string;
  wssUrl: string;
  dbPath: string;
  webhookUrl?: string;
  webhookSecret?: string;
  port: number;
  pollIntervalMs: number;
  enrichTransactions: boolean;
}

export interface WatchTarget {
  address: string;
  type: 'account' | 'program';
  label?: string;
}
