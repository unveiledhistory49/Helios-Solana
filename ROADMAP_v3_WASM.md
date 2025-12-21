# Helios v3.0: WASM Transformers Roadmap

## 🎯 Objective
Empower developers to inject custom logic into the Helios event pipeline. Users can upload WebAssembly (WASM) modules to **filter**, **transform**, or **anonymize** data *before* it is dispatched to webhooks.

## 🏗️ Architectural Design

### The "Guest" (WASM Module)
To ensure compatibility, user-provided WASM modules must adhere to a strict **ABI (Application Binary Interface)**.

**Required Exports:**
1.  `alloc(size: i32) -> i32`: Allocates memory within the WASM instance for input data.
2.  `transform(ptr: i32, len: i32) -> i64`: The main logic function.
    *   **Input:** Pointer and length of the UTF-8 JSON string (the event).
    *   **Output:** A packed `u64` containing the result pointer (high 32 bits) and result length (low 32 bits).

### The "Host" (Helios Node.js)
Helios will serve as the WASM runtime host, handling:
1.  **Loading:** Reading `.wasm` files from disk.
2.  **Memory Management:** Writing the event JSON to WASM memory and reading the transformed result back.
3.  **Sandboxing:** Executing the code safely (WASM is sandboxed by design).

---

## 📅 Execution Phases

### Phase 1: The WASM Runtime (Core) - ✅ Completed
- [x] Create `src/services/wasm_engine.ts`.
- [x] Implement `loadModule(path: string)` to compile and instantiate WASM.
- [x] Implement `runTransform(instance, payload: string)` to handle the memory shuffling (Host -> Guest -> Host).
- [x] Create a "Reference Transformer" (e.g., simple Rust or AssemblyScript project) for testing.

### Phase 2: Pipeline Integration - ✅ Completed
- [x] Update `src/types/config.ts` to include `transformerPath` in `Subscription`.
- [x] Update `src/db/database.ts` schema to store this new field.
- [x] Modify `src/services/monitor.ts` to check for transformers.
- [x] If a transformer exists, route the payload through `WasmEngine` before adding to the dispatch queue.

### Phase 3: CLI Support - ✅ Completed
- [x] Update `helios add` command to accept `--transformer <path>`.
- [x] Validate that the provided file exists and is a valid WASM binary.

### Phase 4: Testing & Hardening - ✅ Completed
- [x] Unit Test: Verify memory writing/reading logic is leak-free and accurate.
- [x] Integration Test: End-to-end test with a real WASM file modifying an event.
- [x] Error Handling: Ensure bad WASM (panics, infinite loops) doesn't crash the main Helios process.

---

## 🛠️ Technical Stack
*   **Runtime:** Node.js native `WebAssembly` API.
*   **Reference Language:** Rust (compiled to `wasm32-unknown-unknown`).
