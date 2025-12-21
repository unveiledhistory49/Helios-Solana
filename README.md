# Helios ☀️

**Helios** is a high-performance, self-hosted sentinel for the Solana blockchain. It monitors accounts and programs in real-time, detecting on-chain events and dispatching them via reliable webhooks.

![Solana](https://img.shields.io/badge/Solana-Uncorrelated-blueviolet) ![License](https://img.shields.io/badge/License-MIT-green) ![Status](https://img.shields.io/badge/Status-Production%20Ready-success)

## ✨ Key Features

- **⚡ High-Throughput Batching:** Buffers events and flushes them in batches (up to 100 events/500ms).
- **🛡️ Bulletproof Reliability:** Hybrid architecture (WS + Polling) ensures no events are missed.
- **🧠 Intelligent Decoding (v2.0):** Integrated Anchor/Borsh support. Automatically decode account data and instructions into human-readable JSON.
- **🔍 Advanced Filtering (v2.0):** Filter noise at the source using JSON Logic. Only receive events that match your specific criteria.
- **📈 Observability (v2.0):** Native Prometheus metrics endpoint (`/metrics`) for monitoring system health.
- **🔗 Transaction Enrichment (v2.0):** Optionally fetch and include full transaction metadata in your webhooks.
- **💾 WAL-Mode Storage:** Optimized SQLite engine capable of ingesting **1400+ events/sec**.
- **🔄 Smart Retries:** Exponential backoff system for failing webhook endpoints.
- **🐳 Docker Native:** Ready to deploy anywhere in seconds.

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- A Solana RPC/WSS Endpoint (e.g., Helius, QuickNode, or Alchemy)

### Installation

1.  **Clone and Install:**
    ```bash
    git clone https://github.com/charlie0x-sol/Helios-Solana.git
    cd Helios-Solana
    npm install
    npm run build
    ```

2.  **Configure Environment:**
    Create a `.env` file:
    ```env
    RPC_URL=https://api.mainnet-beta.solana.com
    WSS_URL=wss://api.mainnet-beta.solana.com
    WEBHOOK_URL=https://your-api.com/webhook
    WEBHOOK_SECRET=your_hmac_secret
    DB_PATH=./events.db
    PORT=3000
    ENRICH_TRANSACTIONS=true
    ```

3.  **Launch:**
    ```bash
    npm start
    ```

---

## 🎮 CLI Usage

Helios provides a powerful CLI to manage your watch list and decoding logic.

```bash
# Add a watch target (Basic)
helios add <ADDRESS> --type account --label "Treasury"

# Add with Decoding (Specify Account Type from IDL)
helios add <ADDRESS> --type account --schema "UserStats"

# Add with Filtering (Only alert if lamports > 1 SOL)
helios add <ADDRESS> --filter '{" > ": [{"var": "lamports"}, 1000000000]}'

# Link an IDL for Program Instruction decoding
helios idl-add <PROGRAM_ID> ./path/to/idl.json

# List active sentinels & IDLs
helios list
helios idl-list

# Remove a target
helios remove <ADDRESS>
```

---

## 🔍 Advanced Filtering

Helios uses [JSON Logic](https://jsonlogic.com/) for filtering. You can filter based on any field in the payload, including `parsed` data.

**Example: Filter for a specific instruction name in a program logs subscription:**
```json
{
  "==": [{"var": "parsed.name"}, "exchange"]
}
```

---

## 📨 Webhook Payloads (v2.0)

Helios sends events in **batches** (JSON Arrays). If an IDL and Schema are provided, the `parsed` field will contain the decoded data.

**Example Payload:**
```json
[
  {
    "id": 102,
    "type": "account_change",
    "address": "5QD...3s",
    "slot": 238192041,
    "timestamp": 1703084000000,
    "data": "{\"lamports\":1000000000,\"data\":\"<BASE64>\",\"owner\":\"111...\"}",
    "parsed": {
      "value": 500,
      "owner": "A8p...2d"
    }
  }
]
```

---

## 📊 Observability

Helios exposes a Prometheus-compatible metrics endpoint at `http://localhost:3000/metrics`.

**Key Metrics:**
- `helios_events_ingested_total`: Total events processed (labels: `type`, `source`).
- `helios_webhook_delivery_duration_seconds`: Latency distribution of webhook dispatches.
- `helios_buffer_depth`: Current number of events waiting for flush.
- `helios_active_subscriptions`: Count of active watch targets.

---

## 🐳 Docker Deployment

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

---

## 🧪 Testing

```bash
# Run full suite (System + Unit + Load)
npm test

# Run specific performance tests
node --import tsx --test tests/load_test.ts
```

## 🔮 Roadmap

Planned improvements include:
- **Web UI:** A lightweight dashboard to manage subscriptions and view event history.
- **Multicast Webhooks:** Ability to send events to multiple different URLs per subscription.
