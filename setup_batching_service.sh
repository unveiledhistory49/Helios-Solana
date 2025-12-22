#!/bin/bash

# Configuration
VAULT_PROGRAM_ID="6uwQNHMkDsrNQw8y1XNBAHT5xYzh9YN4sdMD2tw6C1fi"
EXECUTOR_URL="http://localhost:4002/webhook"
TRANSFORMER_PATH="./transformer/dca_logic/target/wasm32-unknown-unknown/release/dca_logic.wasm"
IDL_PATH="./vault_program/target/idl/vault_program.json"

echo "☀️ Initializing Helios Micro-Transaction Batching Service..."

# 1. Add IDL for decoding
echo "📦 Adding Vault Program IDL..."
node ./dist/index.js idl-add $VAULT_PROGRAM_ID $IDL_PATH

# 2. Add Program Subscription with WASM Transformer and Webhook
echo "📡 Subscribing to Vault Program events..."
node ./dist/index.js add $VAULT_PROGRAM_ID \
    --type program \
    --label "Collective DCA Vault" \
    --webhook $EXECUTOR_URL \
    --transformer $TRANSFORMER_PATH

echo "✅ Batching Service Configured!"
echo "   Monitoring: $VAULT_PROGRAM_ID"
echo "   Strategy: Collective DCA (Threshold: 0.5 SOL / 5 Deposits)"
echo "   Executor: $EXECUTOR_URL"

