import { PublicKey, AccountInfo, Context, Logs } from '@solana/web3.js';
import { EventEmitter } from 'events';

export class MockConnection extends EventEmitter {
  private accountListeners: Map<number, { pubkey: PublicKey, callback: any }> = new Map();
  private logListeners: Map<number, { pubkey: PublicKey, callback: any }> = new Map();
  private listenerCounter = 0;
  
  // Storage for mock data
  public accounts: Map<string, AccountInfo<Buffer>> = new Map();
  public transactions: Map<string, any> = new Map();

  constructor(endpoint: string, config?: any) {
    super();
  }

  onAccountChange(pubkey: PublicKey, callback: (info: AccountInfo<Buffer>, context: Context) => void): number {
    const id = ++this.listenerCounter;
    this.accountListeners.set(id, { pubkey, callback });
    return id;
  }

  removeAccountChangeListener(id: number): Promise<void> {
    this.accountListeners.delete(id);
    return Promise.resolve();
  }

  onLogs(pubkey: PublicKey, callback: (logs: Logs, context: Context) => void): number {
    const id = ++this.listenerCounter;
    this.logListeners.set(id, { pubkey, callback });
    return id;
  }

  removeOnLogsListener(id: number): Promise<void> {
    this.logListeners.delete(id);
    return Promise.resolve();
  }

  async getAccountInfoAndContext(pubkey: PublicKey): Promise<{ context: Context, value: AccountInfo<Buffer> | null }> {
    const account = this.accounts.get(pubkey.toBase58()) || null;
    return {
      context: { slot: 1000 },
      value: account
    };
  }

  async getParsedTransaction(signature: string): Promise<any> {
    return this.transactions.get(signature) || null;
  }

  // --- Helper methods to simulate network events ---

  simulateAccountChange(pubkey: PublicKey, info: AccountInfo<Buffer>, slot: number) {
    this.accounts.set(pubkey.toBase58(), info);
    for (const { pubkey: p, callback } of this.accountListeners.values()) {
      if (p.equals(pubkey)) {
        callback(info, { slot });
      }
    }
  }

  simulateLogs(pubkey: PublicKey, logs: Logs, slot: number) {
    for (const { pubkey: p, callback } of this.logListeners.values()) {
      if (p.equals(pubkey)) {
        callback(logs, { slot });
      }
    }
  }
}
