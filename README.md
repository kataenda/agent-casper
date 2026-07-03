<p align="center">
  <img src="docs/screenshots/banner.png" alt="Agent Casper — Autonomous DeFi Yield Infrastructure for AI Agents" width="100%" />
</p>

<h1 align="center">Agent Casper AI</h1>
<p align="center"><b>Autonomous DeFi Yield Agent on Casper Network</b></p>

> **Casper Agentic AI Buildathon 2026** · Build Direction #1: Autonomous Yield-Routing Agent via MCP

<p align="center">
<a href="https://testnet.cspr.live"><img src="https://img.shields.io/badge/Casper-Testnet-00F5FF" alt="Casper Testnet" /></a>
<a href="https://testnet.cspr.live"><img src="https://img.shields.io/badge/Contract-hash--f6ba9dfa-00FF94" alt="Smart Contract" /></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-BF5AF2.svg" alt="License: MIT" /></a>
<a href="https://youtu.be/a20ls_stpDU"><img src="https://img.shields.io/badge/Demo-YouTube-FF0000" alt="Demo Video" /></a>
<a href="https://casper.soenic.com"><img src="https://img.shields.io/badge/Live%20Demo-VPS-00F5FF" alt="Live Demo" /></a>
</p>

## Screenshots

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Autonomous cyber dashboard" width="90%" /><br/>
  <em>Autonomous cyber dashboard — live AI decisions, portfolio trajectory, RWA oracle, on-chain proof</em>
</p>

<table>
<tr>
<td width="50%"><img src="docs/screenshots/agent-trust.png" alt="AI Trust Engine" /><br/><em>AI Trust Engine — explainable, on-chain-anchored reputation</em></td>
<td width="50%"><img src="docs/screenshots/x402.png" alt="x402 agent economy" /><br/><em>x402 — agent-to-agent economy + on-chain settlement proof</em></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/swap-history.png" alt="Real DeFi swaps" /><br/><em>Real non-custodial DeFi swaps on Casper mainnet (CSPR.trade)</em></td>
<td width="50%"><img src="docs/screenshots/api.png" alt="API reference" /><br/><em>Live API reference — REST + x402, in-page "Try it"</em></td>
</tr>
</table>



---

## Quick Links

| | |
|---|---|
| **Live Dashboard** | https://casper.soenic.com |
| **Backend API** | https://agentcasper.soenic.com |
| **Demo Video** | https://youtu.be/a20ls_stpDU |
| **Smart Contract** | https://testnet.cspr.live (hash-f6ba9dfa...) |
| **X / Twitter** | https://x.com/kata_enda |
| **Telegram** | https://t.me/soesoe14 |
| **Discord** | mas_end_47419 |
| **GitHub** | https://github.com/kataenda |

---

## Overview

**AGENT-CASPER** is a fully autonomous DeFi yield optimization agent running on the Casper Network. On each polling cycle — a **configurable interval** (`60s` in the demo video for visible live activity, `300s` in production to cut LLM cost on 24/7 operation) — the agent:

1. Fetches real-world asset prices (PAXG/gold, UST10Y/T-bonds, WTI/oil)
2. Fetches yield rates from Casper validators via CSPR.cloud
3. Lets **Claude AI autonomously query** on-chain + RWA data via MCP tools and decide
4. Autonomously executes on-chain rebalancing transactions when needed
5. Posts verified RWA prices on-chain (auditable oracle trail), and both **pays for** and **sells** premium data via **x402** micropayments — a service provider on Casper mainnet, not just a consumer
6. Executes **real, non-custodial DeFi swaps on Casper mainnet** via the **CSPR.trade MCP**, and the swap now **mirrors the AI's decision**: de-risking stakes **CSPR → sCSPR**, risk-on unwinds **sCSPR → CSPR**, sized by how far the allocation drifts — the agent fetches live quotes, builds the transaction, signs it with its own key, and broadcasts it (verified live: [`f28a4051…`](https://cspr.live/transaction/f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5))

The system transforms a passive smart contract vault into a **self-driving portfolio manager**, uniting the three pillars of the Casper Innovation Track — **Agentic AI · DeFi · RWA** — and closes the loop with **agent-to-agent commerce**: an independent buyer agent (its own ed25519 identity) pays Agent Casper over x402 and settles **on-chain** — a real CEP-18 `transfer_with_authorization` between two distinct agents ([`eb0e914c…`](https://testnet.cspr.live/transaction/eb0e914cdd902b177d95cd92a345cff3d7cdfbc33bffe8927d456d8c8a1f469e), Casper testnet) — putting the **machine economy** to work, not just describing it.

> **What's live vs. roadmap (honest scope).** The Testnet **YieldVault is the agent's *decision + on-chain proof layer*** — it records AI-driven allocation changes and verified RWA prices on-chain, but does **not** itself custody or route depositor capital into yield-bearing positions yet. What *is* real today: the agent **actively manages its own on-chain capital**, executing every allocation decision as a **real, directional mainnet swap** (de-risk vs risk-on, sized by drift), signed with its own key. Routing *depositor* capital directly into live DeFi positions requires payable deposits + on-chain staking and is **Phase 2 (Q3 2026)**. We keep this distinction explicit rather than claim the vault "generates depositor yield" today.

> Built using the [Casper AI Toolkit](https://www.casper.network/ai) — MCP Servers (Casper MCP + **CSPR.trade MCP**), CSPR.cloud, Odra Framework, x402, casper-js-sdk v5

---

## Real-World Applicability & Impact

**The problem.** On-chain yield allocation is still manual and macro-blind. Treasuries and LPs rebalance by hand, ignore real-world signals (rates, gold, oil) that move risk appetite, and can't react to 24/7 markets while they sleep. There is no round-the-clock, explainable, on-chain agent that ties *real-world data* to *on-chain action*.

**The solution.** Agent Casper is an autonomous, RWA-aware allocation agent that runs continuously, reasons over live macro + validator data with Claude, records every decision on-chain for audit, and **executes those decisions with real capital** on Casper mainnet.

**Who benefits — concrete users:**

| User | Value delivered |
|---|---|
| **DAO / protocol treasuries** | Hands-off, policy-driven rebalancing with an on-chain audit trail of *why* each move was made |
| **Retail LPs & stakers** | A 24/7 agent that de-risks on flight-to-safety signals (gold ↑, Treasury ↑) they'd otherwise miss |
| **Other AI agents** | Buy Agent Casper's RWA-aware decisions & verified feeds over **x402** — a paid, machine-to-machine data service |
| **Casper validators** | Autonomous, RWA-driven flows into liquid staking (sCSPR) add real, recurring on-chain volume |

**What is genuinely real today (not simulated):**

| Capability | Status | Proof |
|---|---|---|
| RWA market data (gold, UST10Y, WTI) | ✅ Real | CoinGecko + Yahoo Finance live APIs |
| On-chain RWA oracle trail | ✅ Real | `update_rwa_price` deploys on Testnet |
| AI-driven allocation decisions | ✅ Real | Claude via MCP tools, stored on-chain |
| Directional mainnet execution | ✅ Real | CSPR ⟷ sCSPR swaps on CSPR.trade ([`f28a4051…`](https://cspr.live/transaction/f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5)) |
| Agent-to-agent x402 settlement | ✅ Real | CEP-18 `transfer_with_authorization` ([`eb0e914c…`](https://testnet.cspr.live/transaction/eb0e914cdd902b177d95cd92a345cff3d7cdfbc33bffe8927d456d8c8a1f469e)) |
| Custody & routing of *depositor* funds | 🔜 Phase 2 | Payable deposits + on-chain staking (Q3 2026) |

---

## Roadmap & Long-Term Vision

**Vision:** the default autonomous, RWA-aware treasury layer for Casper — where any DAO, protocol, or agent can delegate 24/7 yield decisions to a transparent, on-chain AI whose every move is auditable and whose data is itself a sellable x402 service.

| Phase | Timeline | Milestones |
|---|---|---|
| **1 — Autonomous agent (now)** | ✅ Shipped | AI decision + on-chain proof layer, real mainnet execution of agent capital, x402 provider economy, live dashboard |
| **2 — Real depositor vault** | Q3 2026 | Payable deposits (real CSPR custody), on-chain staking into sCSPR, allocation backed by actual positions, withdrawal accounting |
| **3 — Multi-asset + mainnet launch** | Q4 2026 | Multi-token strategies (LP pools, stables), mainnet contract deploy, third-party **security audit**, risk caps & circuit breakers |
| **4 — Ecosystem & governance** | 2027 | DAO governance over agent policy, an **x402 agent marketplace** (agents buy/sell each other's signals), SDK for others to deploy their own Casper agents |

**Deployment plan.** Frontend + backend already run 24/7 on a VPS ([casper.soenic.com](https://casper.soenic.com) · [agentcasper.soenic.com](https://agentcasper.soenic.com)); Testnet contract is live. Phase 2 adds a mainnet contract behind the same operational stack, containerized (Coolify/Docker) with a backup CSPR.cloud key for quota resilience.

**Adoption & growth strategy.**
- **Wedge:** onboard 1–2 Casper-native DAOs/protocols as pilot treasuries for policy-driven rebalancing.
- **Network effect:** each agent that sells signals over x402 makes the marketplace more valuable — data compounds.
- **Developer pull:** open-source the agent framework so teams fork it for their own strategies (grows Casper on-chain activity).
- **Sustainability:** the vault's on-chain fee (`fee_bps`) + x402 provider revenue fund continuous operation — the agent is designed to pay for its own gas.

**Community & socials.** [X / Twitter](https://x.com/kata_enda) · [Telegram](https://t.me/soesoe14) · Discord `mas_end_47419` · [GitHub](https://github.com/kataenda) · [Demo video](https://youtu.be/a20ls_stpDU)

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
│  │  • Yield Agent loop (60s/300s)                            │  │
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

**Buildathon requirement — every required [AI Toolkit](https://www.casper.network/ai) component is used:**

| Required component | ✓ | Where in this project |
|---|---|---|
| **x402 Micropayments** | ✅ | [`x402.py`](backend/casper/x402.py) — consumer **and** provider; on-chain CEP-18 `transfer_with_authorization` settlement (`eb0e914c…`) |
| **MCP Servers** (Casper MCP + CSPR.trade MCP) | ✅ | [`mcp_server.py`](backend/casper/mcp_server.py) (5 tools, driven by Claude) + [`cspr_trade.py`](backend/casper/cspr_trade.py) (live **mainnet** swaps) |
| **CSPR.click AI Agent Skill** | ✅ | `@make-software/csprclick-ui` mounted app-wide ([`layout.tsx`](frontend/src/app/layout.tsx) → `CSPRClickProvider`) for wallet connect + signing; the **agent also creates & signs its own txs non-custodially** (`deployer.py`, `cspr_trade.py`) — the same capability the skill provides, keys stay local |
| **CSPR.cloud APIs** | ✅ | [`client.py`](backend/casper/client.py) — REST + Node RPC (balances, deploys, tx verification) |
| **Odra Framework** | ✅ | [`yield_vault.rs`](contracts/src/yield_vault.rs) — **upgradable, payable** real-custody vault |

Detailed breakdown:

| Tool | Usage |
|------|-------|
| **CSPR.cloud** | Block data, deploy status, account balances |
| **Odra Framework 2.7.2** | YieldVault smart contract (Rust → WASM) |
| **casper-js-sdk v5** | Frontend deploy signing, wallet integration |
| **CSPR.click** | `@make-software/csprclick-ui` **mounted app-wide** (`CSPRClickProvider` in `layout.tsx`) — Casper Wallet / Ledger / Torus connect, account session + transaction signing |
| **x402 Protocol** | HTTP-native pay-per-request, **official CSPR.cloud `exact` scheme** — EIP-712 (`casper-eip-712`) typed-data signed with the agent's ed25519 key, CEP-18 `transfer_with_authorization` settlement, **verified against the live facilitator `/verify` (`isValid: true`)**. Enable via `X402_ENABLED=true` |
| **MCP Server** | Custom Casper MCP server exposes 5 blockchain tools to Claude (block height, yield rates, vault portfolio, RWA prices, account balance) |
| **CSPR.trade MCP** | **Real non-custodial DeFi** on Casper mainnet (`https://mcp.cspr.trade/mcp`, 24 tools). The agent uses it for live swap quotes **and execution** — `build_swap` → sign with the agent's own ed25519 key → broadcast via `account_put_transaction`. Funds never leave the agent's account. Exposed via `/defi/quote`, `/defi/markets`, `/defi/swap` |
| **Casper Wallet** | User authentication and transaction signing |
| **Claude AI** | Autonomous rebalancing decisions with RWA context (claude-haiku-4-5) |

---

## Smart Contract — YieldVault

**Deployed on Casper Testnet:**
```
Contract Hash: hash-486a161bf2d5d2b36b2cfda25557adf3c7b70ec1cda7cfb01dec0ba1545ac5ea
Network:       casper-test
Framework:     Odra 2.7.2 (Rust → WASM), upgradable + payable (real CSPR custody)
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

> **This is agent-to-agent commerce — the machine economy, working today.** Agent Casper
> doesn't just *consume* x402; it *earns* over x402. An independent buyer agent (its own
> ed25519 identity) discovers Agent Casper's services, pays for them, and **settles on-chain**
> — a real CEP-18 `transfer_with_authorization` between two distinct agents, autonomous
> machine-to-machine payment with no human in the loop ([`eb0e914c…`](https://testnet.cspr.live/transaction/eb0e914cdd902b177d95cd92a345cff3d7cdfbc33bffe8927d456d8c8a1f469e), Casper testnet). The
> closed, two-sided loop (the agent both pays for its RWA risk feed and gets paid for its
> AI decisions) is exactly the agent economy the Casper Manifest describes.

Agent Casper implements the **x402 v2 HTTP-native pay-per-request** protocol on
**both sides of the loop**:

- **Consumer** — the agent pays per API call for its premium "RWA risk feed" each cycle.
- **Provider** — the agent *sells* its own services: other agents pay it for an on-demand
  Claude AI recommendation (`/x402/decision`) or an on-chain-verified RWA price feed
  (`/x402/rwa-feed`). Payment lands in the agent's own account, with real CEP-18
  `transfer_with_authorization` settlement demonstrated on-chain (Casper testnet, where the
  X402 token lives).

This is the **official CSPR.cloud `exact` scheme** — conformant with
[`@make-software/casper-x402`](https://github.com/make-software/casper-x402) and
**verified end-to-end against the live facilitator** (`/verify` returns
`isValid: true` — reproduce with [`scripts/x402_verify_proof.py`](scripts/x402_verify_proof.py)).

**Flow** (`backend/casper/x402.py` + `backend/casper/eip712.py`):

1. Client requests a protected resource (`GET /premium/yield-forecast`).
2. Server replies **HTTP 402 Payment Required** + `{resource, accepts:[PaymentRequirements]}` (scheme `exact`, network `casper:casper-test`, `asset` = CEP-18 token package hash, `extra` = token name/version).
3. Client builds a **`TransferWithAuthorization`** and signs the **EIP-712 typed-data digest** ([`casper-eip-712`](https://github.com/casper-ecosystem/casper-eip-712) domain: `name, version, chain_name, contract_package_hash`) with its **ed25519** key — `keccak256(0x1901 ‖ domainSeparator ‖ structHash)`.
4. Client retries with the base64 `X-PAYMENT` header (`{x402Version, resource, accepted, payload:{signature, publicKey, authorization}}`).
5. Server **recomputes the same digest**, verifies the signature, binds it to the payer (`publicKey` → account hash → `authorization.from`), checks expiry + nonce, then **settles via the facilitator** as a CEP-18 `transfer_with_authorization`.

Because settlement is a **CEP-18 token transfer** (not a native transfer), amounts are
**true sub-CSPR micropayments** — no 2.5 CSPR native-transfer floor. The facilitator pays
the deploy gas via its published `feePayer`; the agent only needs to hold the token.

> **x402 is real end-to-end — including genuine agent-to-agent settlement.** Fully
> conformant with the official `exact` scheme and **settled on-chain by the live CSPR.cloud
> facilitator** (Casper testnet, where the CEP-18 X402 token lives) — real 402 handshake,
> EIP-712 ed25519 proof accepted by the facilitator `/verify` (`isValid: true`), and a real
> `transfer_with_authorization` submitted by the facilitator `/settle`. Two on-chain proofs:
>
> - **Agent-to-agent (independent buyer → provider):** a separate buyer agent with its own
>   ed25519 identity (`00e2d5cd…`) pays the Agent Casper provider (`0088cb6d…`) 1 X402 —
>   [`eb0e914c…`](https://testnet.cspr.live/transaction/eb0e914cdd902b177d95cd92a345cff3d7cdfbc33bffe8927d456d8c8a1f469e)
>   (funding transfer agent → buyer: [`7cc8be65…`](https://testnet.cspr.live/deploy/7cc8be65f8bd55766fb98f5735c6cf8a94e26a823a804fd020357eb4166900cf)).
>   This is the machine economy literally on-chain: two distinct agents, real token moving between them.
> - **Settlement rail:** the agent's own `transfer_with_authorization` of the deployed token —
>   [`e297580f…`](https://testnet.cspr.live/transaction/e297580fc01b3bd4bfb011a592f129822b253041bf643ce16aed6c34f4443fdc)
>   (token [`c61db3d7…`](https://testnet.cspr.live/contract-package/c61db3d7ed7565c6a770e03184c031cf6a2a10f35519726d6fed577c46d28a63)).
>
> Reproduce: deploy the token (`scripts/deploy_x402_token.py`), fund the buyer
> (`scripts/fund_buyer.py`), then settle buyer → provider (`scripts/buyer_pays_agent.py`);
> self-settle: `scripts/x402_settle_real.py`; verify-only proof: `scripts/x402_verify_proof.py`.

**Endpoints:**

| Endpoint | Role | Description |
|----------|------|-------------|
| `GET /premium/yield-forecast` | provider (testnet) | x402-protected resource — 402 without payment, premium data with valid `X-PAYMENT` |
| `GET\|POST /x402/decision` | **provider (mainnet)** | Pay (CEP-18 token) → fresh Claude AI rebalance recommendation (RWA-aware) |
| `GET\|POST /x402/rwa-feed` | **provider (mainnet)** | Pay (CEP-18 token) → aggregated RWA prices (PAXG, UST10Y, WTI) + on-chain proof deploy hashes |
| `GET /x402/info` | — | x402 config, payer address + token, facilitator support, **provider service catalog** |
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

**When does the agent actually swap? (economic discipline).** A REBALANCE decision is
*necessary but not sufficient* — a swap costs gas + price impact, so the agent only fires
one when the move is **materially worth the cost**. Before executing, `_swap_worth_it()`
([`backend/agent/yield_agent.py`](backend/agent/yield_agent.py)) applies two gates:

- **Drift gate** — the current allocation must be off the AI's target by at least
  `DEFI_MIN_DRIFT_PCT` percentage points (default `10`). This prevents *churn*: tiny,
  noise-level deviations are held, not traded.
- **Net-gain gate** — the estimated **annualized portfolio APY uplift** from the
  reallocation (weighted across the live per-strategy yield rates) must clear
  `DEFI_MIN_NET_GAIN_BPS` (default `50` bps). A marginal improvement that wouldn't repay
  the swap cost is skipped.
- **De-risk bypass** — if the AI flags `risk_level = HIGH` (depeg, TVL drain, macro risk),
  the net-gain gate is bypassed so the agent can move to safety even at lower yield —
  capital preservation outweighs yield in a risk event.

Skipped swaps are reported in the cycle result as `settlement: "below_threshold"` with the
reason, so the dashboard still shows *why* the agent chose to hold. In short: swaps are
**event-driven** (an economic threshold is crossed), not schedule-driven — the poll
interval only sets how often the agent *looks*, never how often it *trades*.

**Tuning `DEFI_MIN_NET_GAIN_BPS`** — the minimum annualized APY uplift (bps) required to
justify a swap's cost:

| Value | Behaviour | When to use |
|---|---|---|
| **`50`** (0.5%) | Healthy default — swap only when clearly profitable | ✅ **Production (use this)** |
| `100` (1%) | More frugal — swaps very selectively | Minimise transactions |
| `25` (0.25%) | More aggressive — swaps more often | When you trust swap costs are low |
| `0` | Swap on any rebalance that doesn't *lower* APY | Semi-demo |
| `-1000` | Always swap, including de-risk moves (APY drops) | Demo only |

> A **de-risk / flight-to-safety** rebalance lowers APY, so with any positive threshold it
> won't swap (by design — you don't trade into a lower-yield allocation for yield reasons).
> Genuine high-risk moves still execute via the **De-risk bypass** above. For a live demo,
> set `-1000` to force the swap, then restore `50` for honest, cost-aware behaviour.

**Operator-tunable (no code change).** The thresholds are plain environment variables, so
the agent's posture is switched live — the **production / real default is the strict
"discipline" profile**:

| Profile | `DEFI_EXECUTE_ON_REBALANCE` | `DEFI_MIN_DRIFT_PCT` | `DEFI_MIN_NET_GAIN_BPS` | Behaviour |
|---------|:---:|:---:|:---:|-----------|
| **Real / discipline** (default) | `true` | `10` | `50` | Swaps only on a large, genuinely profitable reallocation |
| **Demo** (show execution live) | `true` | `5` | `20` | Looser gates so a real swap fires during a short demo |
| **Off** | `false` | — | — | No autonomous swaps at all |

> For judging, the deployed agent runs the **Real / discipline** profile (`10` / `50`) so
> every autonomous mainnet swap reflects a deliberate, cost-justified decision — not churn.

**Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /defi/quote` | Live CSPR.trade mainnet swap quote (read-only, no wallet) |
| `GET /defi/markets` | Live CSPR.trade trading pairs |
| `GET\|POST /defi/swap` | Build + sign + (with `execute=true`) broadcast a real swap; returns the tx hash |
| `GET /defi/history` | Persistent history of executed mainnet swaps (survives restarts) |

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
| **x402 `exact` settle** (facilitator `transfer_with_authorization`) | CEP-18 X402 | [`e297580f…`](https://testnet.cspr.live/transaction/e297580fc01b3bd4bfb011a592f129822b253041bf643ce16aed6c34f4443fdc) |
| **Agent-to-agent x402 settle** (independent buyer → provider) | CEP-18 X402 | [`eb0e914c…`](https://testnet.cspr.live/transaction/eb0e914cdd902b177d95cd92a345cff3d7cdfbc33bffe8927d456d8c8a1f469e) |

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

# ── Admin auth (optional, recommended for public deployments) ──────────────
# Shared secret gating state-mutating endpoints (/agent/pause, /agent/resume,
# /rebalance/manual, /admin/setup, /defi/swap, /deploy). Leave EMPTY to keep them
# open; set a long random value to require the X-Admin-Token header on every
# privileged call. Paste the same value into the dashboard's /api "Admin token"
# field to operate those actions. Read-only endpoints are never gated.
ADMIN_TOKEN=

# ── Agent Configuration ───────────────────────────────────────────────────
AGENT_POLL_INTERVAL_SECONDS=300  # how often the agent looks (60 in demo, 300 in prod)
MAX_REBALANCES_PER_DAY=5         # Maximum rebalances allowed per day

# Post verified RWA prices (PAXG, UST10Y) on-chain via update_rwa_price().
RWA_ONCHAIN_ENABLED=true         # Set false to disable on-chain RWA posting
RWA_POST_INTERVAL_SECONDS=3600   # Rate-limit: post at most once per interval

# ── x402 Micropayment (optional) ──────────────────────────────────────────
X402_ENABLED=false
X402_PAYMENT_AMOUNT=2500000000   # 2.5 CSPR — Casper native-transfer floor
X402_FACILITATOR_URL=https://x402-facilitator.cspr.cloud
# x402 payTo — a Casper account-hash address ('00' + account hash), NOT a public
# key. A '01'+pubkey value makes the CEP-18 transfer_with_authorization revert
# on-chain. Leave unset to default to the agent's own address.
# X402_PAY_TO=00<recipient-account-hash>
X402_SETTLE_INTERVAL_SECONDS=3600   # rate-limit on-chain settlement

# ── Real DeFi — autonomous swap on rebalance (CSPR.trade, mainnet) ─────────
# When the AI decides REBALANCE, optionally route a small, capped, non-custodial
# swap on Casper mainnet. OFF by default (spends the agent's own mainnet CSPR).
DEFI_EXECUTE_ON_REBALANCE=false  # true = agent swaps autonomously on rebalance
DEFI_SWAP_AMOUNT_CSPR=5          # fixed size per swap
DEFI_SWAP_TOKEN_IN=CSPR
DEFI_SWAP_TOKEN_OUT=sCSPR
DEFI_MAX_SWAPS_PER_DAY=1         # per-day safety cap (raise for repeat demos)
DEFI_MIN_DRIFT_PCT=10           # min allocation drift (pp) to bother swapping — anti-churn
DEFI_MIN_NET_GAIN_BPS=50        # min estimated APY uplift (bps) to justify gas+impact
CSPR_TRADE_MAX_AMOUNT_CSPR=25   # hard cap on input size per swap
CSPR_TRADE_MAX_PRICE_IMPACT_PCT=2.0  # abort a swap whose price impact exceeds this
# Demo tip: to make an autonomous swap fire during a short demo, set
# DEFI_EXECUTE_ON_REBALANCE=true, DEFI_MIN_DRIFT_PCT=5, DEFI_MIN_NET_GAIN_BPS=0,
# AGENT_POLL_INTERVAL_SECONDS=60 — and ensure the agent wallet holds mainnet CSPR
# and ANTHROPIC_API_KEY is valid (a swap only fires when the AI decides REBALANCE).

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
   | `AGENT_POLL_INTERVAL_SECONDS` | `300` (use `60` for a live demo) |
   | `ADMIN_TOKEN` | long random secret — gates pause/resume/rebalance/swap/deploy/setup (leave empty to keep open) |
   | `PORT` | `8000` |
   | `DEBUG` | `false` |

   > **Admin auth:** set `ADMIN_TOKEN` to a long random value to stop anonymous
   > visitors triggering privileged actions from the public dashboard. After
   > redeploying, paste the same value into the dashboard's **API page → Admin token**
   > field (kept in your browser only) to operate those actions. Never commit the
   > real value — keep it in Coolify env only.

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
INFO  agent.yield_agent — YieldAgent started — polling every 300s
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
- **Neural Decision Log**: Claude AI reasoning on each polling cycle (60s demo / 300s prod)
- **Portfolio Trajectory**: value chart over time
- **Allocation Matrix**: live donut chart of CONS/BALA/AGGR split

---

## Agent Control Buttons

| Button | Action |
|--------|--------|
| **START AGENT** | Start the agent loop (polls on the configured interval — 60s demo / 300s prod) |
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
│   ├── src/yield_vault.rs        # YieldVault Odra contract (Rust)
│   ├── Cargo.toml                # Odra 2.7.2 dependencies
│   ├── Dockerfile.build          # WASM compilation
│   ├── wasm/yield_vault.wasm     # Built by CI
│   └── x402/Cep18X402.wasm       # CEP-18 X402 token (make-software/casper-x402)
├── backend/
│   ├── main.py                   # FastAPI + WebSocket + agent lifecycle + admin auth
│   ├── .env.example              # Configuration template (incl. ADMIN_TOKEN)
│   ├── agent/
│   │   ├── yield_agent.py        # Autonomous agent loop (configurable interval)
│   │   └── decision_engine.py    # Claude AI with MCP tools
│   └── casper/
│       ├── client.py             # CSPR.cloud REST client
│       ├── deployer.py           # Transaction signing (pycspr)
│       ├── rwa_oracle.py         # PAXG / UST10Y / WTI price feeds
│       ├── mcp_server.py         # MCP server — blockchain tools for Claude
│       ├── x402.py               # x402 micropayment handler (consumer + provider)
│       ├── cspr_trade.py         # CSPR.trade MCP — real non-custodial DeFi swaps
│       └── swap_log.py           # Persistent on-chain swap history
├── frontend/src/
│   ├── app/
│   │   ├── page.tsx              # Main cyber dashboard
│   │   ├── swap/page.tsx         # DeFi swap + live swap history (mainnet)
│   │   ├── x402/page.tsx         # x402 service catalog + agent-to-agent proof
│   │   └── api/page.tsx          # API reference + live "try it" (GET + POST)
│   ├── lib/
│   │   ├── adminAuth.ts          # Admin-token storage for privileged calls
│   │   ├── store.ts              # Agent state store
│   │   └── useWebSocket.ts       # Live WebSocket feed
│   └── components/               # DeployPanel, VaultControls, RWAPanel,
│       └── …                     #   DecisionLog, ChatBox, AgentControls, etc.
├── scripts/
│   ├── deploy_x402_token.py      # Deploy the CEP-18 X402 token (agent holds supply)
│   ├── fund_buyer.py             # Fund a buyer agent with X402 tokens
│   ├── buyer_pays_agent.py       # REAL agent-to-agent on-chain settlement
│   ├── x402_settle_real.py       # Self-settle via the CSPR.cloud facilitator
│   └── deploy_testnet.{sh,ps1}   # Vault contract deploy helpers
├── demo_buyer_agent.py           # Independent x402 buyer agent (own ed25519 key)
└── .github/workflows/
    └── deploy-contract.yml       # CI: auto-build WASM
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
- Autonomous AI agent (Claude) with a configurable decision loop (60s demo / 300s prod) via MCP tools
- RWA oracle on-chain posting (PAXG, UST10Y)
- x402 micropayments — two-sided (consumer **and** provider, mainnet)
- **Real non-custodial DeFi swaps on Casper mainnet via CSPR.trade MCP**
- Real-time cyber dashboard with WebSocket

### Phase 2 — DeFi Integration (Q3 2026)
- Route vault capital into real Casper DeFi positions (CSPR.trade LP, validator staking)
- Live yield rate feeds from on-chain sources
- Multi-vault strategy support
- Mobile notifications (Telegram bot)

### Phase 3 — Production Launch & Multi-Tenant SaaS (Q4 2026)
- Casper Mainnet deployment
- **Multi-tenant architecture** — today Agent Casper runs as a single autonomous agent with one on-chain identity (ideal for a verifiable, auditable demo). Productization turns this into a per-user service: each user/DAO gets its **own isolated agent instance + non-custodial wallet**, with keys held in a KMS / threshold-signing setup (never a shared PEM), tenant-scoped state in a database (`tenant_id` on every record), and token-based auth gating every endpoint. The single-agent core stays the unit of execution — we replicate it per tenant rather than re-architect it.
- x402 fee-based API for institutional access (CEP-18 stablecoin micropayments)
- DAO governance for strategy parameters
- Audited smart contracts

---

## Community & Socials

Follow the project and reach out:

| Channel | Link |
|---|---|
| X / Twitter | [@kata_enda](https://x.com/kata_enda) |
| Telegram | [@soesoe14](https://t.me/soesoe14) |
| Discord | `mas_end_47419` |
| GitHub | [kataenda/agent-casper](https://github.com/kataenda) |
| Community Vote | [Vote on CSPR.fans](https://cspr.fans) |

If you find this project useful, please **vote for Agent Casper AI** on [CSPR.fans](https://cspr.fans) to help us advance to the Final Round of the Buildathon!

---

## License

MIT License — Copyright (c) 2026 Soesoe

---

Built for the **Casper Agentic AI Buildathon 2026**  
Stack: Claude AI · CSPR.cloud · Odra 2.7.2 · casper-js-sdk v5 · FastAPI · Next.js
