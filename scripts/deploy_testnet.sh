#!/usr/bin/env bash
# deploy_testnet.sh — Build YieldVault WASM and deploy to Casper Testnet
# Usage: ./scripts/deploy_testnet.sh
#
# Prerequisites:
#   - Rust + wasm32-unknown-unknown target
#   - casper-client CLI  (cargo install casper-client)
#   - agent_secret_key.pem in scripts/ directory
#   - Testnet CSPR balance (faucet: https://testnet.cspr.live/tools/faucet)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$SCRIPT_DIR/../contracts"
# Odra build outputs to contracts/wasm/
WASM_PATH="$CONTRACT_DIR/wasm/yield_vault.wasm"
SECRET_KEY="${SECRET_KEY:-$SCRIPT_DIR/agent_secret_key.pem}"
AGENT_ACCOUNT_HASH="${AGENT_ACCOUNT_HASH:-}"
NODE_URL="https://rpc.testnet.casperlabs.io"
CHAIN_NAME="casper-test"
PAYMENT_AMOUNT="150000000000"   # 150 CSPR — WASM deploy is expensive

# ── Step 1: Build WASM ────────────────────────────────────────────────────────
echo ""
echo "==> [1/4] Building YieldVault WASM via Odra..."
cd "$CONTRACT_DIR"

# Ensure cargo-odra is installed
if ! cargo odra --version &>/dev/null; then
    echo "    Installing cargo-odra..."
    cargo install cargo-odra --locked
fi

# Build using Odra framework (generates proper Casper WASM with 'call' export)
cargo odra build -b casper

if [ ! -f "$WASM_PATH" ]; then
    echo "ERROR: WASM not found at $WASM_PATH" >&2
    exit 1
fi
echo "    Built: $WASM_PATH ($(du -h "$WASM_PATH" | cut -f1))"

# ── Step 2: Deploy contract ────────────────────────────────────────────────────
echo ""
echo "==> [2/4] Deploying contract to $NODE_URL..."
DEPLOY_OUTPUT=$(casper-client put-deploy \
    --node-address "$NODE_URL" \
    --chain-name "$CHAIN_NAME" \
    --secret-key "$SECRET_KEY" \
    --payment-amount "$PAYMENT_AMOUNT" \
    --session-path "$WASM_PATH" \
    2>&1)

echo "$DEPLOY_OUTPUT"

DEPLOY_HASH=$(echo "$DEPLOY_OUTPUT" | grep -oP '"deploy_hash"\s*:\s*"\K[^"]+' || true)
if [ -z "$DEPLOY_HASH" ]; then
    echo "WARNING: Could not auto-extract deploy hash. Parse output above manually."
else
    echo ""
    echo "    Deploy hash: $DEPLOY_HASH"
    echo "    Explorer:    https://testnet.cspr.live/deploy/$DEPLOY_HASH"
fi

# ── Step 3: Wait for finalization ─────────────────────────────────────────────
echo ""
echo "==> [3/4] Waiting 60s for block finalization..."
sleep 60

if [ -n "$DEPLOY_HASH" ]; then
    echo "    Checking deploy status..."
    casper-client get-deploy \
        --node-address "$NODE_URL" \
        "$DEPLOY_HASH" \
        | grep -E '"execution_result"|"Success"|"Failure"' || true
fi

# ── Step 4: Register agent ────────────────────────────────────────────────────
echo ""
echo "==> [4/4] Register agent address on contract"
echo ""
echo "    Once you have the contract hash from your account named keys, run:"
echo ""
echo "    casper-client put-deploy \\"
echo "      --node-address $NODE_URL \\"
echo "      --chain-name $CHAIN_NAME \\"
echo "      --secret-key $SECRET_KEY \\"
echo "      --payment-amount 5000000000 \\"
echo "      --session-hash <YOUR_CONTRACT_HASH> \\"
echo "      --session-entry-point register_agent \\"
echo "      --session-arg \"agent:key='<AGENT_ACCOUNT_KEY>'\""
echo ""
echo "    Get your contract hash via:"
echo "    casper-client query-state --node-address $NODE_URL \\"
echo "      --state-root-hash \$(casper-client get-block --node-address $NODE_URL | jq -r '.result.block.header.state_root_hash') \\"
echo "      --key <YOUR_ACCOUNT_HASH>"

echo ""
echo "==> DONE. Add these to your .env:"
echo "    VAULT_CONTRACT_HASH=hash-<from named keys above>"
[ -n "$DEPLOY_HASH" ] && echo "    # Initial deploy hash: $DEPLOY_HASH"
echo ""
