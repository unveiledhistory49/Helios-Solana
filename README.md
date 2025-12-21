# Helios ☀️

**Helios** is a high-performance, self-hosted sentinel for the Solana blockchain. It monitors accounts and programs in real-time, detecting on-chain events and dispatching them via reliable webhooks.

![Solana](https://img.shields.io/badge/Solana-Uncorrelated-blueviolet) ![License](https://img.shields.io/badge/License-MIT-green) ![Status](https://img.shields.io/badge/Status-Production%20Ready-success)

## ✨ Key Features

- **⚡ High-Throughput Batching:** Buffers events and flushes them in batches (up to 100 events/500ms).
- **🛡️ Bulletproof Reliability:** Hybrid architecture (WS + Polling) ensures no events are missed.
- **🧠 Intelligent Decoding (v2.0):** Integrated Anchor/Borsh support. Automatically decode account data and instructions into human-readable JSON.
- **🔍 Advanced Filtering (v2.0):** Filter noise at the source using JSON Logic. Only receive events that match your specific criteria (e.g., "Amount > 1000 SOL").
- **📈 Observability (v2.0):** Native Prometheus metrics endpoint (`/metrics`) for monitoring ingestion rates, latency, and system health.
- **💾 WAL-Mode Storage:** Optimized SQLite engine for high-speed event ingestion.
- **🔄 Smart Retries:** Exponential backoff system for failing webhook endpoints.
- **🐳 Docker Native:** Ready to deploy anywhere in seconds.

## 🚀 Quick Start
...
## 🎮 CLI Usage

Helios comes with a powerful CLI to manage your watch list and IDLs.

```bash
# Add a watch target with an optional schema for decoding
helios add <ADDRESS> --type account --schema "MyAccountType"

# Add a filtered subscription (e.g., only alerts for > 1000 Lamports)
helios add <ADDRESS> --filter '{" > ": [{"var": "lamports"}, 1000]}'

# Link an IDL to a program for automatic instruction decoding
helios idl-add <PROGRAM_ID> ./path/to/idl.json

# List active sentinels & IDLs
helios list
helios idl-list
```

## 📊 Observability

Helios exposes a Prometheus-compatible metrics endpoint at `http://localhost:3000/metrics`.

**Key Metrics:**
- `helios_events_ingested_total`: Total events processed.
- `helios_webhook_delivery_duration_seconds`: Latency distribution.
- `helios_buffer_depth`: Current events waiting for flush.

## 🐳 Docker Deployment
...
## 📊 Benchmarks

| Metric | Throughput |
| :--- | :--- |
| **Ingestion** | ~1490 events/sec |
| **Delivery** | ~96 events/sec (Network bound) |

*Measured on standard cloud hardware using local loopback.*

## 🧪 Testing

Helios includes a comprehensive test suite covering unit logic, database integrity, and system integration.

```bash
# Run all tests
npm test

# Run specific suites
node --import tsx --test tests/v2_monitor.test.ts
node --import tsx --test tests/load_test.ts
```

## 🔮 Roadmap

Planned improvements include:
- **Transaction Enrichment:** Optional fetching of full transaction metadata for all events.