# Micro-Transaction Batching Service Architecture

This document outlines the architecture for building a **Collective DCA (Dollar Cost Averaging) Engine** that batches small user transactions into single, cost-effective on-chain operations.

It utilizes the existing **Helios** project as the event monitoring infrastructure ("The Observer") and proposes two new components: "The Vault" (Smart Contract) and "The Executor" (Off-chain Service).

---

## 🏗️ System Overview

The system creates a loop where users deposit funds, Helios detects the deposits and tracks the batch state, and an Executor service performs the swap once a threshold is reached.

### 1. The Vault (Solana Smart Contract)
*   **Role:** Custody of user funds and accounting.
*   **Technology:** Rust, Anchor Framework.
*   **Key Instructions:**
    *   `deposit(amount)`: User transfers USDC to the Vault PDA. Updates user's internal balance.
    *   `execute_batch(amount, destination)`: Callable only by the Executor. Withdraws pooled funds to a DEX for swapping.
    *   `distribute(proof)`: Updates user balances after the swap is complete.

### 2. The Observer (Helios + WASM)
*   **Role:** Monitoring the Vault and managing batch logic.
*   **Technology:** Helios (Current Project) + Custom Rust WASM Module.
*   **Functionality:**
    *   Watches the **Vault Program** for `Deposit` events.
    *   **WASM Logic:**
        *   Maintains a state of `total_accumulated_usdc`.
        *   Filters out events until `total_accumulated_usdc >= THRESHOLD` (e.g., $1,000).
        *   Only triggers a webhook when the batch is ready to fill.

### 3. The Executor (Off-Chain Service)
*   **Role:** Transaction construction and execution.
*   **Technology:** Node.js/TypeScript (Evolution of `consumer/`), Jupiter API (for swaps).
*   **Functionality:**
    *   Receives "Batch Ready" webhook from Helios.
    *   Fetches the best route from Jupiter Aggregator.
    *   Constructs a transaction:
        1.  `Vault::withdraw_to_executor()`
        2.  `Jupiter::swap(USDC -> SOL)`
        3.  `Vault::distribute_sol()`
    *   Signs and submits the transaction to the network.

---

## 🔄 Workflow

1.  **User Action:** User Alice deposits $10 USDC into the **Vault**.
2.  **Detection:** **Helios** detects the `Deposit` log.
3.  **Accumulation (WASM):**
    *   WASM reads current batch total.
    *   Adds $10.
    *   Checks: `Is Total >= $1000?`
    *   Result: `False`. Event is suppressed/logged but no webhook sent.
4.  **Batch Fill:** User Bob deposits $500, pushing total to $1,005.
    *   Result: `True`. **Helios** fires webhook to **Executor**.
5.  **Execution:** **Executor** receives signal, builds the batch swap transaction, and executes it on Solana.

---

## 🛣️ Implementation Roadmap

### Phase 1: The Executor Prototype (Backend)
- [ ] Refactor `consumer/discord-bot.ts` into `consumer/executor.ts`.
- [ ] Integrate `@solana/web3.js` to load a keypair.
- [ ] Implement a mock "Swap" function that just logs the intent to swap.

### Phase 2: The Vault (Smart Contract)
- [ ] Initialize a new Anchor project.
- [ ] Implement the `deposit` instruction.
- [ ] Emit specific events (`DepositEvent`) for Helios to track.

### Phase 3: The Brain (WASM Integration)
- [x] Write a Rust WASM module for Helios.
- [x] Implement state tracking (using an external KV store or stateless calculation based on chain data) to decide when to fire the webhook.
- [x] Deploy WASM module to Helios.

### Phase 4: Integration
- [x] Connect Executor to Mainnet/Devnet (Simulated).
- [x] Integrate Jupiter V6 API for real swaps (Simulated).
- [x] End-to-end testing with Helios watching the Devnet Vault (Simulated locally).
