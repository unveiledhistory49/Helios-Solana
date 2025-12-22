import express from 'express';
import { Connection, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
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
  // 1. Calculate total amount from all deposit events in this batch
  let totalLamports = 0;
  const users: string[] = [];

  for (const event of events) {
    if (event.parsed && event.parsed.name === 'deposit') {
      const amount = event.parsed.args?.amount || 0;
      totalLamports += Number(amount);
      if (event.parsed.args?.user) {
        users.push(event.parsed.args.user);
      }
    }
  }

  if (totalLamports === 0) {
    console.log('⚠️ No valid deposit amounts found in batch. Skipping.');
    return { status: 'skipped', reason: 'no_deposits' };
  }

  console.log(`📦 Collective DCA Triggered!`);
  console.log(`   Total Users: ${users.length}`);
  console.log(`   Total Amount: ${totalLamports / LAMPORTS_PER_SOL} SOL`);
  console.log(`   Batch Composition: ${JSON.stringify(users)}`);

  // 2. SIMULATION: Construct a call to 'execute_collective_dca'
  // In a real implementation, we would use Anchor's Program API here.
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: executorKeypair.publicKey,
      toPubkey: new PublicKey('6uwQNHMkDsrNQw8y1XNBAHT5xYzh9YN4sdMD2tw6C1fi'), // Vault Program ID
      lamports: 1000, // Small fee for simulation
    })
  );

  let blockhash;
  try {
     const { blockhash: bh } = await connection.getLatestBlockhash();
     blockhash = bh;
  } catch (e) {
     blockhash = '11111111111111111111111111111111';
  }
  
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = executorKeypair.publicKey;
  transaction.sign(executorKeypair);
  
  // 3. Log the "Collective Action"
  console.log(`🚀 [EXECUTOR] Executed collective DCA for ${totalLamports} lamports across ${users.length} users.`);
  console.log(`📜 Signature: simulated_sig_${Date.now()}`);

  return {
    signature: `simulated_sig_${Date.now()}`,
    totalLamports,
    userCount: users.length
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
