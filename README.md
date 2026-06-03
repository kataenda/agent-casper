# AGENT-CASPER

> Autonomous DeFi Yield Optimization Agent on Casper Network  
> Built for the **Casper Agentic Buildathon 2026**

---

## Overview

AGENT-CASPER is an end-to-end agentic DeFi system that autonomously manages a yield-optimized portfolio on the Casper blockchain. A Claude-powered AI agent monitors live yield rates, evaluates risk, and executes on-chain rebalancing decisions — all verifiably recorded via smart contract events.

```
Market Data (CSPR.cloud) → Claude AI Analysis → On-Chain Execution (YieldVault) → Dashboard
```

---

## Architecture

| Layer | Technology | Description |
|---|---|---|
| Smart Contract | Rust + Odra Framework | YieldVault deployed on Casper Testnet |
| AI Agent | Python + Claude API | Autonomous decision engine |
| API Server | FastAPI + WebSocket | Real-time data API |
| Frontend | Next.js + Tailwind CSS | Live monitoring dashboard |
| Payments | x402 Protocol | Per-request micropayments |
| Blockchain | CSPR.cloud REST API | Casper middleware |

---

## Project Structure

```
casper-yield-agent/
├── REQUIREMENTS.md        # Full requirements analysis
├── contracts/             # Odra smart contracts (Rust)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       └── yield_vault.rs
├── backend/               # AI Agent + FastAPI server
│   ├── requirements.txt
│   ├── .env.example
│   ├── main.py
│   ├── agent/
│   │   ├── yield_agent.py
│   │   └── decision_engine.py
│   └── casper/
│       ├── client.py
│       └── x402.py
└── frontend/              # Next.js dashboard
    ├── package.json
    └── src/
        ├── app/
        └── components/
```

---

## Quick Start

### 1. Deploy Smart Contract

```bash
cd contracts

# Install Rust + Odra toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install odra-casper-backend

# Build wasm
cargo build --release --features casper --target wasm32-unknown-unknown

# Deploy to Casper Testnet
casper-client put-deploy \
  --node-address https://rpc.testnet.casperlabs.io \
  --chain-name casper-test \
  --secret-key ./agent_secret_key.pem \
  --payment-amount 100000000000 \
  --session-path ./target/wasm32-unknown-unknown/release/yield_vault.wasm
```

### 2. Configure Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — fill in:
#   ANTHROPIC_API_KEY=sk-ant-...
#   VAULT_CONTRACT_HASH=hash-<deployed-contract>
#   AGENT_ACCOUNT_HASH=account-hash-<your-account>
#   CSPR_CLOUD_API_KEY=<your-key>

# Run server
python main.py
```

### 3. Start Frontend

```bash
cd frontend

npm install

# Optional: copy env
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
echo "NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws" >> .env.local

npm run dev
# Open http://localhost:3000
```

---

## Submission & Buildathon Links

This repository is submitted to the Casper Agentic Buildathon 2026 (Qualification Round).
Submit your project on DoraHacks at: https://dorahacks.io/hackathon/casper-agentic-buildathon/detail

See `SUBMISSION.md` for the required submission checklist and instructions.

Additional resources included in this repo:
- `docs/PAYOUT_AND_VOTING.md` — guidance on voting, payout, and KYC for winners
- `scripts/deploy_testnet.sh` and `scripts/deploy_testnet.ps1` — example deploy scripts for Testnet

---

## How the Agent Works

```
Every 60 seconds:

1. MONITOR  → Fetch yield rates from Casper DeFi protocols via CSPR.cloud
2. ANALYZE  → Send portfolio state + market data to Claude AI (claude-sonnet-4-6)
3. DECIDE   → Claude returns: HOLD | REBALANCE | ALERT
4. EXECUTE  → If REBALANCE: sign & submit deploy to YieldVault.rebalance()
5. RECORD   → Store result in DB + emit Casper contract events (on-chain audit trail)
6. BROADCAST→ Push update to all connected WebSocket clients (real-time dashboard)
```

---

## Smart Contract API

```rust
// YieldVault entry points
fn init()
fn deposit()                             // payable — deposit CSPR
fn withdraw(amount: U512)
fn register_agent(agent: Address)        // owner only
fn rebalance(                            // agent only
    new_strategy: Strategy,
    conservative_pct: u8,
    balanced_pct: u8,
    aggressive_pct: u8,
    reasoning: String,
)
fn emergency_pause()                     // owner only
fn resume()                              // owner only
fn get_portfolio() -> Portfolio          // view
fn get_apy_rates() -> (u16, u16, u16)   // view
fn get_rebalance_record(index: u64)     // view
```

---

## REST API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Health check |
| GET | `/agent/status` | Agent stats (running, cycles, rebalances) |
| GET | `/agent/history?limit=20` | Agent cycle history |
| GET | `/portfolio` | Latest portfolio state |
| GET | `/yields` | Current yield rates per strategy |
| GET | `/decisions?limit=10` | AI decision history |
| POST | `/rebalance/manual` | Manual rebalance override |
| POST | `/agent/pause` | Pause the agent |
| WS | `/ws` | Real-time event stream |

---

## Casper AI Toolkit Integration

| Tool | Usage |
|---|---|
| **Claude API** | Core AI decision engine for yield analysis |
| **CSPR.cloud** | Blockchain state queries and event streaming |
| **x402 Protocol** | Micropayments per API request (opt-in) |
| **Odra Framework** | Smart contract development and deployment |
| **MCP Server** | (Roadmap) Direct blockchain queries from AI agent |

---

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key |
| `CASPER_NODE_URL` | Casper JSON-RPC node URL |
| `CSPR_CLOUD_API_KEY` | CSPR.cloud API key |
| `VAULT_CONTRACT_HASH` | Deployed YieldVault contract hash |
| `AGENT_ACCOUNT_HASH` | Agent's Casper account hash |
| `AGENT_SECRET_KEY_PATH` | Path to agent's `.pem` private key |
| `AGENT_POLL_INTERVAL_SECONDS` | How often the agent polls (default: 60) |
| `MAX_REBALANCES_PER_DAY` | Daily rebalance limit (default: 5) |
| `X402_ENABLED` | Enable x402 micropayments (default: false) |

---

## Roadmap

| Phase | Timeline | Milestone |
|---|---|---|
| Phase 1 | Q2 2026 | Testnet deploy + working prototype |
| Phase 2 | Q3 2026 | Mainnet deployment + real yield protocols |
| Phase 3 | Q3 2026 | Multi-protocol support (CSPR.trade integration) |
| Phase 4 | Q4 2026 | Mobile app + community governance |
| Phase 5 | Q1 2027 | MCP server + multi-agent coordination |

---

## Team

Built for the **Casper Agentic Buildathon 2026** — Qualification Round  
June 1–30, 2026

---

## License

MIT
