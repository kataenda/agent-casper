# Pull Request

## What changed
<!-- A concise description of what this PR does. -->

## Why
<!-- The motivation / issue this addresses. Link the issue if any. -->

## Component
- [ ] Smart contract (`contracts/`)
- [ ] Backend / agent (`backend/`)
- [ ] Frontend (`frontend/`)
- [ ] x402 / MCP
- [ ] Docs / CI

## Checklist
- [ ] Frontend type-checks (`npx tsc --noEmit`) if UI changed
- [ ] Smart contract builds and `init()` stays idempotent if `contracts/` changed
- [ ] No secrets, keys, or `.env` committed
- [ ] README / claims stay honest (proven-on-chain vs implemented/roadmap)

## On-chain proof (if applicable)
<!-- Link any Testnet/mainnet transaction this change produces or relies on. -->
