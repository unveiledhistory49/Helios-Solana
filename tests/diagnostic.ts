import { BorshCoder } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

const idl: any = { 
  version: "0.1.0", 
  name: "test", 
  instructions: [], 
  accounts: [
    {
      name: "TestAccount",
      type: {
        kind: "struct",
        fields: [{ name: "data", type: "u64" }]
      }
    }
  ] 
};

try {
  console.log('Testing BorshCoder construction...');
  const coder = new BorshCoder(idl);
  console.log('BorshCoder OK');
  
  // Test if it can decode (just a mock check)
  console.log('BorshCoder accounts:', Object.keys(coder.accounts));
} catch (err) {
  console.error('DIAGNOSTIC FAILURE:', err);
}
