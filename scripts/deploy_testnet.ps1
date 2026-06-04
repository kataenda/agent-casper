# deploy_testnet.ps1 — Build YieldVault WASM and deploy to Casper Testnet
# Usage: .\scripts\deploy_testnet.ps1
#
# Prerequisites:
#   - Rust + wasm32-unknown-unknown target
#   - casper-client CLI  (cargo install casper-client)
#   - agent_secret_key.pem in scripts\ directory
#   - Testnet CSPR balance (faucet: https://testnet.cspr.live/tools/faucet)

param(
    [string]$SecretKey    = "$PSScriptRoot\agent_secret_key.pem",
    [string]$NodeUrl      = "https://rpc.testnet.casperlabs.io",
    [string]$ChainName    = "casper-test",
    [string]$PaymentAmount = "150000000000"
)

$ErrorActionPreference = "Stop"

$ContractDir = Resolve-Path "$PSScriptRoot\..\contracts"
# Odra build outputs to contracts\wasm\
$WasmPath    = Join-Path $ContractDir "wasm\yield_vault.wasm"

# ── Step 1: Build WASM ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==> [1/4] Building YieldVault WASM via Odra..."
Push-Location $ContractDir

# Ensure cargo-odra is installed
try { cargo odra --version | Out-Null }
catch {
    Write-Host "    Installing cargo-odra..."
    cargo install cargo-odra --locked
}

# Build using Odra framework (generates proper Casper WASM with 'call' export)
cargo odra build -b casper
Pop-Location

if (-not (Test-Path $WasmPath)) {
    Write-Error "WASM not found at $WasmPath"
    exit 1
}
$WasmSize = (Get-Item $WasmPath).Length / 1KB
Write-Host "    Built: $WasmPath ($([math]::Round($WasmSize))KB)"

# ── Step 2: Deploy contract ────────────────────────────────────────────────────
Write-Host ""
Write-Host "==> [2/4] Deploying contract to $NodeUrl..."
$DeployOutput = & casper-client put-deploy `
    --node-address $NodeUrl `
    --chain-name   $ChainName `
    --secret-key   $SecretKey `
    --payment-amount $PaymentAmount `
    --session-path $WasmPath

Write-Host $DeployOutput

$DeployHash = $DeployOutput | Select-String -Pattern '"deploy_hash"\s*:\s*"([^"]+)"' |
    ForEach-Object { $_.Matches[0].Groups[1].Value }

if ($DeployHash) {
    Write-Host ""
    Write-Host "    Deploy hash: $DeployHash"
    Write-Host "    Explorer:    https://testnet.cspr.live/deploy/$DeployHash"
} else {
    Write-Warning "Could not auto-extract deploy hash. Parse output above manually."
}

# ── Step 3: Wait for finalization ─────────────────────────────────────────────
Write-Host ""
Write-Host "==> [3/4] Waiting 60s for block finalization..."
Start-Sleep -Seconds 60

if ($DeployHash) {
    Write-Host "    Checking deploy status..."
    & casper-client get-deploy --node-address $NodeUrl $DeployHash |
        Select-String -Pattern "execution_result|Success|Failure"
}

# ── Step 4: Instructions for register_agent ───────────────────────────────────
Write-Host ""
Write-Host "==> [4/4] Register agent address on contract"
Write-Host ""
Write-Host "    Once you have the contract hash from your account named keys, run:"
Write-Host ""
Write-Host "    casper-client put-deploy ``"
Write-Host "      --node-address $NodeUrl ``"
Write-Host "      --chain-name $ChainName ``"
Write-Host "      --secret-key $SecretKey ``"
Write-Host "      --payment-amount 5000000000 ``"
Write-Host "      --session-hash <YOUR_CONTRACT_HASH> ``"
Write-Host "      --session-entry-point register_agent ``"
Write-Host "      --session-arg `"agent:key='<AGENT_ACCOUNT_KEY>'`""
Write-Host ""
Write-Host "==> DONE. Add to your .env:"
Write-Host "    VAULT_CONTRACT_HASH=hash-<from named keys>"
if ($DeployHash) { Write-Host "    # Initial deploy hash: $DeployHash" }
Write-Host ""
