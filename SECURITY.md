# Security Policy

Agent Casper is an autonomous DeFi agent that signs and broadcasts real on-chain
transactions. We take security seriously and welcome responsible disclosure.

## Supported Versions

| Version | Supported |
|---------|-----------|
| `master` (latest) | ✅ |
| older commits | ❌ |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report privately via one of:

- **GitHub Security Advisories** — [open a private report](https://github.com/kataenda/agent-casper/security/advisories/new) (preferred)
- **Telegram** — [@soesoe14](https://t.me/soesoe14)
- **Discord** — `mas_end_47419`

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected component (smart contract, backend agent, frontend, x402 handler, etc.)

We aim to acknowledge reports within **72 hours** and to provide a remediation
timeline after triage.

## Scope

In scope:

- The `YieldVault` Odra smart contract (`contracts/`)
- The FastAPI backend and autonomous agent (`backend/`)
- The x402 payment handler and EIP-712 signing (`backend/casper/x402.py`, `eip712.py`)
- The Next.js dashboard (`frontend/`)

Out of scope:

- Third-party services (CSPR.cloud, CSPR.trade MCP, Anthropic API, the x402 facilitator)
- Denial-of-service via request flooding against the public demo deployment
- Vulnerabilities requiring physical access to a user's device or wallet

## Handling of Keys & Funds

Agent keys are held locally and never committed to the repository. The agent
operates on **Casper Testnet** for custody and on mainnet only with its own,
capped funds. Never commit secrets — see `backend/.env.example` for the expected
configuration surface.
