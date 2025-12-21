# Helios v2.0 Build Roadmap

This document outlines the strategic development path for **Helios v2.0**. The primary goal is to evolve Helios from a raw data monitor into an intelligent, developer-centric platform that provides parsed, actionable, and observable blockchain data.

## 📅 Phased Execution Plan

### Phase 1: Intelligence (Transaction & Data Decoding) - ✅ Completed
**Goal:** Transform opaque Base64 data into human-readable JSON using IDLs (Interface Description Languages).

*   **Problem:** Currently, webhooks deliver raw Base64 strings. Developers must build their own decoding infrastructure to understand *what* happened (e.g., "Was this a swap or a transfer?").
*   **Solution:** Integrate Anchor/Borsh parsing directly into the ingestion pipeline.
*   **Technical Implementation:**
    *   [x] **IDL Registry:** Create a new database table `idls` to store fetched IDLs for program IDs.
    *   [x] **Auto-Fetch:** Implement a service to fetch IDLs from on-chain (using `AnchorProvider`) when a generic program subscription is added.
    *   [x] **Parser Engine:** Integrate `@coral-xyz/anchor` and `@solana/web3.js` layouts to attempt decoding `accountInfo.data` and transaction instruction data before the event is saved.
    *   [x] **Payload Enrichment:** Add a `parsed` field to the webhook JSON payload containing the decoded object.

### Phase 2: Efficiency (Advanced Event Filtering) - ✅ Completed
**Goal:** Reduce noise and bandwidth usage by allowing granular filtering logic at the source.

*   **Problem:** High-volume accounts (like DEX AMMs) generate thousands of events. Users often care about only a fraction (e.g., "Whale Alerts" > 1000 SOL).
*   **Solution:** Implement a logic engine to evaluate events against user-defined rules before dispatching.
*   **Technical Implementation:**
    *   [x] **Schema Update:** Add a `filter_rules` JSON column to the `subscriptions` table.
    *   [x] **Logic Engine:** Integrate `json-logic-js` to safely evaluate complex rules (e.g., `{"and": [{">": ["lamports", 1000000000]}, {"==": ["instruction", "mintTo"]}]}`).
    *   [x] **Pipeline Integration:** Insert a filtering step in `MonitorService` between data fetching and the Event Buffer.

### Phase 3: Reliability & Scale (Observability) - ✅ Completed
**Goal:** Provide production-grade visibility into the system's health and performance.

*   **Problem:** "Is it working?" currently requires checking logs. There is no historical metric for ingestion rates or delivery failures.
*   **Solution:** Expose a Prometheus-compatible metrics endpoint.
*   **Technical Implementation:**
    *   [x] **Metrics Core:** Integrate `prom-client`.
    *   [x] **Key Metrics:**
        *   `helios_events_ingested_total` (Counter, labels: type, source)
        *   `helios_webhook_delivery_duration_seconds` (Histogram)
        *   `helios_webhook_failures_total` (Counter, labels: reason)
        *   `helios_buffer_depth` (Gauge)
        *   `helios_active_subscriptions` (Gauge)
    *   [x] **API Endpoint:** Expose `GET /metrics` on the Express server.

### Phase 4: Quality Assurance (Testing & Hardening) - ✅ Completed
**Goal:** Ensure stability across edge cases and long-running sessions.

*   **Problem:** Current testing relies on a single "happy path" integration script.
*   **Solution:** Establish a rigorous unit and property-based testing suite.
*   **Technical Implementation:**
    *   [x] **Unit Tests:**
        *   `MonitorService`: Test reconnection logic, polling fallback, and buffer flushing.
        *   `DatabaseService`: Test concurrent writes and queue retrieval ordering.
    *   [x] **Mocking:** Create a `MockConnection` for Solana Web3 to simulate RPC errors and slot skipping without a real network.
    *   [x] **Load Testing:** Script to simulate 500+ events/sec to verify SQLite WAL mode performance and backpressure handling.

---

## 🏗️ Architecture Changes

### Database Schema (Proposed)

```sql
-- New table for Program IDLs
CREATE TABLE idls (
  program_id TEXT PRIMARY KEY,
  idl_json TEXT NOT NULL,
  updated_at INTEGER
);

-- Update Subscriptions for Filters
ALTER TABLE subscriptions ADD COLUMN filter_rules TEXT; -- JSON Logic string
```

### Webhook Payload v2 (Proposed)

```json
{
  "id": 105,
  "type": "account_change",
  "address": "EoT...2d",
  "parsed": {
    "instruction": "transfer",
    "source": "A...",
    "destination": "B...",
    "amount": 5000000000
  },
  "raw": {
    "lamports": 5050000000,
    "data": "BASE64_STRING...",
    "owner": "Tokenkeg..."
  }
}
```
