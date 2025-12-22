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
function verifySignature(req) {
    if (!HELIOS_SECRET)
        return true; // Security disabled if no secret
    const signature = req.headers['x-helios-signature'];
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
        console.log(`🔍 Processing event type: ${event.type} for address: ${event.address}`);
        let message = '';
        const shortAddr = `${event.address.slice(0, 4)}...${event.address.slice(-4)}`;
        const explorerUrl = `https://solscan.io/account/${event.address}`;
        if (event.type === 'account_change' || event.type === 'poll_change') {
            const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            message = `🔔 **Account Update** (${event.type})\nAddress: \`${shortAddr}\`\nLamports: \`${(data.lamports / 1e9).toFixed(4)} SOL\`\n[View on Solscan](${explorerUrl})`;
        }
        else if (event.type === 'program_logs') {
            message = `📜 **Program Logs**\nProgram: \`${shortAddr}\`\nSignature: \`${event.signature.slice(0, 8)}...\`\n[View Transaction](https://solscan.io/tx/${event.signature})`;
        }
        // 2. Send to Discord
        if (DISCORD_WEBHOOK_URL) {
            try {
                await axios.post(DISCORD_WEBHOOK_URL, { content: message });
            }
            catch (err) {
                console.error('Failed to send to Discord:', err.message);
            }
        }
        else {
            console.log('------------------------------------------------');
            console.log('📢 DISCORD MOCK MESSAGE:');
            console.log(message);
            console.log('------------------------------------------------');
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
//# sourceMappingURL=discord-bot.js.map