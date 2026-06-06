# AGENT-CASPER — Autonomous DeFi Yield Agent on Casper Network

> **Casper Agentic AI Buildathon 2026** · Build Direction #1: Autonomous Yield-Routing Agent

[![Casper Testnet](https://img.shields.io/badge/Casper-Testnet-00F5FF)](https://testnet.cspr.live)
[![Smart Contract](https://img.shields.io/badge/Contract-hash--f6ba9dfa-00FF94)](https://testnet.cspr.live)
[![License: MIT](https://img.shields.io/badge/License-MIT-BF5AF2.svg)](LICENSE)

---

## Overview

**AGENT-CASPER** is a fully autonomous DeFi yield optimization agent that lives on the Casper Network. It continuously monitors real-world asset prices, analyzes market conditions using Claude AI, and autonomously executes portfolio rebalancing transactions on a live smart contract — without human intervention.

The system transforms a passive smart contract vault into a **self-driving portfolio manager** that:
- Monitors RWA prices (gold, T-bonds, oil) and DeFi yield rates in real time
- Uses Claude AI to analyze risk/yield trade-offs and decide when to rebalance
- Signs and submits on-chain transactions to the YieldVault contract
- Posts verified RWA oracle data directly to the Casper blockchain

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
| **Odra Framework 2.7.2** | YieldVault smart contract (Rust) |
| **casper-js-sdk v5** | Frontend deploy signing, wallet integration |
| **X402 Protocol** | Micropayment handler (pluggable, `X402_ENABLED=true`) |
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
| `deposit()` | Payable — users deposit CSPR into vault |
| `withdraw(amount)` | Users withdraw their CSPR balance |
| `register_agent(agent)` | Owner registers the AI agent address |
| `rebalance(strategy, pcts, reason)` | Agent executes portfolio rebalance |
| `update_rwa_price(asset, price, yield)` | Agent posts verified RWA data on-chain |
| `get_portfolio()` | Returns current TVL and allocation |
| `emergency_pause()` | Owner safety control |

### Events Emitted
`Deposited`, `Withdrawn`, `Rebalanced`, `AgentRegistered`, `RwaPriceUpdated`, `EmergencyPaused`

---

## Features

### Autonomous AI Agent
- Polls market data every 60 seconds
- Claude AI analyzes RWA prices + yield rates + portfolio state
- Decides: `HOLD`, `REBALANCE`, or `ALERT` with confidence score
- Executes on-chain rebalances autonomously (up to 5/day)

### RWA Oracle
- Real-time prices: PAXG (gold), UST10Y (T-bond yield), WTI (oil)
- Posts verified prices to YieldVault on-chain via `update_rwa_price()`
- Creates auditable oracle trail on Casper blockchain

### Yield Strategy Engine
- **Conservative** (30% default): Low-risk, capital preservation
- **Balanced** (50% default): Mixed risk/reward
- **Aggressive** (20% default): High-yield opportunities

### Live Dashboard
- Real-time WebSocket updates from agent loop
- Portfolio trajectory chart
- Allocation donut visualization
- Neural decision log with AI reasoning
- RWA oracle panel with live prices
- AI chat interface for natural language queries

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
| CI/CD | GitHub Actions (auto-builds WASM on push) |

---

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- Casper Wallet browser extension
- Testnet CSPR from [faucet](https://testnet.cspr.live/tools/faucet)

### 1. Clone

```bash
git clone https://github.com/kataenda/agent-casper.git
cd agent-casper
```

### 2. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac

pip install -r requirements.txt
```

Configure `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-...
CASPER_NODE_URL=https://node.testnet.cspr.cloud/rpc
CSPR_CLOUD_API_KEY=your-key
CSPR_CLOUD_BASE_URL=https://api.testnet.cspr.cloud
```

Start:
```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Deploy & Activate

1. **Connect Wallet** — click wallet button, connect Casper Wallet
2. **Deploy Contract** — click "Deploy Contract" (~230 CSPR gas)
3. **Register Agent** — click "Register Agent" so AI can rebalance
4. **Deposit CSPR** — deposit CSPR into vault to activate AI decisions
5. **Watch AI work** — agent polls every 60s, makes autonomous decisions

### Agent Key Setup

```bash
cd backend
python gen_key.py
# Outputs: Public key, Account hash, saves agent_secret_key.pem
# Fund the agent account via testnet faucet
```

---

## Menjalankan & Mengontrol Agent

### Auto-Start
Agent loop **otomatis berjalan** saat backend di-start. Tidak perlu konfigurasi tambahan.

```bash
# Backend start → agent langsung aktif
python -m uvicorn main:app --host 0.0.0.0 --port 8000
# Output: "CasperYield AI agent started"
# Output: "YieldAgent started — polling every 60s"
```

### Kontrol via Dashboard Button

| Button | Aksi |
|--------|------|
| **START AGENT** | Mulai agent loop (jika sedang stop) |
| **STOP AGENT** | Hentikan agent loop |

### Kontrol via Chat Box (Ask AI Agent)

Ketik perintah langsung di chat box — agent merespons dan mengeksekusi:

| Perintah | Contoh | Efek |
|----------|--------|------|
| **Start** | `start` · `running` · `mulai` · `jalankan` | Mulai agent loop |
| **Stop** | `pause` · `berhenti` · `hentikan` | Hentikan agent loop |
| **Status** | `status` · `laporan` · `kondisi` | Tampilkan state lengkap agent |
| **Rebalance** | `rebalance` · `rebalance conservative` | Force rebalance sekarang |
| **Tanya bebas** | `berapa TVL?` · `strategi terbaik?` | Dijawab Claude AI |

**Contoh output perintah `status`:**
```
STATUS AGENT:
• Running: Ya
• Rebalances hari ini: 2/5
• Total cycles: 12
• Block: #8,081,826
• TVL: 141.0 CSPR
• Alokasi: CON=20% BAL=60% AGG=20%
• Strategi: Balanced
• Keputusan terakhir: HOLD (78% confidence)
```

**Contoh output perintah `rebalance conservative`:**
```
REBALANCE DIEKSEKUSI!
• Strategi: Conservative (CON=70% BAL=20% AGG=10%)
• TX Hash: 7563c5813420aa0a...
• Cek: https://testnet.cspr.live/deploy/7563c581...
```

### Catatan Penting

- Agent membutuhkan saldo CSPR di account agent untuk gas (~5 CSPR per rebalance)
- Maksimal **5 rebalance per hari** (dapat diubah via `MAX_REBALANCES_PER_DAY` di `.env`)
- Setelah 5 rebalance, agent tetap monitoring tapi tidak eksekusi sampai hari berikutnya
- Semua transaksi dapat dilihat di [testnet.cspr.live](https://testnet.cspr.live)

---

## Project Structure

```
agent-casper/
├── contracts/
│   ├── src/yield_vault.rs      # YieldVault Odra contract
│   ├── build.rs                # ODRA_MODULE cfg emission
│   ├── Cargo.toml              # odra 2.7.2 deps
│   ├── Dockerfile.build        # WASM compilation
│   └── wasm/yield_vault.wasm   # Built by CI
├── backend/
│   ├── main.py                 # FastAPI + WebSocket + agent lifecycle
│   ├── agent/
│   │   ├── yield_agent.py      # Autonomous 60s agent loop
│   │   └── decision_engine.py  # Claude AI with MCP tools
│   └── casper/
│       ├── client.py           # CSPR.cloud REST client
│       ├── deployer.py         # Transaction signing (pycspr)
│       ├── rwa_oracle.py       # PAXG / UST10Y / WTI prices
│       └── x402.py             # X402 micropayment handler
├── frontend/src/
│   ├── app/page.tsx            # Cyber dashboard
│   └── components/
│       ├── DeployPanel.tsx     # Contract deployment
│       ├── VaultControls.tsx   # Register agent + deposit
│       ├── RWAPanel.tsx        # Real-world asset display
│       ├── DecisionLog.tsx     # AI decision history
│       └── ChatBox.tsx         # AI chat
└── .github/workflows/
    └── deploy-contract.yml     # Auto-build WASM CI
```

---

## Roadmap

### Phase 1 — Buildathon MVP ✅
- YieldVault contract on Casper Testnet
- Autonomous AI agent (Claude) with 60s decision loop
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

## License

MIT — see [LICENSE](LICENSE)

---

*Built for the Casper Agentic AI Buildathon 2026*  
*Stack: Claude AI · CSPR.cloud · Odra 2.7.2 · casper-js-sdk v5 · FastAPI · Next.js*
