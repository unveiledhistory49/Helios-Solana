import express from 'express';
import { Connection, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import dotenv from 'dotenv';
import bs58 from 'bs58';

dotenv.config();

const app = express();
app.use(express.json());

export { app }; // Export for testing

const PORT = process.env.EXECUTOR_PORT || 4002;
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';

// Initialize Solana Connection
const connection = new Connection(RPC_URL, 'confirmed');

// Load Executor Wallet
let executorKeypair: Keypair;
if (process.env.EXECUTOR_PRIVATE_KEY) {
  try {
    // Try decoding base58 first
    executorKeypair = Keypair.fromSecretKey(bs58.decode(process.env.EXECUTOR_PRIVATE_KEY));
  } catch {
    // Fallback to JSON array format
    executorKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.EXECUTOR_PRIVATE_KEY))
    );
  }
} else {
  console.warn('⚠️  No EXECUTOR_PRIVATE_KEY found. Generating a random ephemeral wallet.');
  executorKeypair = Keypair.generate();
}

console.log(`🔑 Executor Public Key: ${executorKeypair.publicKey.toBase58()}`);

export async function processBatch(events: any[]) {
  const batchValue = events.length * 10; // Mock logic
  console.log(`📦 Processing Batch: ${events.length} events (Approx Value: $${batchValue})`);

  // SIMULATION: Construct a dummy transaction
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: executorKeypair.publicKey,
      toPubkey: executorKeypair.publicKey, // Self-transfer
      lamports: 1000,
    })
  );

  // We need a blockhash, but for unit testing we might want to mock connection
  // For now, let's just fetch it if we can, or use a dummy if testing
  let blockhash;
  try {
     const { blockhash: bh } = await connection.getLatestBlockhash();
     blockhash = bh;
  } catch (e) {
     console.warn("⚠️ Could not fetch blockhash (network down?), using dummy for test");
     blockhash = '11111111111111111111111111111111'; // Dummy
  }
  
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = executorKeypair.publicKey;

  transaction.sign(executorKeypair);
  
  return {
    signature: 'mock_signature', // In real life we'd broadcast
    signedTx: transaction
  };
}

export let lastBatch: any[] | null = null;

app.post('/webhook', async (req, res) => {
  console.log('⚡ Received Batch Trigger from Helios');
  
  const events = req.body;
  if (!Array.isArray(events) || events.length === 0) {
    console.log('❌ Empty or invalid event batch.');
    return res.status(400).send('Invalid payload');
  }
  
  lastBatch = events;

  try {
    const result = await processBatch(events);
    console.log(`✅ [SIMULATION] Transaction signed. Ready to broadcast.`);
    res.status(200).json({ status: 'executed', batchSize: events.length, ...result });
  } catch (error: any) {
    console.error(`❌ Execution Failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

import { pathToFileURL } from 'url';

// ... (existing code)

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    app.listen(PORT, () => {
    console.log(`🤖 Executor Service running on port ${PORT}`);
    console.log(`   Target RPC: ${RPC_URL}`);
    });
}
