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
      type: 'program_logs',
      parsed: {
        name: 'deposit',
        args: { amount: 100000000 } // 0.1 SOL
      }
    });

    // Call 1-4: Should return null (suppressed)
    for (let i = 0; i < 4; i++) {
      const result = engine.runTransform(payload);
      assert.strictEqual(result, null, `Call ${i+1} should be suppressed`);
    }

    // Call 5: Should reach threshold (0.5 SOL or 5 counts) and return payload
    const finalResult = engine.runTransform(payload);
    assert.ok(finalResult, 'Call 5 should trigger and return payload');
    const parsed = JSON.parse(finalResult);
    assert.strictEqual(parsed.type, 'program_logs');
  });
});
