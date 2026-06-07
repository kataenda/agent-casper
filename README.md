# Agent Casper AI — Autonomous DeFi Yield Agent on Casper Network

> **Casper Agentic AI Buildathon 2026** · Build Direction #1: Autonomous Yield-Routing Agent via MCP

[![Casper Testnet](https://img.shields.io/badge/Casper-Testnet-00F5FF)](https://testnet.cspr.live)
[![Smart Contract](https://img.shields.io/badge/Contract-hash--f6ba9dfa-00FF94)](https://testnet.cspr.live)
[![License: MIT](https://img.shields.io/badge/License-MIT-BF5AF2.svg)](LICENSE)
[![Demo Video](https://img.shields.io/badge/Demo-YouTube-FF0000)](https://youtu.be/cYOoYzr03gI)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-VPS-00F5FF)](https://casper.soenic.com)

---

## Quick Links

| | |
|---|---|
| **Live Dashboard** | https://casper.soenic.com |
| **Backend API** | https://agentcasper.soenic.com |
| **Demo Video** | https://youtu.be/cYOoYzr03gI |
| **Smart Contract** | https://testnet.cspr.live (hash-f6ba9dfa...) |

---

## Overview

**AGENT-CASPER** is a fully autonomous DeFi yield optimization agent running on the Casper Network. Every 60 seconds, the agent:

1. Fetches real-world asset prices (PAXG/gold, UST10Y/T-bonds, WTI/oil)
2. Fetches yield rates from Casper validators via CSPR.cloud
3. Sends all data to Claude AI for analysis
4. Autonomously executes on-chain rebalancing transactions when needed

The system transforms a passive smart contract vault into a **self-driving portfolio manager**.

> Built using the [Casper AI Toolkit](https://www.casper.network/ai) — MCP Servers, CSPR.cloud, Odra Framework, casper-js-sdk v5

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT-CASPER                             │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  RWA     │    │  Claude AI   │    │   YieldVault         │  │
│  │  Oracle  ├───▶│  Decision    ├───▶│   Smart Contract     │  │
│  │ PAXG/    │    │  Engine      │    │   (Odra 2.x / Casper │  │
│  │ UST10Y/  │    │  (MCP Tools) │    │   Testnet)           │  │
│  │ WTI Oil  │    └──────────────┘    └──────────────────────┘  │
│  └──────────┘                                                   │
│       │              ▲                        │                 │
│  ┌────▼──────────────┴────────────────────────▼──────────────┐  │
│  │          FastAPI Backend (Python)                         │  │
│  │  • Yield Agent loop (every 60s)                           │  │
│  │  • CSPR.cloud middleware                                  │  │
│  │  • X402 micropayment handler                              │  │
│  │  • WebSocket broadcast                                    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                    │
│  ┌─────────────────────────▼──────────────────────────────────┐  │
│  │         Next.js Dashboard (React + TypeScript)             │  │
│  │  • Real-time cyber dashboard                               │  │
│  │  • Casper Wallet integration                               │  │
│  │  • Deploy / Register Agent / Deposit buttons               │  │
│  │  • AI chat interface                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Casper AI Toolkit Used

| Tool | Usage |
|------|-------|
| **CSPR.cloud** | Block data, deploy status, account balances |
| **Odra Framework 2.7.2** | YieldVault smart contract (Rust → WASM) |
| **casper-js-sdk v5** | Frontend deploy signing, wallet integration |
| **X402 Protocol** | Micropayment handler (disabled by default, enable via `X402_ENABLED=true`) |
| **MCP Server** | Exposes blockchain state to Claude via tool calls |
| **Casper Wallet** | User authentication and transaction signing |
| **Claude AI** | Autonomous rebalancing decisions with RWA context |

---

## Smart Contract — YieldVault

**Deployed on Casper Testnet:**
```
Contract Hash: hash-f6ba9dfa2a236dcc253436c3350f06931465ca94290fad689dfc7c9058c559da
Network:       casper-test
Framework:     Odra 2.7.2 (Rust → WASM)
```

### Entry Points

| Function | Description |
|----------|-------------|
| `deposit()` | Payable — users deposit CSPR into the vault |
| `withdraw(amount)` | Users withdraw their CSPR balance |
| `register_agent(agent)` | Owner registers the AI agent address |
| `rebalance(strategy, pcts, reason)` | Agent executes a portfolio rebalance |
| `update_rwa_price(asset, price, yield)` | Agent posts verified RWA data on-chain |
| `get_portfolio()` | Returns current TVL and allocation |
| `emergency_pause()` | Owner safety control |

### Events Emitted

`Deposited`, `Withdrawn`, `Rebalanced`, `AgentRegistered`, `RwaPriceUpdated`, `EmergencyPaused`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Rust + Odra 2.7.2 → WASM (Casper 2.x) |
| Backend | Python 3.11 + FastAPI + httpx |
| AI | Anthropic Claude (claude-haiku-4-5) |
| Frontend | Next.js 14 + React 18 + TypeScript |
| UI | Tailwind CSS + Recharts + Lucide |
| Wallet | Casper Wallet Extension + casper-js-sdk v5 |
| CI/CD | GitHub Actions (auto-build WASM on push) |

---

## Environment Variables Reference

Copy `backend/.env.example` to `backend/.env` and fill in all values:

```env
# ── AI ──────────────────────────────────────────────────────────────────────
# Get your key at https://console.anthropic.com → API Keys
ANTHROPIC_API_KEY=sk-ant-api03-...

# ── Casper Network ────────────────────────────────────────────────────────
# Official CSPR.cloud endpoints (https://www.casper.network/ai)
CASPER_NODE_URL=https://node.testnet.cspr.cloud/rpc
CSPR_CLOUD_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx   # Register at cspr.cloud
CSPR_CLOUD_BASE_URL=https://api.testnet.cspr.cloud

# ── Vault & Agent ─────────────────────────────────────────────────────────
# Filled in after deploying the contract via the dashboard
VAULT_CONTRACT_HASH=hash-xxxx...
VAULT_CONTRACT_VERSION_HASH=xxxx...
AGENT_ACCOUNT_HASH=account-hash-xxxx...
AGENT_SECRET_KEY_PATH=./agent_secret_key.pem

# For Railway / cloud deployments: paste the PEM content directly here
# (replace newlines with \n)
# AGENT_SECRET_KEY_CONTENT=-----BEGIN PRIVATE KEY-----\nxxxx\n-----END PRIVATE KEY-----

# ── Agent Configuration ───────────────────────────────────────────────────
AGENT_POLL_INTERVAL_SECONDS=60   # How often the agent polls (seconds)
MAX_REBALANCES_PER_DAY=5         # Maximum rebalances allowed per day

# ── X402 Micropayment (optional) ──────────────────────────────────────────
X402_ENABLED=false
X402_PAYMENT_AMOUNT=1000000
X402_FACILITATOR_URL=https://x402-facilitator.cspr.cloud

# ── App ───────────────────────────────────────────────────────────────────
APP_HOST=0.0.0.0
APP_PORT=8000
DEBUG=false
```

---

## Local Development Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- [Casper Wallet](https://www.casperwallet.io/) browser extension
- Testnet CSPR from the [faucet](https://testnet.cspr.live/tools/faucet) (at least ~250 CSPR)
- Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
- CSPR.cloud API key from [cspr.cloud](https://cspr.cloud)

### 1. Clone the Repository

```bash
git clone https://github.com/kataenda/agent-casper.git
cd agent-casper
```

### 2. Backend Setup

```bash
# Create virtual environment
python -m venv .venv

# Activate venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/Mac

# Install dependencies
pip install -r backend/requirements.txt
```

Create the `.env` file:
```bash
cp backend/.env.example backend/.env
# Edit backend/.env and fill in all required variables
```

Start the backend:
```bash
python -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

Backend available at: `http://localhost:8000`  
Swagger API docs: `http://localhost:8000/docs`

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Create `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

Start the frontend:
```bash
npm run dev
```

Dashboard available at: `http://localhost:3000`

---

## Deploying to VPS with Coolify

Both backend and frontend are deployed on a self-hosted VPS using [Coolify](https://coolify.io) — a self-hostable Heroku/Netlify alternative. This gives full control over the environment and unrestricted outbound access to the Anthropic API.

### Prerequisites

- A VPS with at least 2 GB RAM (any provider: Hostinger, DigitalOcean, Hetzner, etc.)
- Docker installed on the VPS
- [Coolify installed](https://coolify.io/docs/installation) on the VPS
- A domain pointed to your VPS IP (e.g. `agentcasper.yourdomain.com` for backend, `casper.yourdomain.com` for frontend)

### Step 1 — Deploy the Backend

1. In Coolify → **New Application** → **Public Repository**
2. Fill in:
   | Field | Value |
   |---|---|
   | **Repository URL** | `https://github.com/kataenda/agent-casper` |
   | **Branch** | `master` |
   | **Build Pack** | `Dockerfile` |
   | **Base Directory** | `/backend` |
   | **Ports Exposes** | `8000` |
   | **Domain** | `https://agentcasper.yourdomain.com` |

3. In **Environment Variables**, add:

   | Variable | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |
   | `CASPER_NODE_URL` | `https://node.testnet.cspr.cloud/rpc` |
   | `CSPR_CLOUD_API_KEY` | Your CSPR.cloud API key |
   | `CSPR_CLOUD_BASE_URL` | `https://api.testnet.cspr.cloud` |
   | `VAULT_CONTRACT_HASH` | `hash-xxxx...` |
   | `VAULT_CONTRACT_VERSION_HASH` | 64-char hex (no `hash-` prefix) |
   | `AGENT_ACCOUNT_HASH` | `account-hash-xxxx...` |
   | `AGENT_SECRET_KEY_CONTENT` | PEM content with `\n` for newlines |
   | `MAX_REBALANCES_PER_DAY` | `5` |
   | `AGENT_POLL_INTERVAL_SECONDS` | `60` |
   | `PORT` | `8000` |
   | `DEBUG` | `false` |

   > **Tip for `AGENT_SECRET_KEY_CONTENT`:**
   > PowerShell: `(Get-Content agent_secret_key.pem -Raw) -replace "\`r\`n","\n" -replace "\`n","\n"`

4. Click **Deploy** — Coolify builds the Docker image and starts the container with HTTPS via Let's Encrypt.

### Step 2 — Deploy the Frontend

1. In Coolify → **New Application** → **Public Repository**
2. Fill in:
   | Field | Value |
   |---|---|
   | **Repository URL** | `https://github.com/kataenda/agent-casper` |
   | **Branch** | `master` |
   | **Build Pack** | `Nixpacks` |
   | **Base Directory** | `/frontend` |
   | **Ports Exposes** | `3000` |
   | **Domain** | `https://casper.yourdomain.com` |

3. In **Environment Variables**, add:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://agentcasper.yourdomain.com` |
   | `NEXT_PUBLIC_WS_URL` | `wss://agentcasper.yourdomain.com/ws` |

4. Click **Deploy**.

### Step 3 — DNS Setup

Add two A records in your DNS panel:

| Name | Type | Value |
|---|---|---|
| `agentcasper` | A | `<your VPS IP>` |
| `casper` | A | `<your VPS IP>` |

Coolify (via Traefik) will automatically obtain Let's Encrypt SSL certificates once DNS propagates.

### Verifying Deployment

```bash
# Backend health check
curl https://agentcasper.yourdomain.com/

# Expected response:
# {"name": "Agent Casper", "version": "1.0.0", "status": "running"}
```

Check Coolify → backend app → **Logs** to confirm:
```
INFO  agent.yield_agent — YieldAgent started — polling every 60s
INFO  agent.yield_agent — [Block 8,xxx,xxx] Decision: REBALANCE | Confidence: 0.82
```

---

## Using the Dashboard

### Dashboard Layout

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│  PORTFOLIO VALUE │   REBALANCES     │   AI DECISION    │  BLOCK HEIGHT    │
│  1,332 CSPR      │   0              │   HOLD           │  #8,102,213      │
│  Strategy: Bal.  │   0 cycles       │   Confidence:82% │  Casper Testnet  │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
┌────────────────┬────────────────────────┬────────────────┬────────────────┐
│  RWA ORACLE    │  PORTFOLIO TRAJECTORY  │  ON-CHAIN PROOF│ YIELD INTEL.   │
│  PAXG (Gold)   │  Portfolio value       │  Contract Live │ Conservative:  │
│  UST10Y (Bond) │  chart over time       │  Deploy hash   │  9.53% APY     │
│  WTI (Oil)     │                        │  Last TX       │ Aggressive:    │
├────────────────┤                        │                │  14.50% APY    │
│  ALLOC MATRIX  │                        │                │                │
│  Donut chart   │                        │                │                │
└────────────────┴────────────────────────┴────────────────┴────────────────┘
┌────────────────┬────────────────────────────────────────┬────────────────┐
│  VAULT ACTIONS │  NEURAL DECISION LOG                   │  ASK AI AGENT  │
│  Deposit CSPR  │  Full AI decision history              │  Chat with     │
│  TX History    │  HOLD / REBALANCE + reasoning          │  Claude AI     │
└────────────────┴────────────────────────────────────────┴────────────────┘
```

### First-Time Setup Flow

#### Step 1 — Prepare Your Wallet

1. Install [Casper Wallet](https://www.casperwallet.io/) in your browser
2. Create or import a Casper account
3. Get testnet CSPR from the [faucet](https://testnet.cspr.live/tools/faucet) (minimum ~250 CSPR)

#### Step 2 — Open the Dashboard

Go to: `https://casper.soenic.com`

Click the **wallet button** in the top right → **Connect Casper Wallet**

#### Step 3 — Deploy the Smart Contract

> Skip this step if the contract is already deployed (hash is set in `.env`)

1. Click **"Deploy Contract"** in the Vault Actions panel
2. Casper Wallet will ask for confirmation (~230 CSPR gas)
3. Wait for confirmation (~2 minutes) — the Contract Hash will appear in the On-Chain Proof panel

#### Step 4 — Register the Agent

1. Click **"Register Agent"**
2. Confirm in Casper Wallet
3. Wait until the status shows `AGENT REGISTERED` in the On-Chain Proof panel

This grants the AI agent permission to execute rebalances on behalf of the vault.

#### Step 5 — Deposit CSPR

1. In the **Vault Actions** panel, enter the amount of CSPR
2. Click **"Deposit to Vault"**
3. Confirm in Casper Wallet
4. The TVL (Total Value Locked) will update in the Portfolio Value card

#### Step 6 — Monitor the Agent

Once CSPR is deposited, the agent is active automatically. Watch:

- **AI Decision** card: HOLD / REBALANCE / ALERT
- **Neural Decision Log**: Claude AI reasoning every 60 seconds
- **Portfolio Trajectory**: value chart over time
- **Allocation Matrix**: live donut chart of CONS/BALA/AGGR split

---

## Agent Control Buttons

| Button | Action |
|--------|--------|
| **START AGENT** | Start the agent loop (polls every 60 seconds) |
| **STOP AGENT** | Pause the agent loop |
| **API** | Open Swagger UI for backend API documentation |

---

## Chat Commands (Ask AI Agent)

Type directly in the **"Ask about portfolio..."** box in the bottom-right corner:

| Command | Example | Effect |
|---------|---------|--------|
| **start** | `start`, `resume`, `running` | Start the agent loop |
| **stop** | `pause`, `stop` | Stop the agent loop |
| **status** | `status`, `report` | Show full agent status |
| **rebalance** | `rebalance`, `rebalance conservative` | Force an immediate rebalance |
| **Free Q&A** | `what is TVL?`, `best strategy?` | Answered by Claude AI |

**Example `status` output:**
```
AGENT STATUS:
• Running: Yes
• Rebalances today: 2/5
• Total cycles: 24
• Block: #8,102,213
• TVL: 1,332.00 CSPR
• Allocation: CON=40% BAL=45% AGG=15%
• Strategy: Balanced
• Last decision: HOLD (88% confidence)
```

**Example `rebalance conservative` output:**
```
REBALANCE EXECUTED!
• Strategy: Conservative (CON=70% BAL=20% AGG=10%)
• TX Hash: 7563c5813420aa0a...
• View: https://testnet.cspr.live/deploy/7563c581...
```

---

## Understanding AI Decisions

### Three Decision Types

| Decision | Meaning | When it happens |
|----------|---------|-----------------|
| **HOLD** | Keep current allocation | Portfolio already optimal, daily quota exhausted, or stable market conditions |
| **REBALANCE** | Change portfolio allocation | AI finds a better risk-adjusted allocation |
| **ALERT** | Anomalous conditions detected | APY spike >50%, TVL drop >30%, or risk surge |

### Three Allocation Strategies

| Strategy | CONS | BALA | AGGR | Risk | Best for |
|----------|------|------|------|------|----------|
| **Conservative** | 70% | 20% | 10% | Low | Uncertain market, gold rising |
| **Balanced** | 40% | 45% | 15% | Medium | Normal conditions |
| **Aggressive** | 10% | 20% | 70% | High | Very high DeFi yields |

### RWA Signals and Their Effect on AI Decisions

| Signal | Effect on AI |
|--------|-------------|
| PAXG (gold) rises >1% | Favor Conservative allocation (flight-to-safety) |
| UST10Y (Treasury) >5% | Require DeFi yield premium ≥3× Treasury rate |
| UST10Y <3.5% | DeFi more attractive → Balanced/Aggressive acceptable |
| WTI (oil) surging | Raise risk threshold for Aggressive positions |

---

## Project Structure

```
agent-casper/
├── contracts/
│   ├── src/yield_vault.rs      # YieldVault Odra contract (Rust)
│   ├── Cargo.toml              # Odra 2.7.2 dependencies
│   ├── Dockerfile.build        # WASM compilation
│   └── wasm/yield_vault.wasm   # Built by CI
├── backend/
│   ├── main.py                 # FastAPI + WebSocket + agent lifecycle
│   ├── .env.example            # Configuration template
│   ├── agent/
│   │   ├── yield_agent.py      # Autonomous 60-second agent loop
│   │   └── decision_engine.py  # Claude AI with MCP tools
│   └── casper/
│       ├── client.py           # CSPR.cloud REST client
│       ├── deployer.py         # Transaction signing (pycspr)
│       ├── rwa_oracle.py       # PAXG / UST10Y / WTI price feeds
│       ├── mcp_server.py       # MCP server — blockchain tools for Claude
│       └── x402.py             # X402 micropayment handler
├── frontend/src/
│   ├── app/page.tsx            # Main cyber dashboard
│   └── components/
│       ├── DeployPanel.tsx     # Contract deployment
│       ├── VaultControls.tsx   # Register agent + deposit
│       ├── RWAPanel.tsx        # Real-world asset display
│       ├── DecisionLog.tsx     # AI decision history
│       └── ChatBox.tsx         # AI chat
└── .github/workflows/
    └── deploy-contract.yml     # CI: auto-build WASM
```

---

## Troubleshooting

### Agent always shows HOLD

**Possible causes:**

1. **`ANTHROPIC_API_KEY` not configured** — Check Coolify backend logs. If you see `⚠ ANTHROPIC_API_KEY is not set`, add the key to Coolify Environment Variables and redeploy.

2. **Portfolio already at optimal allocation** — If the reasoning says `"Portfolio already at optimal 40/45/15 allocation"`, the agent is correctly holding because no rebalance is needed.

3. **Daily rebalance quota exhausted** — If the reasoning says `"Daily rebalance quota exhausted (5/5)"`, wait until midnight UTC for the counter to reset. You can increase the limit via `MAX_REBALANCES_PER_DAY`.

4. **Market conditions not meeting threshold** — The AI only rebalances when conditions warrant a change. HOLD is correct when the current allocation is already optimal.

### Backend cannot connect to Anthropic API

```
WARNING agent.decision_engine — ANTHROPIC_API_KEY is not configured
```
→ Set `ANTHROPIC_API_KEY=sk-ant-...` in Coolify → Environment Variables → redeploy.

```
WARNING agent.decision_engine — Anthropic unexpected error: Connection error
```
→ Verify port 443 is open on VPS (`ufw status`). VPS environments have unrestricted outbound access unlike some PaaS platforms.

### Frontend cannot connect to backend

- Ensure `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` in Coolify frontend Environment Variables are correct
- Verify both backend and frontend SSL certificates are valid (green padlock in browser)
- CORS is allowed for all origins (`*`) by default

### Transaction failed (TX_FAILED)

- Ensure the agent account has enough CSPR for gas (~5 CSPR per transaction)
- Verify `AGENT_SECRET_KEY_PATH` or `AGENT_SECRET_KEY_CONTENT` is correct
- Verify `VAULT_CONTRACT_HASH` matches the deployed contract

### Port already in use (local dev)

```bash
# Check which process is using port 8000
netstat -ano | findstr :8000   # Windows
lsof -i :8000                  # Linux/Mac
```

---

## Important Operational Notes

- The agent requires **CSPR balance in the agent account** to pay gas for rebalance transactions (~5 CSPR each)
- Maximum **5 rebalances per day** (configurable via `MAX_REBALANCES_PER_DAY`)
- After 5 rebalances, the agent keeps monitoring but will not execute until the quota resets at midnight UTC
- All transactions are visible at [testnet.cspr.live](https://testnet.cspr.live)
- The smart contract is live on Casper **Testnet** — do not use Mainnet CSPR

---

## Roadmap

### Phase 1 — Buildathon MVP ✅
- YieldVault contract on Casper Testnet
- Autonomous AI agent (Claude) with 60-second decision loop
- RWA oracle on-chain posting (PAXG, UST10Y)
- Real-time cyber dashboard with WebSocket

### Phase 2 — DeFi Integration (Q3 2026)
- Connect to real Casper DeFi protocols
- Live yield rate feeds from on-chain sources
- Multi-vault strategy support
- Mobile notifications (Telegram bot)

### Phase 3 — Production Launch (Q4 2026)
- Casper Mainnet deployment
- X402 fee-based API for institutional access
- DAO governance for strategy parameters
- Audited smart contracts

---

## Community Vote

If you find this project useful, please **vote for Agent Casper AI** on [CSPR.fans](https://cspr.fans) to help us advance to the Final Round of the Buildathon!

---

## License

MIT License — Copyright (c) 2026 Soesoe

---

Built for the **Casper Agentic AI Buildathon 2026**  
Stack: Claude AI · CSPR.cloud · Odra 2.7.2 · casper-js-sdk v5 · FastAPI · Next.js
