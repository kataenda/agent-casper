# Contributing to Agent Casper

Thanks for your interest in Agent Casper — an autonomous DeFi yield agent on the
Casper Network. Contributions of all kinds are welcome: bug reports, features,
docs, and tests.

## Getting Started

See the **Local Development Setup** section of the [README](README.md) for full
instructions. In short:

```bash
# Backend
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on Linux/Mac)
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # fill in your keys
python -m uvicorn main:app --app-dir backend --reload

# Frontend
cd frontend && npm install && npm run dev

# Smart contract (Odra / Rust)
cd contracts && cargo build
```

## Project Layout

| Path | What |
|------|------|
| `contracts/` | Odra 2.7.2 `YieldVault` smart contract (Rust → WASM) |
| `backend/` | FastAPI backend + autonomous agent loop + x402 + MCP |
| `frontend/` | Next.js 14 dashboard (React + TypeScript) |
| `scripts/` | Reproducible on-chain proof scripts (x402, token deploy) |
| `docs/` | Screenshots and supporting docs |

## Development Guidelines

- **Keep it honest.** This project deliberately distinguishes what is *proven
  on-chain* from what is *implemented / roadmap*. Don't add claims to the README
  or UI that aren't backed by a real transaction or working code.
- **Never commit secrets.** Keys, `.env`, and PEM files stay local. Use
  `backend/.env.example` to document new config.
- **Match the surrounding style.** Python: type hints + `httpx`/async where the
  code already does. TypeScript: existing component and Tailwind conventions.
- **Smart-contract changes** must keep `init()` idempotent (upgrades must never
  wipe state) and preserve the stable package key name.

## Submitting Changes

1. Fork and create a feature branch off `master`.
2. Make your change with clear, focused commits.
3. Ensure the frontend type-checks (`npx tsc --noEmit`) and the contract builds.
4. Open a Pull Request describing **what** changed and **why**, linking any
   relevant issue or on-chain transaction.

## Reporting Bugs

Open a [GitHub issue](https://github.com/kataenda/agent-casper/issues) using the
bug report template. For **security vulnerabilities**, follow
[SECURITY.md](SECURITY.md) instead — do not file a public issue.

## Community

- Telegram: [@soesoe14](https://t.me/soesoe14) · Casper Devs: https://t.me/CSPRDevelopers
- Discord: `mas_end_47419` · Casper: https://discord.com/invite/caspernetwork
