import { test } from 'node:test';
import assert from 'node:assert';
import { WasmEngine } from '../src/services/wasm_engine.js';
import path from 'path';

test('Phase 3 - DCA WASM Logic', async (t) => {
  const engine = new WasmEngine();
  const wasmPath = path.resolve('transformer/dca_logic/target/wasm32-unknown-unknown/release/dca_logic.wasm');
  
  await engine.loadModule(wasmPath);

  await t.test('should accumulate amounts and only return payload when threshold reached', async () => {
    const payload = JSON.stringify({
      type: 'account_change',
      data: '{"amount": 100000000}' // 0.1 SOL
    });

    // Call 1-9: Should return null (suppressed)
    for (let i = 0; i < 9; i++) {
      const result = engine.runTransform(payload);
      assert.strictEqual(result, null, `Call ${i+1} should be suppressed`);
    }

    // Call 10: Should reach threshold (1.0 SOL) and return payload
    const finalResult = engine.runTransform(payload);
    assert.ok(finalResult, 'Call 10 should trigger and return payload');
    const parsed = JSON.parse(finalResult);
    assert.strictEqual(parsed.type, 'account_change');
  });
});
