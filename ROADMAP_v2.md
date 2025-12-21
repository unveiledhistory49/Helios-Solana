# Helios v2.0 Build Roadmap - COMPLETED

This document outlines the strategic development path for **Helios v2.0**. The primary goal was to evolve Helios from a raw data monitor into an intelligent, developer-centric platform that provides parsed, actionable, and observable blockchain data.

## 📅 Phased Execution Plan

### Phase 1: Intelligence (Transaction & Data Decoding) - ✅ Completed
- [x] IDL Registry
- [x] Auto-Fetch (On-demand)
- [x] Parser Engine (Anchor/Borsh)
- [x] Payload Enrichment

### Phase 2: Efficiency (Advanced Event Filtering) - ✅ Completed
- [x] Schema Update
- [x] Logic Engine (JSON Logic)
- [x] Pipeline Integration

### Phase 3: Reliability & Scale (Observability) - ✅ Completed
- [x] Metrics Core (Prometheus)
- [x] Key Metrics (Ingestion, Latency, Buffer)
- [x] API Endpoint (/metrics)

### Phase 4: Quality Assurance (Testing & Hardening) - ✅ Completed
- [x] Unit Tests
- [x] Mocking (MockConnection)
- [x] Load Testing (~1500 events/sec)

### Phase 5: Transaction Enrichment - ✅ Completed
- [x] Optional full transaction metadata fetching
- [x] Enrichment field in webhook payload

### Phase 6: Multicast Webhooks (v2.1) - ✅ Completed
- [x] Schema support for multiple URLs per subscription
- [x] Multicast dispatch logic
- [x] Per-URL retry queues
- [x] CLI support (`--webhook`)

---

## 🔮 Future Roadmap (v3.0)

- **Web UI:** A lightweight dashboard to manage subscriptions and view event history.
- **WASM Transformers:** Allow users to upload custom WASM modules to transform event data before delivery.