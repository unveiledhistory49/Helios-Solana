import { BorshCoder, type Idl } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';
import { dbService } from '../db/database.js';
import { config } from '../utils/config.js';

export class DecoderService {
  private connection: Connection;
  private coders: Map<string, BorshCoder> = new Map();

  constructor() {
    this.connection = new Connection(config.rpcUrl);
  }

  async getCoder(programId: string): Promise<BorshCoder | null> {
    if (this.coders.has(programId)) {
      return this.coders.get(programId)!;
    }

    // 1. Try to load from DB
    let idl = dbService.getIdl(programId);

    // 2. If not in DB, try to fetch from on-chain (Note: this is simplified, Anchor fetchIdl might still have issues)
    if (!idl) {
      // For now, we rely on IDLs being added manually or through a separate process
      // because the full Anchor Program/Provider stack is proving unstable in this environment.
      return null;
    }

    try {
      const coder = new BorshCoder(idl as Idl);
      this.coders.set(programId, coder);
      return coder;
    } catch (err) {
      console.error(`Failed to initialize coder for ${programId}:`, err);
      return null;
    }
  }

  async decodeAccountData(programId: string, accountName: string, dataBase64: string) {
    const coder = await this.getCoder(programId);
    if (!coder) return null;

    try {
      const data = Buffer.from(dataBase64, 'base64');
      return coder.accounts.decode(accountName, data);
    } catch (err) {
      return null;
    }
  }

  async decodeInstruction(programId: string, dataBase64: string) {
    const coder = await this.getCoder(programId);
    if (!coder) return null;

        try {

          const data = Buffer.from(dataBase64, 'base64');

          return coder.instruction.decode(data);

        } catch (err) {

          return null;

        }

      }

    

      async decodeEvent(programId: string, log: string) {

        const coder = await this.getCoder(programId);

        if (!coder) return null;

    

        try {

          // Anchor events usually start with "Program data: " followed by base64

          if (log.startsWith('Program data: ')) {

            const data = log.replace('Program data: ', '');

            return coder.events.decode(data);

          }

          return null;

        } catch (err) {

          return null;

        }

      }

    }

    

    export const decoderService = new DecoderService();

    