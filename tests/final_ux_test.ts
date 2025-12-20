import { MonitorService } from '../src/services/monitor.js';
import { config } from '../src/utils/config.js';
import { PublicKey } from '@solana/web3.js';
import { spawn } from 'child_process';

const HELIOS_SECRET = 'helios-production-secret';
const CONSUMER_PORT = 4001;

// 1. Configure Helios
(config as any).webhookUrl = `http://localhost:${CONSUMER_PORT}/webhook`;
(config as any).webhookSecret = HELIOS_SECRET;

async function runSystemTest() {
  console.log('🚀 Starting Full System UX Test');
  
  // 2. Start the Discord Consumer in a sub-process
  console.log('📡 Starting Discord Consumer...');
  const consumer = spawn('npx', ['tsx', 'consumer/discord-bot.ts'], {
    env: { ...process.env, CONSUMER_PORT: CONSUMER_PORT.toString(), WEBHOOK_SECRET: HELIOS_SECRET }
  });

  consumer.stdout.on('data', (data) => console.log(`[Consumer] ${data}`));
  consumer.stderr.on('data', (data) => console.error(`[Consumer Error] ${data}`));

  // Wait for consumer to warm up
  await new Promise(r => setTimeout(r, 2000));

  // 3. Start Helios
  const monitor = new MonitorService();
  await monitor.start();
  const monitorAny = monitor as any;

  // 4. Simulate some on-chain events
  console.log('\n⛓️  Simulating On-Chain Activity...');
  
  const targets = [
    { addr: 'So11111111111111111111111111111111111111112', label: 'Wrapped SOL' },
    { addr: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', label: 'USDC' }
  ];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]!;
    await monitorAny.handleAccountChange(
      { address: target.addr, type: 'account' },
      {
        lamports: 100 * 1e9, 
        data: Buffer.from('abc'), 
        owner: new PublicKey(target.addr),
        executable: false 
      },
      { slot: 1000 + i },
      'websocket'
    );
  }

  // 5. Trigger the flush
  console.log('📦 Flushing batch to Consumer...');
  await monitorAny.flushBuffer();

  // Wait for consumer to process
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n✅ System Test Complete.');
  
  // Cleanup
  monitor.stop();
  consumer.kill();
  process.exit(0);
}

runSystemTest().catch(console.error);
