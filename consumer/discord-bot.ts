import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.CONSUMER_PORT || 4000;
const HELIOS_SECRET = process.env.WEBHOOK_SECRET;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

function verifySignature(req: express.Request) {
  if (!HELIOS_SECRET) return true; // Security disabled if no secret
  
  const signature = req.headers['x-helios-signature'] as string;
  const payload = JSON.stringify(req.body);
  const hash = crypto.createHmac('sha256', HELIOS_SECRET).update(payload).digest('hex');
  
  return hash === signature;
}

app.post('/webhook', async (req, res) => {
  // 1. Security Check
  if (!verifySignature(req)) {
    console.error('❌ Invalid signature received!');
    return res.sendStatus(401);
  }

  const events = req.body;
  console.log(`📦 Received batch of ${events.length} events from Helios.`);

  for (const event of events) {
    let message = '';
    const shortAddr = `${event.address.slice(0, 4)}...${event.address.slice(-4)}`;
    const explorerUrl = `https://solscan.io/account/${event.address}`;

    if (event.type === 'account_change') {
      const data = JSON.parse(event.data);
      message = `🔔 **Account Update**\nAddress: 
${shortAddr}
Lamports: 
${(data.lamports / 1e9).toFixed(4)} SOL
[View on Solscan](${explorerUrl})`; 
    } else if (event.type === 'program_logs') {
      message = `📜 **Program Logs**\nProgram: 
${shortAddr}
Signature: 
${event.signature.slice(0, 8)}...
[View Transaction](https://solscan.io/tx/${event.signature})`;
    }

    // 2. Send to Discord
    if (DISCORD_WEBHOOK_URL) {
      try {
        await axios.post(DISCORD_WEBHOOK_URL, { content: message });
      } catch (err: any) {
        console.error('Failed to send to Discord:', err.message);
      }
    } else {
      console.log('📝 Discord Webhook URL not set. Logging message instead:');
      console.log(message);
    }
  }

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🚀 Helios Discord Bot listening on port ${PORT}`);
  if (!DISCORD_WEBHOOK_URL) {
    console.log('⚠️  Note: DISCORD_WEBHOOK_URL is missing. I will log to console instead.');
  }
});
