# Agent Casper AI — Autonomous DeFi Yield Agent on Casper Network

> **Casper Agentic AI Buildathon 2026** · Build Direction #1: Autonomous Yield-Routing Agent via MCP

[![Casper Testnet](https://img.shields.io/badge/Casper-Testnet-00F5FF)](https://testnet.cspr.live)
[![Smart Contract](https://img.shields.io/badge/Contract-hash--f6ba9dfa-00FF94)](https://testnet.cspr.live)
[![License: MIT](https://img.shields.io/badge/License-MIT-BF5AF2.svg)](LICENSE)
[![Demo Video](https://img.shields.io/badge/Demo-YouTube-FF0000)](https://youtu.be/1aA1Nwq1mMM)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-VPS-00F5FF)](https://casper.soenic.com)

---

## Quick Links

| | |
|---|---|
| **Live Dashboard** | https://casper.soenic.com |
| **Backend API** | https://agentcasper.soenic.com |
| **Demo Video** | https://youtu.be/1aA1Nwq1mMM |
| **Smart Contract** | https://testnet.cspr.live (hash-f6ba9dfa...) |
| **X / Twitter** | https://x.com/kata_enda |
| **GitHub** | https://github.com/kataenda |

---

## Overview

**AGENT-CASPER** is a fully autonomous DeFi yield optimization agent running on the Casper Network. Every 60 seconds, the agent:

1. Fetches real-world asset prices (PAXG/gold, UST10Y/T-bonds, WTI/oil)
2. Fetches yield rates from Casper validators via CSPR.cloud
3. Lets **Claude AI autonomously query** on-chain + RWA data via MCP tools and decide
4. Autonomously executes on-chain rebalancing transactions when needed
5. Posts verified RWA prices on-chain (auditable oracle trail), and both **pays for** and **sells** premium data via **x402** micropayments — a service provider on Casper mainnet, not just a consumer
6. Executes **real, non-custodial DeFi swaps on Casper mainnet** via the **CSPR.trade MCP** — the agent fetches live quotes, builds the transaction, signs it with its own key, and broadcasts it (verified live: [`f28a4051…`](https://cspr.live/transaction/f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5))

The system transforms a passive smart contract vault into a **self-driving portfolio manager**, uniting the three pillars of the Casper Innovation Track — **Agentic AI · DeFi · RWA**.

> **What's live vs. roadmap (honest scope).** The Testnet **YieldVault is the agent's *decision + on-chain proof layer*** — it records AI-driven allocation changes and verified RWA prices on-chain, but does **not** itself route deposited capital into yield-bearing positions yet. Real, non-custodial **execution** runs on **mainnet** via the **CSPR.trade MCP** (verified swaps), signed with the agent's own key. Routing the vault's deposited capital directly into live DeFi positions is **Phase 2 (Q3 2026)**. We deliberately keep this distinction explicit rather than claim the vault "generates yield" today.

> Built using the [Casper AI Toolkit](https://www.casper.network/ai) — MCP Servers (Casper MCP + **CSPR.trade MCP**), CSPR.cloud, Odra Framework, x402, casper-js-sdk v5

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
│  │  • x402 micropayment handler                              │  │
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
| **CSPR.click** | Frontend wallet-connect SDK (`@make-software/csprclick-ui`) — Casper Wallet / Ledger / Torus, account session + in-dashboard transaction signing |
| **x402 Protocol** | HTTP-native pay-per-request micropayments: ed25519-signed payment proof + real on-chain CSPR settlement + CSPR.cloud facilitator. Enable via `X402_ENABLED=true` |
| **MCP Server** | Custom Casper MCP server exposes 5 blockchain tools to Claude (block height, yield rates, vault portfolio, RWA prices, account balance) |
| **CSPR.trade MCP** | **Real non-custodial DeFi** on Casper mainnet (`https://mcp.cspr.trade/mcp`, 24 tools). The agent uses it for live swap quotes **and execution** — `build_swap` → sign with the agent's own ed25519 key → broadcast via `account_put_transaction`. Funds never leave the agent's account. Exposed via `/defi/quote`, `/defi/markets`, `/defi/swap` |
| **Casper Wallet** | User authentication and transaction signing |
| **Claude AI** | Autonomous rebalancing decisions with RWA context (claude-haiku-4-5) |

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
| `deposit()` | Payable — users deposit CSPR; a `fee_bps` management fee is taken |
| `withdraw(amount)` | Users withdraw their CSPR balance |
| `register_agent(agent)` | Owner registers the AI agent address |
| `rebalance(strategy, pcts, reason)` | Agent executes a portfolio rebalance |
| `update_rwa_price(asset, price, yield)` | Agent posts verified RWA data on-chain |
| `set_fee_bps(bps)` | Owner sets the management fee (basis points, capped at 10%) |
| `get_portfolio()` / `get_fee_bps()` | Read current TVL/allocation and the active fee |
| `emergency_pause()` | Owner safety control |

### Events Emitted

`Deposited`, `Withdrawn`, `Rebalanced`, `AgentRegistered`, `RwaPriceUpdated`, `EmergencyPaused`, `FeeCollected`

---

## x402 Micropayments

Agent Casper implements the **x402 v2 HTTP-native pay-per-request** protocol on
**both sides of the loop**:

- **Consumer** — the agent pays per API call for its premium "RWA risk feed" each cycle.
- **Provider** — the agent *sells* its own services on **Casper mainnet**: other agents
  pay it for an on-demand Claude AI recommendation (`/x402/decision`) or an on-chain-verified
  RWA price feed (`/x402/rwa-feed`). Payment lands in the agent's own account.

Every request carries a cryptographic proof; settlement is real and on-chain.

**Flow** (`backend/casper/x402.py`):

1. Client requests a protected resource (`GET /premium/yield-forecast`).
2. Server replies **HTTP 402 Payment Required** + `PaymentRequirements` (scheme `exact`, network `casper:casper-test`).
3. Client builds a payment authorization and **signs it with its ed25519 private key** (pycspr) — a real cryptographic proof over a blake2b-256 digest. Only the agent's key can produce it; the public key verifies it.
4. Client retries with the base64 `X-PAYMENT` header.
5. Server **cryptographically verifies** the signature, checks expiry + nonce (replay protection), then **settles a real native CSPR transfer on-chain** and returns the resource + Casper deploy hash.

Best-effort integration with the official **CSPR.cloud facilitator**
(`https://x402-facilitator.cspr.cloud`) is attempted first (`/supported`, `/settle`);
on any failure the agent falls back to a direct on-chain transfer so a verifiable
payment transaction is always produced.

> **Note on amounts:** Casper enforces a **2.5 CSPR floor on native transfers**, so
> on-chain settlement uses 2.5 CSPR (sub-CSPR micropayments require a CEP-18 token,
> which is what the official facilitator's `exact` scheme uses). On-chain settlement
> is rate-limited (`X402_SETTLE_INTERVAL_SECONDS`) to conserve agent funds; the
> cryptographic proof is produced on every request.

**Endpoints:**

| Endpoint | Role | Description |
|----------|------|-------------|
| `GET /premium/yield-forecast` | provider (testnet) | x402-protected resource — 402 without payment, premium data with valid `X-PAYMENT` |
| `GET\|POST /x402/decision` | **provider (mainnet)** | Pay **5 CSPR** → fresh Claude AI rebalance recommendation (RWA-aware) |
| `GET\|POST /x402/rwa-feed` | **provider (mainnet)** | Pay **2.5 CSPR** → aggregated RWA prices (PAXG, UST10Y, WTI) + on-chain proof deploy hashes |
| `GET /x402/info` | — | x402 config, payer public key, facilitator support, **provider service catalog** |
| `GET /x402/supported` | — | Proxies the facilitator's supported schemes/networks |

The mainnet provider endpoints set `payTo` to the agent's own public key, so a paying
agent's CSPR is settled to Agent Casper. The ed25519 proof is verified on every request,
and there are **two ways the payment settles on-chain**:

1. **Facilitator pull** — the official CSPR.cloud facilitator moves CSPR from a payer
   that holds a registered x402 allowance (`settlement: facilitator`).
2. **Payer push (self-contained)** — the payer submits a real native transfer to `payTo`
   and passes its deploy hash as `authorization.settlement_tx`. The provider then
   **verifies that transfer on-chain** (payer → payTo, ≥ amount, executed Success) and
   reports `settlement: onchain_transfer_by_payer` with a real `cspr.live` tx.

Either way the proof is bound to the on-chain payment (the transfer's sender must equal
the proof's signer). If neither settles (e.g. an unfunded demo key), the proof is still
verified and the request honoured with `settlement: proof_verified` (pending).

**Try it** (against the live production backend):

```bash
# 1. Request without payment → HTTP 402 + PaymentRequirements
#    (open this URL in a browser too — it shows the raw 402 challenge)
curl -i https://agentcasper.soenic.com/premium/yield-forecast

# 2. Inspect config, payer public key, and the live facilitator schemes
curl https://agentcasper.soenic.com/x402/info

# 3. Full end-to-end paid flow: 402 → ed25519-signed proof → HTTP 200 + premium data
#    (run from the repo root; reads the agent key from backend/agent_secret_key.pem)
python demo_x402.py            # proof only — no CSPR spent
python demo_x402.py --settle   # also settles a real on-chain CSPR transfer

# 4. BUYER AGENT — an independent agent (its own fresh ed25519 identity each run)
#    pays Agent Casper over mainnet x402 for BOTH provider services.
python demo_buyer_agent.py                       # proof only — settlement pending

# 5. REAL on-chain settlement: a funded mainnet buyer actually transfers CSPR to
#    Agent Casper, proving the provider economy settles on-chain (agent earns).
python demo_buyer_agent.py --settle --key buyer_key.pem --cloud-key <CSPR_CLOUD_KEY>
```

> Replace the URL with `http://localhost:8000` to try it against a local backend.
> `demo_x402.py` runs the exact `X402Handler` flow the agent uses (consumer side);
> `demo_buyer_agent.py` plays an *external* buyer that pays for `/x402/decision` and
> `/x402/rwa-feed` — proving the agent is a real x402 service provider, not just a consumer.

When `X402_ENABLED=true`, the agent also performs an x402 micropayment each cycle for
its "RWA risk feed"; the payment record (proof + settlement deploy hash) is included in
every cycle result broadcast over the WebSocket.

---

## Real DeFi — CSPR.trade MCP (Casper Mainnet)

Beyond the testnet vault, Agent Casper performs **real, non-custodial DeFi** on Casper
**mainnet** through the official [CSPR.trade MCP](https://mcp.cspr.trade) (Uniswap-V2 DEX,
24 public MCP tools). This is genuine on-chain trading — verified live:

> **Live swap:** [`f28a4051…`](https://cspr.live/transaction/f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5) · [`ba71c1a8…`](https://cspr.live/transaction/ba71c1a8e3008f9eed55a78eb6bfb0386cf4d8e61f5690fbc1412c74410b3eae)

**Flow** (`backend/casper/cspr_trade.py`):

1. `get_quote` / `estimate_slippage` — live mainnet pricing, route, and price impact.
2. `build_swap` — CSPR.trade returns an **unsigned Casper 2.x TransactionV1**.
3. The agent **signs it locally** with its own ed25519 key (the same key it uses for x402
   proofs and rebalances) — the MCP never holds funds (**non-custodial**).
4. The signed transaction is broadcast via `account_put_transaction` to a Casper mainnet
   node, returning a real transaction hash.

**Guardrails:** input-amount cap, price-impact cap, and an explicit `execute` flag
(`false` = quote + build + sign only, no broadcast).

**Autonomous decision → execution (closing the loop).** When the AI decides to
**REBALANCE**, the agent can also fire a small **real** mainnet swap via CSPR.trade in
the same cycle — turning the on-chain allocation record into actual on-chain DeFi
execution (shown in the dashboard's decision log as a `DeFi⚡MAINNET` tx badge). This
is **off by default** (`DEFI_EXECUTE_ON_REBALANCE=false`) and spends the **agent's own**
mainnet CSPR, bounded by a fixed per-swap amount (`DEFI_SWAP_AMOUNT_CSPR`), a per-day cap
(`DEFI_MAX_SWAPS_PER_DAY`), plus the amount + price-impact caps above. (Routing the
*vault's deposited* capital this way is Phase 2 — see Honest scope.)

**Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /defi/quote` | Live CSPR.trade mainnet swap quote (read-only, no wallet) |
| `GET /defi/markets` | Live CSPR.trade trading pairs |
| `GET\|POST /defi/swap` | Build + sign + (with `execute=true`) broadcast a real swap; returns the tx hash |

```bash
# Live mainnet quote (free, read-only)
curl "https://agentcasper.soenic.com/defi/quote?token_in=CSPR&token_out=sCSPR&amount=10"

# Execute a real non-custodial swap on mainnet (spends the agent's own CSPR)
curl -X POST https://agentcasper.soenic.com/defi/swap \
  -H "Content-Type: application/json" \
  -d '{"token_in":"CSPR","token_out":"sCSPR","amount":"10","execute":true}'
```

The dashboard also exposes a **Swap** panel (header button) for the same flow with a
real-mainnet confirmation step.

---

## On-Chain Proof

All activity is verifiable on the [Casper Testnet explorer](https://testnet.cspr.live). Example transactions produced autonomously by the agent:

| Action | Entry point | Example deploy hash |
|--------|-------------|---------------------|
| Smart contract (package) | — | [`f6ba9dfa…`](https://testnet.cspr.live/contract-package/f6ba9dfa2a236dcc253436c3350f06931465ca94290fad689dfc7c9058c559da) |
| Autonomous rebalance | `rebalance` | [`f0352e2b…`](https://testnet.cspr.live/deploy/f0352e2b0d19a086b2b237494d23cfeb8377da3053d5c0cd074af53353428162) |
| RWA price on-chain (gold) | `update_rwa_price` | [`b9f33ec3…`](https://testnet.cspr.live/deploy/b9f33ec3e9e1091912796beaa98b95d1b85887fd9df692067c7767bf37150d4e) |
| RWA price on-chain (treasury) | `update_rwa_price` | [`0700586b…`](https://testnet.cspr.live/deploy/0700586b8e302123887f4f759fb2ac90156cb2f8daad6d8f9e09db2aaf7f730b) |
| x402 micropayment settlement | native transfer | [`ba8fb27e…`](https://testnet.cspr.live/deploy/ba8fb27e71acc2c0cba50a72a0bd3820028dc6ceb8791ac51b79b0614148f32d) |

Plus **real DeFi on Casper mainnet** via CSPR.trade MCP (verifiable on [cspr.live](https://cspr.live)):

| Action | Network | Transaction |
|--------|---------|-------------|
| Non-custodial swap (CSPR → sCSPR) | **mainnet** | [`f28a4051…`](https://cspr.live/transaction/f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5) |
| **AI-decided autonomous swap** (REBALANCE → CSPR → sCSPR, no human) | **mainnet** | [`2bafdb43…`](https://cspr.live/transaction/2bafdb43211c32d88d815873fc2bcee12d4c141dec8cc6e24399bea5c320164f) |

> The `2bafdb43…` swap was triggered **autonomously** by the agent's own REBALANCE
> decision in a live cycle (not a manual call) — Claude decided, the agent signed and
> broadcast a real mainnet swap with its own key. The agent account has also produced
> 130+ processed transactions on Testnet to date.

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

# Post verified RWA prices (PAXG, UST10Y) on-chain via update_rwa_price().
RWA_ONCHAIN_ENABLED=true         # Set false to disable on-chain RWA posting
RWA_POST_INTERVAL_SECONDS=3600   # Rate-limit: post at most once per interval

# ── x402 Micropayment (optional) ──────────────────────────────────────────
X402_ENABLED=false
X402_PAYMENT_AMOUNT=2500000000   # 2.5 CSPR — Casper native-transfer floor
X402_FACILITATOR_URL=https://x402-facilitator.cspr.cloud
# Recipient public-key hex. If unset, auto-resolves to the facilitator feePayer.
X402_PAY_TO=0181d557c9dcaadea97c34d79bf7b6af07aa9d760e5dd1aabf78a45fb39e072c3a
X402_SETTLE_INTERVAL_SECONDS=3600   # rate-limit on-chain settlement

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
│       ├── x402.py             # x402 micropayment handler (consumer + provider)
│       └── cspr_trade.py       # CSPR.trade MCP — real non-custodial DeFi swaps
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
- Vault/rebalance/RWA transactions are visible at [testnet.cspr.live](https://testnet.cspr.live); CSPR.trade DeFi swaps are on **mainnet** at [cspr.live](https://cspr.live)
- The **YieldVault contract** is on Casper **Testnet**. The **CSPR.trade DeFi swaps** run on **mainnet** and spend the agent account's own CSPR (the DEX is mainnet-only) — fund the agent's mainnet account to enable `/defi/swap` execution

---

## Business Model

Agent Casper is built to be a **self-sustaining** agent, not a one-off demo. Revenue comes from two streams:

| Stream | Status | How it works |
|--------|--------|--------------|
| **x402 service fees** | ✅ **Live** | The agent *sells* its intelligence: other agents pay **5 CSPR** per AI rebalance recommendation (`/x402/decision`) and **2.5 CSPR** per on-chain-verified RWA feed (`/x402/rwa-feed`). Payment settles into the agent's own mainnet account — machine-to-machine revenue that scales with adoption. |
| **Vault management fee** | ✅ **In contract** | The YieldVault charges an owner-configurable **management fee** on deposits (`fee_bps`, default 1%, capped 10%), credited to the protocol owner and emitted as a `FeeCollected` event. Implemented in [`yield_vault.rs`](contracts/src/yield_vault.rs) — active on the live testnet instance once the updated WASM is deployed. |
| **Vault performance fee** | 🔄 **Phase 2** | When the vault routes *deposited* capital into live yield positions, it additionally takes a **performance fee** (% of yield generated) — the standard model for an automated portfolio manager. |

This two-sided design means the agent earns **both** as a service provider in the x402
agent economy **today**, and as a yield manager on assets under management **as the vault
matures**. Operating costs (gas, Claude inference, RWA data) are covered per-cycle, so the
margin grows with usage rather than requiring continuous external funding.

---

## Roadmap

### Phase 1 — Buildathon MVP ✅
- YieldVault contract on Casper Testnet
- Autonomous AI agent (Claude) with 60-second decision loop via MCP tools
- RWA oracle on-chain posting (PAXG, UST10Y)
- x402 micropayments — two-sided (consumer **and** provider, mainnet)
- **Real non-custodial DeFi swaps on Casper mainnet via CSPR.trade MCP**
- Real-time cyber dashboard with WebSocket

### Phase 2 — DeFi Integration (Q3 2026)
- Route vault capital into real Casper DeFi positions (CSPR.trade LP, validator staking)
- Live yield rate feeds from on-chain sources
- Multi-vault strategy support
- Mobile notifications (Telegram bot)

### Phase 3 — Production Launch (Q4 2026)
- Casper Mainnet deployment
- x402 fee-based API for institutional access (CEP-18 stablecoin micropayments)
- DAO governance for strategy parameters
- Audited smart contracts

---

## Community & Socials

Follow the project and reach out:

| Channel | Link |
|---|---|
| X / Twitter | [@kata_enda](https://x.com/kata_enda) |
| GitHub | [kataenda/agent-casper](https://github.com/kataenda) |
| Community Vote | [Vote on CSPR.fans](https://cspr.fans) |

If you find this project useful, please **vote for Agent Casper AI** on [CSPR.fans](https://cspr.fans) to help us advance to the Final Round of the Buildathon!

---

## License

MIT License — Copyright (c) 2026 Soesoe

---

Built for the **Casper Agentic AI Buildathon 2026**  
Stack: Claude AI · CSPR.cloud · Odra 2.7.2 · casper-js-sdk v5 · FastAPI · Next.js
