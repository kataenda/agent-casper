# Agent Casper AI — Autonomous DeFi Yield Infrastructure for AI Agents

AI agents can reason, plan, and decide — but they can't yet manage capital or transact autonomously on-chain. Agent Casper closes that gap.

Agent Casper AI builds fully autonomous DeFi infrastructure that lets AI manage on-chain capital without human intervention. Running on the Casper Network, it turns a passive smart-contract vault into a self-driving portfolio manager powered by Claude AI — custodies real depositor CSPR on-chain, services multiple independently-owned vaults (multi-tenant), exposes its own intelligence as paid services other AI agents buy over x402 (settled on-chain), and executes real, non-custodial DeFi swaps on Casper mainnet via the CSPR.trade MCP.

The system transforms a passive smart contract vault into a self-driving portfolio manager, uniting the three pillars of the Casper Innovation Track — Agentic AI · DeFi · RWA — and closes the loop with agent-to-agent commerce: an independent buyer agent pays Agent Casper over x402 and settles on-chain, putting the machine economy to work, not just describing it.

Directly addresses two of Casper's example build directions: **#1 Autonomous Yield-Routing Agent via MCP** AND **#2 RWA Oracle Agent with verifiable on-chain identity**.

We enable AI systems to:

- Analyze real-world market data in real time
- Custody real CSPR and execute on-chain portfolio rebalancing autonomously
- Make risk-adjusted decisions via Claude AI
- Operate DeFi vaults for many owners with zero human operators
- Pay for, and get paid for, machine-to-machine services via x402 — settled on-chain by the official CSPR.cloud facilitator
- Execute real DeFi swaps on a live Casper mainnet DEX, signed by the agent's own key

---

## WHAT AGENT CASPER ENABLES

- **AI-Driven Portfolio Rebalancing** — Claude AI decides and executes allocation changes
- **Real On-Chain Custody** — a payable, upgradable vault holds actual depositor CSPR in its contract purse
- **Multi-Tenant Vault Servicing** — any wallet self-service deploys/owns its own vault; one agent autonomously services every enrolled vault
- **Autonomous On-Chain Settlements** — every decision settles on Casper Testnet
- **Real-World Asset (RWA) Oracles** — verified gold, treasury, oil feeds posted on-chain
- **Self-Driving DeFi Vaults** — an autonomous decision loop (configurable; 60s in the demo, 300s in production)
- **Agent Self-Funding** — a management fee accrues to an on-chain reserve the agent sweeps to its own gas account (`collect_fees`), plus balance/gas-aware execution so it never fires an action it can't pay for
- **A Closed x402 Loop (Agent Economy)** — both an x402 consumer and a paid provider, fully conformant with the official `exact` scheme and settled on-chain
- **Real Non-Custodial DeFi Execution** — the agent fetches live quotes, builds, signs, and broadcasts real swaps on Casper mainnet via CSPR.trade MCP
- **Decision → Execution Loop** — an AI REBALANCE can trigger a real, capped mainnet swap in the same cycle, gated by a drift + net-gain check (guarded, opt-in)
- **MCP-Powered Decision Engine** — blockchain state exposed to Claude via tool calls

---

## THE AGENT ECONOMY — x402 CLOSED LOOP (REAL ON-CHAIN SETTLEMENT)

Agent Casper runs the x402 v2 HTTP-native pay-per-request protocol on both sides of the loop — at once a paying consumer and a paid provider — and it is fully standards-compliant with the official CSPR.cloud `exact` scheme (`@make-software/casper-x402`). This is machine-to-machine commerce working today, not a slide: any AI agent can discover, pay for, and settle Agent Casper's services with no human in the loop.

- **Consumer** — each cycle the agent pays per API call for its premium "RWA risk feed."
- **Provider** — the agent sells its own services: an on-demand Claude AI rebalance recommendation (`/x402/decision`) and an on-chain-verified RWA price feed (`/x402/rwa-feed`), settled in a CEP-18 token via the official facilitator. Payment settles into the agent's own account.

**How it settles (real, not simulated):** every payment is an EIP-712 typed-data `TransferWithAuthorization` signed with the agent's ed25519 key. The official CSPR.cloud facilitator `/verify` returns `isValid: true`, then `/settle` submits a real `transfer_with_authorization` of the CEP-18 token on-chain. Because settlement is a token transfer (not a native transfer), these are true sub-CSPR micropayments — no 2.5 CSPR native-transfer floor.

**Verified on-chain (Casper Testnet):**

- Settle tx (facilitator `transfer_with_authorization`): https://testnet.cspr.live/transaction/e297580fc01b3bd4bfb011a592f129822b253041bf643ce16aed6c34f4443fdc
- Agent-to-agent settle (independent buyer → provider): https://testnet.cspr.live/transaction/eb0e914cdd902b177d95cd92a345cff3d7cdfbc33bffe8927d456d8c8a1f469e
- CEP-18 settlement token (deployed by the agent, agent holds supply): https://testnet.cspr.live/contract-package/c61db3d7ed7565c6a770e03184c031cf6a2a10f35519726d6fed577c46d28a63

A buyer-agent demo with its own fresh ed25519 identity pays Agent Casper for both provider services (402 → signed X-PAYMENT → 200), proving any agent can pay it. Reproducible end-to-end: `scripts/deploy_x402_token.py` → `scripts/buyer_pays_agent.py` (verify-only proof: `scripts/x402_verify_proof.py`).

---

## REAL DeFi — CSPR.trade MCP (CASPER MAINNET)

Beyond the testnet vault, Agent Casper performs real, non-custodial DeFi on Casper mainnet through the official CSPR.trade MCP (Uniswap-V2 DEX, 24 public MCP tools). Genuine on-chain trading — verified live:

- Swap proof: https://cspr.live/transaction/f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5
- AI-decided autonomous swap (REBALANCE → CSPR → sCSPR, no human): https://cspr.live/transaction/2bafdb43211c32d88d815873fc2bcee12d4c141dec8cc6e24399bea5c320164f

**Flow:** `get_quote` → `build_swap` (returns an unsigned Casper 2.x TransactionV1) → agent signs it with its own ed25519 key (MCP never holds funds) → broadcast via `account_put_transaction`. The swap mirrors the AI's decision (de-risk stakes CSPR→sCSPR, risk-on unwinds), sized by allocation drift. Guardrails: amount cap, price-impact cap, explicit `execute` flag, plus a drift + net-gain gate before any autonomous swap. Endpoints: `/defi/quote`, `/defi/markets`, `/defi/swap` — plus a Swap panel in the dashboard.

---

## HONEST SCOPE

The Testnet YieldVault now **custodies real depositor CSPR** — a payable `deposit()` lands CSPR in the contract purse (verified `86fd83a6…`, 700 CSPR), the contract is **upgradable in place with state preserved**, and the agent **autonomously services multiple independently-owned tenant vaults** (tenant rebalance `d7551fcb…`).

What the vault does NOT yet do is route that deposited capital into live yield positions: **native staking (delegate/undelegate to a Casper validator) is implemented and being validated on-chain** — opt-in, with a liquidity buffer for instant withdrawals — but we say "implemented + validating," not "proven," until a delegation tx is confirmed (no overclaim).

Real, non-custodial execution already runs on mainnet via CSPR.trade MCP with the agent's own funds. x402 is real end-to-end — official `exact` scheme, EIP-712 ed25519 proof, and CEP-18 `transfer_with_authorization` settled on-chain by the live facilitator (proof above). Routing the vault's deposited capital into live DeFi is Phase 2. We keep these distinctions explicit — no overclaiming.

---

## BUSINESS MODEL

A self-sustaining agent with two revenue streams:

- **x402 service fees (live, settled on-chain)** — other agents pay per call for AI recommendations and RWA feeds, settled in a CEP-18 token (configurable price) into the agent's own account via the official facilitator.
- **Vault management fee (in contract)** — the YieldVault charges an owner-configurable fee on deposits (default 1%, capped 10%), accrued to an on-chain fee reserve and emitted as a `FeeCollected` event. The agent sweeps that reserve to its own gas account (`collect_fees`) to help fund its own operation; a performance fee on generated yield follows in Phase 2.

---

## INFRASTRUCTURE

**Blockchain** — Casper Network · YieldVault (Odra 2.7.2, Rust→WASM, Testnet) — upgradable + payable, real CSPR custody, multi-tenant, native-staking entry points · CEP-18 x402 settlement token w/ `transfer_with_authorization` (Testnet) · CSPR.cloud · CSPR.trade MCP (real non-custodial DeFi swaps on mainnet, mcp.cspr.trade) · custom Casper MCP server (5 blockchain tools for Claude)

**Backend** — Python 3.11 + FastAPI + httpx · Claude (claude-haiku-4-5) decision engine · x402 handler (official `exact` scheme; consumer + provider; EIP-712 via casper-eip-712) · WebSocket

**Frontend** — Next.js 14 + React 18 + TypeScript · CSPR.click wallet-connect (@make-software/csprclick-ui — Casper Wallet / Ledger / Torus) + casper-js-sdk v5

**Casper AI Toolkit used (5/5):** x402 (official `exact` scheme, on-chain settle) · MCP servers (Casper MCP + CSPR.trade MCP) · CSPR.cloud · Odra · CSPR.click

**License** — MIT · fully open-source

---

## CURRENT STATUS

- ✅ Smart Contract Deployed on Casper Testnet — upgradable + payable (real CSPR custody, verified `86fd83a6…`)
- ✅ Multi-Tenant Vault Servicing — 2 independently-owned vaults, agent auto-rebalances each (tenant rebalance `d7551fcb…`)
- ✅ Autonomous AI Agent Live (configurable loop; 60s demo / 300s prod)
- ✅ RWA Oracle On-Chain & Active
- ✅ Real-Time Dashboard Live — incl. "My Vaults" (AUM, per-wallet liquid vs staked assets, gas runway, staking & swap history)
- ✅ x402 Closed Loop Live — official `exact` scheme, real on-chain settlement (facilitator `transfer_with_authorization`, tx `e297580f…`; agent-to-agent `eb0e914c…`)
- ✅ Real DeFi Swaps Live on Casper Mainnet — via CSPR.trade MCP (proof above)
- ✅ Live Demo + Demo Video Available
- 🟡 Native staking (delegate vault CSPR to a validator) — implemented, validating on-chain
- 🟡 Agent self-funding (`collect_fees` → own gas) — implemented
- 🔄 Vault-routed yield (deposited capital earning in DeFi positions) — Q3 2026

---

## ROADMAP

**Phase 1 — Buildathon MVP ✅**
YieldVault with real custody + upgradable + multi-tenant (testnet) · Autonomous Claude agent servicing every enrolled vault · RWA oracle · dashboard incl. My Vaults · two-sided x402 economy settled on-chain (official `exact` scheme) · real non-custodial DeFi swaps on mainnet via CSPR.trade MCP · native staking + agent self-funding implemented (validating)

**Phase 2 — Q3 2026**
Prove vault-routed yield on-chain (confirmed validator delegation) and route deposited capital into real Casper DeFi positions (CSPR.trade LP, staking) · live on-chain yield feeds · vault performance fee · per-vault strategy profiles · Telegram alerts

**Phase 3 — Q4 2026**
Casper Mainnet deployment · full tenant isolation (per-tenant agent keys via KMS/threshold signing) · x402 fee-based API for institutional access (CEP-18 stablecoin) · DAO governance · audited contracts

---

👉 **VOTE FOR AGENT CASPER on CSPR.fans** — https://cspr.fans/#/app/hackaton/zxi87n3x27slddxlu83ek34t

## LINKS

- **Dashboard** — https://casper.soenic.com
- **API** — https://agentcasper.soenic.com
- **Demo** — https://www.youtube.com/watch?v=4XiVtV4MWno
- **Repo** — https://github.com/kataenda/agent-casper
- **DoraHacks** — https://dorahacks.io/buidl/44340

**Socials** — X: https://x.com/kata_enda · Telegram: https://t.me/soesoe14 · Discord: `mas_end_47419`
