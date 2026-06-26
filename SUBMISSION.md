# Submission Checklist — AGENT-CASPER

> **Casper Agentic Buildathon 2026** · Build Direction #1: Autonomous Yield-Routing Agent

> **Honest scope.** The Testnet YieldVault is the agent's *decision + on-chain proof layer* (records AI allocations + RWA prices on-chain); it does not itself route deposited capital into yield positions yet. Real non-custodial **execution** runs on **mainnet** via CSPR.trade MCP. Vault-capital routing into live DeFi = **Phase 2 (Q3 2026)**. We do not claim the vault "generates yield" today.

## Required items

- [x] Public repository URL — https://github.com/kataenda/agent-casper
- [x] README with project description, architecture, how to run, and license
- [x] `SUBMISSION.md` in repo root (this file)
- [x] Demo video (public link, 3–7 minutes) — https://youtu.be/2iQ0bkKPrx0
- [x] Working prototype deployed on Casper Testnet
- [x] Proof of on-chain transactions (tx hashes — see below)
- [x] Contract source (`contracts/src/yield_vault.rs`) + WASM (`contracts/wasm/yield_vault.wasm`)
- [x] Deploy instructions (`scripts/deploy_testnet.sh` + `scripts/deploy_testnet.ps1`)
- [x] `backend/.env.example` with required env vars (no secrets)

---

## Submission links

| Field | Value |
|---|---|
| Repo URL | https://github.com/kataenda/agent-casper |
| Demo video URL | https://youtu.be/2iQ0bkKPrx0 |
| Deployed contract hash | `hash-f6ba9dfa2a236dcc253436c3350f06931465ca94290fad689dfc7c9058c559da` |
| Agent account hash | `account-hash-88cb6d5e2b0a47b99688e0179a16f5c0c2a16f88c3294b6bf291d9020965843f` |
| Example rebalance tx hash | `dd0c391f1d69d5fe55a3b72fd6fd1d617a354812c80de67b9d12ddc9233ec29e` |
| DoraHacks submission link | https://dorahacks.io/buidl/44340 |

---

## On-chain proof

All transactions are verifiable on Casper Testnet Explorer.

| Action | Hash | Explorer |
|---|---|---|
| Contract deploy (package) | `f6ba9dfa2a236dcc253436c3350f06931465ca94290fad689dfc7c9058c559da` | [View on cspr.live](https://testnet.cspr.live/contract-package/f6ba9dfa2a236dcc253436c3350f06931465ca94290fad689dfc7c9058c559da) |
| `register_agent` call | `7c3c0da82f682eab1f8be8131f11b2b0319b86a7f618d589c2fa7230e4b24380` | [View on cspr.live](https://testnet.cspr.live/deploy/7c3c0da82f682eab1f8be8131f11b2b0319b86a7f618d589c2fa7230e4b24380) |
| First AI `rebalance` tx | `dd0c391f1d69d5fe55a3b72fd6fd1d617a354812c80de67b9d12ddc9233ec29e` | [View on cspr.live](https://testnet.cspr.live/deploy/dd0c391f1d69d5fe55a3b72fd6fd1d617a354812c80de67b9d12ddc9233ec29e) |
| x402 micropayment settlement | `6f67d64987b67ecd2b9f740b5622e9f868096c7b59c076aacc116550acd1b642` | [View on cspr.live](https://testnet.cspr.live/deploy/6f67d64987b67ecd2b9f740b5622e9f868096c7b59c076aacc116550acd1b642) |

Plus **real DeFi on Casper Mainnet** via CSPR.trade MCP (the YieldVault is on Testnet; the DEX is mainnet-only):

| Action | Network | Hash | Explorer |
|---|---|---|---|
| Non-custodial swap (CSPR → sCSPR) | **mainnet** | `f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5` | [View on cspr.live](https://cspr.live/transaction/f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5) |
| **AI-decided autonomous swap** (agent REBALANCE → swap, no human) | **mainnet** | `2bafdb43211c32d88d815873fc2bcee12d4c141dec8cc6e24399bea5c320164f` | [View on cspr.live](https://cspr.live/transaction/2bafdb43211c32d88d815873fc2bcee12d4c141dec8cc6e24399bea5c320164f) |

---

## Casper AI Toolkit used

| Tool | How used |
|---|---|
| **Odra Framework 2.7.2** | YieldVault smart contract (Rust → WASM) |
| **CSPR.cloud APIs** | Block data, deploy status, account balances, on-chain portfolio state |
| **casper-js-sdk v5** | Frontend deploy signing, wallet integration |
| **CSPR.click** | Frontend wallet connect SDK (`@make-software/csprclick-ui`) — Casper Wallet, Ledger, Torus; account session + transaction signing in the dashboard |
| **x402 Protocol** | HTTP-native pay-per-request, **two-sided**: agent is both consumer (pays for its RWA risk feed each cycle) and **provider on mainnet** (other agents pay it for `/x402/decision` + `/x402/rwa-feed`). ed25519-signed payment proof, real on-chain CSPR settlement, official CSPR.cloud facilitator integration (`X402_ENABLED=true`) |
| **CSPR.trade MCP** | **Real non-custodial DeFi** on Casper mainnet (`mcp.cspr.trade`, 24 tools): `get_quote` → `build_swap` (unsigned Casper 2.x TransactionV1) → agent signs with its own ed25519 key → broadcast via `account_put_transaction`. Funds never leave the agent's account. Exposed via `/defi/quote`, `/defi/markets`, `/defi/swap` |
| **MCP Server** | Custom Casper MCP server exposes blockchain state (block height, yield rates, vault portfolio, RWA prices, account balance) to Claude AI via tool calls |
| **Casper Wallet** | User authentication and transaction signing |
| **Claude AI (Anthropic)** | Autonomous rebalancing decisions with RWA market context |

---

## How to reproduce on-chain activity

```bash
# 1. Generate agent keypair
casper-client keygen ./scripts/agent_keys

# 2. Fund agent account via testnet faucet
#    https://testnet.cspr.live/tools/faucet

# 3. Configure backend
cp backend/.env.example backend/.env
#    Fill: ANTHROPIC_API_KEY, CSPR_CLOUD_API_KEY
#    Set:  VAULT_CONTRACT_HASH, AGENT_ACCOUNT_HASH, AGENT_SECRET_KEY_PATH

# 4. Run backend (AI agent starts automatically, polls every 60s)
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 5. Run frontend
cd frontend
npm install && npm run dev
#    Open http://localhost:3000

# One-click startup (Windows)
.\start.ps1
```

---

## Final Round judging alignment

| Criterion | Evidence |
|---|---|
| **Technical Execution** | FastAPI + Next.js + Rust/WASM, WebSocket real-time, MCP tools |
| **Innovation & Originality** | Autonomous AI yield agent + RWA oracle on Casper — Build Direction #1 |
| **Use of AI / Agentic Systems** | Claude AI decision loop (60s), MCP tools, natural language chat interface |
| **Real-World Applicability** | DeFi yield optimization with live PAXG, UST10Y, WTI oracle feeds — **plus real non-custodial swaps on Casper mainnet via CSPR.trade MCP** (verified tx `f28a4051…`) |
| **User Experience & Design** | Cyberpunk real-time dashboard with animated starfield, WebSocket live updates |
| **Working Smart Contracts** | YieldVault (Odra 2.7.2) deployed on Casper Testnet — 3 verified tx hashes |
| **Long-Term Launch Plans** | Live socials + phased roadmap + **revenue model**: x402 service fees already settle to the agent today (5 CSPR/decision, 2.5 CSPR/RWA feed); vault management/performance fee in Phase 2 (Q3 2026); Mainnet + DAO in Phase 3 (Q4 2026) |
| **Potential for Long-Term Impact** | First autonomous yield agent on Casper — template for agentic DeFi ecosystem |
