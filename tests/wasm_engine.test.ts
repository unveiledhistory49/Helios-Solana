import assert from 'node:assert';
import test, { describe, it, before } from 'node:test';
import path from 'path';
import { fileURLToPath } from 'url';
import { WasmEngine } from '../src/services/wasm_engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('WasmEngine Integration', () => {
  let engine: WasmEngine;
  const wasmPath = path.resolve(__dirname, '../examples/basic_transform/target/wasm32-unknown-unknown/release/basic_transform.wasm');

  before(async () => {
    engine = new WasmEngine();
    await engine.loadModule(wasmPath);
  });

  it('should transform a simple JSON object', () => {
    const input = JSON.stringify({ name: "Helios", type: "system_test" });
    const result = engine.runTransform(input);
    
    assert.ok(result, "Result should not be null");
    
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.name, "Helios");
    assert.strictEqual(parsed.wasm_processed, true);
    assert.strictEqual(parsed.processed_at, "Helios WASM");
  });

  it('should handle empty objects', () => {
    const input = "{}";
    const result = engine.runTransform(input);
    const parsed = JSON.parse(result!);
    assert.strictEqual(parsed.wasm_processed, true);
  });
});
