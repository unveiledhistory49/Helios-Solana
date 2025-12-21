import jsonLogic from 'json-logic-js';
import assert from 'node:assert';
import { test } from 'node:test';

test('Filter Logic - Simple Comparison', () => {
  const rule = { ">": [{ "var": "lamports" }, 1000] };
  const dataPass = { lamports: 2000 };
  const dataFail = { lamports: 500 };

  assert.strictEqual(jsonLogic.apply(rule, dataPass), true);
  assert.strictEqual(jsonLogic.apply(rule, dataFail), false);
});

test('Filter Logic - Nested Parsed Data', () => {
  const rule = { "==": [{ "var": "parsed.tokenAmount.uiAmount" }, 50] };
  
  const dataPass = { 
    lamports: 100,
    parsed: {
      tokenAmount: { uiAmount: 50 }
    }
  };

  const dataFail = { 
    lamports: 100,
    parsed: {
      tokenAmount: { uiAmount: 10 }
    }
  };

  assert.strictEqual(jsonLogic.apply(rule, dataPass), true);
  assert.strictEqual(jsonLogic.apply(rule, dataFail), false);
});

test('Filter Logic - Complex Boolean', () => {
  // (lamports > 1000) AND (owner == "Tokenkeg...")
  const rule = {
    "and": [
      { ">": [{ "var": "lamports" }, 1000] },
      { "==": [{ "var": "owner" }, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"] }
    ]
  };

  const pass = { lamports: 2000, owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" };
  const fail1 = { lamports: 500, owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" };
  const fail2 = { lamports: 2000, owner: "11111111111111111111111111111111" };

  assert.strictEqual(jsonLogic.apply(rule, pass), true);
  assert.strictEqual(jsonLogic.apply(rule, fail1), false);
  assert.strictEqual(jsonLogic.apply(rule, fail2), false);
});
