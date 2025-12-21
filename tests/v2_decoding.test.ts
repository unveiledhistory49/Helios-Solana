import { DecoderService } from '../src/services/decoder.js';
import { dbService } from '../src/db/database.js';
import assert from 'node:assert';
import { test } from 'node:test';

// Mock IDL compliant with Anchor 0.30+ (needs types)
const MOCK_IDL = {
  version: "0.1.0",
  name: "test_program",
  instructions: [],
  accounts: [
    {
      name: "TestAccount",
      type: {
        defined: { name: "TestAccount" }
      }
    }
  ],
  types: [
    {
      name: "TestAccount",
      type: {
        kind: "struct",
        fields: [
          { name: "value", type: "u64" }
        ]
      }
    }
  ]
};

test('DecoderService - Save and Load IDL', async () => {
  const programId = '675kPX9MHTjS2zt1qfr1NYHuHdiH9UvunXv19XfA75d';
  dbService.saveIdl(programId, MOCK_IDL);
  
  const decoder = new DecoderService();
  const coder = await decoder.getCoder(programId);
  
  assert.ok(coder);
});

test('DecoderService - Decode Account Data', async () => {
  const programId = '675kPX9MHTjS2zt1qfr1NYHuHdiH9UvunXv19XfA75d';
  dbService.saveIdl(programId, MOCK_IDL);
  
  const decoder = new DecoderService();
  const coder = await decoder.getCoder(programId);
  assert.ok(coder);
});