Agent Casper AI — Autonomous DeFi Yield Agent on Casper Network
Casper Agentic AI Buildathon 2026

Live dashboard: https://casper.soenic.com
API: https://agentcasper.soenic.com
Demo video: https://www.youtube.com/watch?v=4XiVtV4MWno
Repo: https://github.com/kataenda/agent-casper
Vote (CSPR.fans): https://cspr.fans/#/app/hackaton/zxi87n3x27slddxlu83ek34t

────────────────────────────
1. WHAT IT IS

AI agents can reason and decide — but they can't yet manage capital or transact autonomously on-chain. Agent Casper closes that gap. Running on the Casper Network, it turns a passive smart-contract vault into a self-driving portfolio manager powered by Claude AI that:

- custodies real depositor CSPR on-chain (payable vault, contract purse)
- services multiple independently-owned vaults (multi-tenant)
- sells its own intelligence over x402 to other agents (settled on-chain)
- executes real, non-custodial DeFi swaps on Casper mainnet via CSPR.trade MCP

It unites the three pillars of the Casper Innovation Track — Agentic AI, DeFi, RWA — and closes the loop with agent-to-agent commerce.

Addresses two example build directions: #1 Autonomous Yield-Routing Agent via MCP, and #2 RWA Oracle Agent with verifiable on-chain identity.

────────────────────────────
2. WHAT IT DOES

- AI-driven rebalancing — Claude decides and executes allocation changes each cycle.
- Real on-chain custody — a payable, upgradable vault holds actual depositor CSPR.
- Multi-tenant servicing — any wallet deploys/owns its own vault; one agent services all.
- RWA oracle — verified gold / treasury / oil prices posted on-chain by the agent.
- Closed x402 loop — both a paying consumer and a paid provider; official exact scheme, settled on-chain by the CSPR.cloud facilitator.
- Real non-custodial DeFi — the agent fetches quotes, builds, signs (own ed25519 key), and broadcasts real mainnet swaps; the swap mirrors the AI's decision.
- Agent self-funding — a management fee accrues to an on-chain reserve the agent sweeps to its own gas account (collect_fees); gas/balance-aware so it never fires an action it can't pay for.
- Dashboard — live decision log, portfolio trajectory, RWA oracle, and a "My Vaults" page (AUM, per-wallet liquid vs staked assets, gas runway, staking & swap history).

────────────────────────────
3. CASPER AI TOOLKIT USED (5/5)

- x402 Micropayments — consumer + provider; on-chain CEP-18 transfer_with_authorization (official exact scheme).
- MCP Servers — custom Casper MCP (5 tools for Claude) + CSPR.trade MCP (live mainnet swaps).
- CSPR.click — official skill installed; @make-software/csprclick-ui wallet-connect wired.
- CSPR.cloud — REST + Node RPC (balances, deploys, tx verification).
- Odra Framework — YieldVault, upgradable + payable + real-custody contract.kenapa

Stack: Odra 2.7.2 (Rust→WASM) · Python 3.11 + FastAPI · Claude (claude-haiku-4-5) · Next.js 14 + React 18 + TypeScript · casper-js-sdk v5.

────────────────────────────
4. HONEST SCOPE (proven vs roadmap)

Proven on-chain: real custody (payable deposit), upgradable-in-place with state preserved, multi-tenant servicing, RWA oracle, two-sided x402 settlement, real non-custodial mainnet swaps.

Implemented, validating: native staking (delegate/undelegate vault CSPR to a validator, opt-in, liquidity buffer). We say "implemented + validating," not "proven," until a delegation tx is confirmed — no overclaim.

Phase 2: routing the vault's deposited capital into live yield positions.

x402 settles in a CEP-18 token via the official facilitator — x402 is the payment rail, not a speculative asset.

────────────────────────────
5. AGENT ON-CHAIN IDENTITY (verifiable)

A single autonomous ed25519 identity signs every transaction below — rebalances, RWA prices, x402 settlements, and mainnet swaps:

account-hash-88cb6d5e2b0a47b99688e0179a16f5c0c2a16f88c3294b6bf291d9020965843f

Each vault is bound to this identity via register_agent (e.g. tenant register 1dc138a9…), so a vault only accepts actions from this verifiable on-chain agent.

────────────────────────────
6. ON-CHAIN PROOF

Contract package hashes (Casper Testnet):

- YieldVault: 486a161bf2d5d2b36b2cfda25557adf3c7b70ec1cda7cfb01dec0ba1545ac5ea
  https://testnet.cspr.live/contract-package/486a161bf2d5d2b36b2cfda25557adf3c7b70ec1cda7cfb01dec0ba1545ac5ea
- x402 CEP-18 settlement token: c61db3d7ed7565c6a770e03184c031cf6a2a10f35519726d6fed577c46d28a63
  https://testnet.cspr.live/contract-package/c61db3d7ed7565c6a770e03184c031cf6a2a10f35519726d6fed577c46d28a63

Sample transactions — Testnet (all verified: exist & executed successfully):

- Real custody deposit — 700 CSPR into the contract purse (deposit)
  https://testnet.cspr.live/deploy/86fd83a683dccb7484c063accb0e90e0e3ae859daddf270573453bce365bbaee

- Autonomous rebalance (rebalance)
  https://testnet.cspr.live/deploy/f0352e2b0d19a086b2b237494d23cfeb8377da3053d5c0cd074af53353428162

- RWA price on-chain, gold / PAXG (update_rwa_price)
  https://testnet.cspr.live/deploy/b9f33ec3e9e1091912796beaa98b95d1b85887fd9df692067c7767bf37150d4e

- RWA price on-chain, US Treasury 10Y (update_rwa_price)
  https://testnet.cspr.live/deploy/0700586b8e302123887f4f759fb2ac90156cb2f8daad6d8f9e09db2aaf7f730b

- Multi-tenant — 2nd wallet registers the agent on its own vault (register_agent)
  https://testnet.cspr.live/deploy/1dc138a911b8b62b4269d5e966a9f6b2e5e2a13651590751682ee2021c58c6ba

- Multi-tenant — agent rebalances the tenant vault, drift-gated (rebalance)
  https://testnet.cspr.live/deploy/d7551fcb6187175e19ca66d77219fc2c5431a317cb3d50d6faecf5c45bb072ff

- x402 settlement — official exact scheme, facilitator transfer_with_authorization (CEP-18)
  https://testnet.cspr.live/transaction/e297580fc01b3bd4bfb011a592f129822b253041bf643ce16aed6c34f4443fdc

- x402 agent-to-agent — independent buyer pays the provider (CEP-18)
  https://testnet.cspr.live/transaction/eb0e914cdd902b177d95cd92a345cff3d7cdfbc33bffe8927d456d8c8a1f469e

- x402 native-transfer settlement, early proof (native transfer)
  https://testnet.cspr.live/deploy/ba8fb27e71acc2c0cba50a72a0bd3820028dc6ceb8791ac51b79b0614148f32d

Sample transactions — Casper Mainnet (real DeFi via CSPR.trade MCP, verified):

- Non-custodial swap CSPR → sCSPR, signed with the agent's own key
  https://cspr.live/transaction/f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5

- AI-decided autonomous swap, REBALANCE → CSPR → sCSPR (no human)
  https://cspr.live/transaction/2bafdb43211c32d88d815873fc2bcee12d4c141dec8cc6e24399bea5c320164f

────────────────────────────
7. HOW TO TEST (step-by-step)

1. Open the live dashboard: https://casper.soenic.com
2. Connect Casper Wallet (Testnet). Get faucet CSPR (~250): https://testnet.cspr.live/tools/faucet
3. In Vault Actions: Deploy the contract, then Register the agent, then Deposit CSPR. (Or observe an existing vault via the package hash above.)
4. Watch the Neural Decision Log: each cycle the agent posts HOLD / REBALANCE with reasoning and writes verified RWA prices on-chain.
5. Open /vault ("My Vaults"): AUM, per-wallet assets (liquid vs staked), agent gas runway, staking & swap history.
6. x402 proof (from repo root): run  python demo_x402.py  (proof only), or  python demo_buyer_agent.py --settle ...  for real on-chain settlement.
7. Live mainnet swap quote (read-only, no wallet):
   https://agentcasper.soenic.com/defi/quote?token_in=CSPR&token_out=sCSPR&amount=10

────────────────────────────
8. ROADMAP

Phase 1 — Buildathon MVP (shipped): real-custody + upgradable + multi-tenant vault, autonomous Claude agent, RWA oracle, dashboard incl. My Vaults, two-sided x402 economy settled on-chain, real non-custodial mainnet swaps, native staking + agent self-funding implemented (validating).

Phase 2 — Q3 2026: prove vault-routed yield on-chain (confirmed delegation), route deposited capital into real DeFi positions, live yield feeds, performance fee.

Phase 3 — Q4 2026: mainnet deployment, full tenant isolation, institutional x402 API, DAO governance, audited contracts.

────────────────────────────
9. LINKS & CONTACT

Dashboard: https://casper.soenic.com
API: https://agentcasper.soenic.com
Demo video: https://www.youtube.com/watch?v=4XiVtV4MWno
Repo: https://github.com/kataenda/agent-casper
License: MIT
X (Twitter): https://x.com/kata_enda
Telegram: https://t.me/soesoe14
Discord: mas_end_47419
