# Helios ☀️

**Helios** is a high-performance, self-hosted sentinel for the Solana blockchain. It monitors accounts and programs in real-time, detecting on-chain events and dispatching them via reliable webhooks.

![Solana](https://img.shields.io/badge/Solana-Uncorrelated-blueviolet) ![License](https://img.shields.io/badge/License-MIT-green) ![Status](https://img.shields.io/badge/Status-Production%20Ready-success)

## ✨ Key Features

- **⚡ High-Throughput Batching:** Buffers events and flushes them in batches (up to 100 events/500ms).
- **🛡️ Bulletproof Reliability:** Hybrid architecture (WS + Polling) ensures no events are missed.
- **🧠 Intelligent Decoding (v2.0):** Integrated Anchor/Borsh support. Automatically decode account data and instructions into human-readable JSON.
- **💾 WAL-Mode Storage:** Optimized SQLite engine for high-speed event ingestion.
- **🔄 Smart Retries:** Exponential backoff system for failing webhook endpoints.
- **🐳 Docker Native:** Ready to deploy anywhere in seconds.

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- A Solana RPC/WSS Endpoint (e.g., Helius, QuickNode, or Alchemy)

### Installation

1.  **Clone the repo:**
    ```bash
    git clone https://github.com/your-username/helios.git
    cd helios
    ```

2.  **Install & Build:**
    ```bash
    npm install
    npm run build
    ```

3.  **Configure:**
    Create a `.env` file:
    ```env
    RPC_URL=https://api.mainnet-beta.solana.com
    WSS_URL=wss://api.mainnet-beta.solana.com
    WEBHOOK_URL=https://your-api.com/webhooks/solana
    WEBHOOK_SECRET=my_super_secret_key_123
    DB_PATH=./data/helios.db
    PORT=3000
    ```

4.  **Launch:**
    ```bash
    npm start
    ```

## 🔒 Security & Verification

Helios secures your webhooks using HMAC-SHA256 signatures.

1.  Set `WEBHOOK_SECRET` in your `.env` file.
2.  Helios will include a header `X-Helios-Signature` in every POST request.
3.  **Verify the signature** on your backend to ensure the request is legitimate.

**Node.js Verification Example:**
```javascript
const crypto = require('crypto');

function verifySignature(req, secret) {
  const signature = req.headers['x-helios-signature'];
  const payload = JSON.stringify(req.body); // Ensure raw body matches
  const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return hash === signature;
}
```

## 📨 Webhook Payloads

Helios sends events in **batches** (JSON Arrays) to reduce server load.

**Example Payload:**
```json
[
  {
    "id": 102,
    "type": "account_change",
    "address": "5QD...3s",
    "slot": 238192041,
    "timestamp": 1703084000000,
    "data": "{\"lamports\":1000000,\"data\":\"<BASE64>\",\"owner\":\"111...\"}"
  },
  {
    "id": 103,
    "type": "program_logs",
    "address": "9xQ...r2",
    "signature": "5zz...9AA",
    "data": "{\"logs\":[\"Program log: Instruction: Swap\"],\"err\":null}"
  }
]
```

## 🎮 CLI Usage

Helios comes with a powerful CLI to manage your watch list and IDLs.

```bash
# Add a watch target with an optional schema for decoding
helios add <ADDRESS> --type account --schema "MyAccountType"

# Link an IDL to a program for automatic instruction decoding
helios idl-add <PROGRAM_ID> ./path/to/idl.json

# List active sentinels & IDLs
helios list
helios idl-list
```

## 🐳 Docker Deployment

Run Helios as a background daemon:

```bash
docker build -t helios .
docker run -d \
  --name helios \
  --restart always \
  -p 3000:3000 \
  -v $(pwd)/data:/data \
  --env-file .env \
  helios
```

## 📊 Benchmarks

| Metric | Throughput |
| :--- | :--- |
| **Ingestion** | ~341 events/sec |
| **Delivery** | ~96 events/sec (Network bound) |

*Measured on standard cloud hardware using local loopback.*

## 🔮 Roadmap

Planned improvements include:
- **Advanced Filtering:** Rule-based engine (JSON Logic) to filter events before they hit your webhook.
- **Prometheus Metrics:** Integrated monitoring for webhook delivery rates and latency.
- **Transaction Enrichment:** Optional fetching of full transaction metadata for all events.