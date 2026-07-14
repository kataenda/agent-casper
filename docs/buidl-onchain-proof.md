# On-Chain Proof — Agent Casper (for the DoraHacks BUIDL page)

Factual list of contract package hashes and sample transactions, each with a
short description. Copy/paste into the BUIDL page.

## Smart Contract (Casper Testnet)

**YieldVault — contract package hash:**
`486a161bf2d5d2b36b2cfda25557adf3c7b70ec1cda7cfb01dec0ba1545ac5ea`
Explorer: https://testnet.cspr.live/contract-package/486a161bf2d5d2b36b2cfda25557adf3c7b70ec1cda7cfb01dec0ba1545ac5ea
Framework: Odra 2.7.2 (Rust → WASM), upgradable in place, payable (real CSPR custody).

**x402 CEP-18 settlement token — contract package hash:**
`c61db3d7ed7565c6a770e03184c031cf6a2a10f35519726d6fed577c46d28a63`
Explorer: https://testnet.cspr.live/contract-package/c61db3d7ed7565c6a770e03184c031cf6a2a10f35519726d6fed577c46d28a63
CEP-18 token supporting `transfer_with_authorization`, used to settle x402 payments.

## Sample Transactions — Casper Testnet

| Description | Entry point | Hash / link |
|---|---|---|
| Real custody deposit — 700 CSPR lands in the contract purse via payable `deposit()` (no revert) | `deposit` | [`86fd83a6…`](https://testnet.cspr.live/deploy/86fd83a683dccb7484c063accb0e90e0e3ae859daddf270573453bce365bbaee) |
| Autonomous rebalance — agent updates the vault allocation on-chain | `rebalance` | [`f0352e2b…`](https://testnet.cspr.live/deploy/f0352e2b0d19a086b2b237494d23cfeb8377da3053d5c0cd074af53353428162) |
| RWA price on-chain (gold / PAXG) — verified oracle value posted by the agent | `update_rwa_price` | [`b9f33ec3…`](https://testnet.cspr.live/deploy/b9f33ec3e9e1091912796beaa98b95d1b85887fd9df692067c7767bf37150d4e) |
| RWA price on-chain (US Treasury 10Y) | `update_rwa_price` | [`0700586b…`](https://testnet.cspr.live/deploy/0700586b8e302123887f4f759fb2ac90156cb2f8daad6d8f9e09db2aaf7f730b) |
| Multi-tenant — a 2nd wallet registers the agent on ITS own vault | `register_agent` | [`1dc138a9…`](https://testnet.cspr.live/deploy/1dc138a911b8b62b4269d5e966a9f6b2e5e2a13651590751682ee2021c58c6ba) |
| Multi-tenant — agent autonomously rebalances the tenant vault (drift-gated) | `rebalance` | [`d7551fcb…`](https://testnet.cspr.live/deploy/d7551fcb6187175e19ca66d77219fc2c5431a317cb3d50d6faecf5c45bb072ff) |
| x402 settlement — facilitator `transfer_with_authorization` (official `exact` scheme) | CEP-18 transfer | [`e297580f…`](https://testnet.cspr.live/transaction/e297580fc01b3bd4bfb011a592f129822b253041bf643ce16aed6c34f4443fdc) |
| x402 agent-to-agent — independent buyer agent pays the Agent Casper provider | CEP-18 transfer | [`eb0e914c…`](https://testnet.cspr.live/transaction/eb0e914cdd902b177d95cd92a345cff3d7cdfbc33bffe8927d456d8c8a1f469e) |
| x402 native-transfer settlement (early proof) | native transfer | [`ba8fb27e…`](https://testnet.cspr.live/deploy/ba8fb27e71acc2c0cba50a72a0bd3820028dc6ceb8791ac51b79b0614148f32d) |

## Sample Transactions — Casper Mainnet (real DeFi via CSPR.trade MCP)

| Description | Network | Hash / link |
|---|---|---|
| Non-custodial swap CSPR → sCSPR, signed with the agent's own key | mainnet | [`f28a4051…`](https://cspr.live/transaction/f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5) |
| AI-decided autonomous swap (REBALANCE → CSPR → sCSPR, no human) | mainnet | [`2bafdb43…`](https://cspr.live/transaction/2bafdb43211c32d88d815873fc2bcee12d4c141dec8cc6e24399bea5c320164f) |

## How to reproduce (testing instructions)

1. Open the live dashboard: https://casper.soenic.com
2. Connect Casper Wallet (Testnet), get faucet CSPR, then Deploy → Register → Deposit.
3. Watch the agent's decision log update each cycle (HOLD / REBALANCE + reasoning).
4. x402 end-to-end proof (from repo root): `python demo_x402.py` (proof only) or
   `python demo_buyer_agent.py --settle ...` (real on-chain settlement).
5. Live mainnet swap quote (read-only):
   `curl "https://agentcasper.soenic.com/defi/quote?token_in=CSPR&token_out=sCSPR&amount=10"`
