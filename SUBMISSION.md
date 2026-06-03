# Submission Checklist — AGENT-CASPER

Use this checklist to prepare your DoraHacks submission for the Casper Agentic Buildathon 2026.

## Required items
- [ ] Public repository URL (GitHub/GitLab/Bitbucket)
- [ ] README with: project description, architecture, how to run, and license
- [ ] `SUBMISSION.md` in repo root (this file)
- [ ] Demo video (public link, 3–7 minutes) included in README
- [ ] Working prototype deployed on Casper Testnet
- [ ] Proof of on-chain transaction(s) produced by your app (tx hashes)
- [ ] WASM artifact (`target/wasm32-unknown-unknown/release/yield_vault.wasm`) or contract source
- [ ] `scripts/deploy_testnet.sh` or equivalent deploy instructions
- [ ] `.env.example` with required env vars (no secrets)

---

## Submission links (fill before submit)

| Field | Value |
|---|---|
| Repo URL | ______________________ |
| Demo video URL | _____________________ |
| Deployed contract hash | __________________________ |
| Agent account hash | _____________________________ |
| Initial deploy tx hash | __________________________ |
| Example rebalance tx hash | _____________________ |
| DoraHacks submission link | ____________________ |

---

## On-chain proof

After running the agent against the deployed testnet contract, fill in real tx hashes here.

| Action | Deploy Hash | Testnet Explorer |
|---|---|---|
| Contract deploy | `hash-...` | https://testnet.cspr.live/deploy/... |
| register_agent call | `hash-...` | https://testnet.cspr.live/deploy/... |
| First AI rebalance | `hash-...` | https://testnet.cspr.live/deploy/... |

---

## How to reproduce on-chain activity

```bash
# 1. Generate agent keypair
casper-client keygen ./scripts/agent_keys
#    → creates agent_secret_key.pem + public_key.pem + public_key_hex

# 2. Fund agent account on testnet faucet
#    https://testnet.cspr.live/tools/faucet
#    paste contents of public_key_hex

# 3. Copy key to scripts directory
cp ./scripts/agent_keys/secret_key.pem ./scripts/agent_secret_key.pem

# 4. Deploy contract + register agent
bash ./scripts/deploy_testnet.sh
#    Save the printed VAULT_CONTRACT_HASH

# 5. Configure backend
cp backend/.env.example backend/.env
#    Fill: ANTHROPIC_API_KEY, VAULT_CONTRACT_HASH, AGENT_ACCOUNT_HASH,
#          AGENT_SECRET_KEY_PATH=./scripts/agent_secret_key.pem

# 6. Run backend (AI agent starts automatically)
cd backend && pip install -r requirements.txt && python main.py
#    Watch logs — first REBALANCE decision produces a real tx hash

# 7. Run frontend
cd frontend && npm install && npm run dev
#    Open http://localhost:3000 to see live dashboard
```

---

## Recommended repository structure

```
repo/
├── SUBMISSION.md
├── README.md
├── contracts/
│   ├── Cargo.toml
│   └── src/
│       └── yield_vault.rs
├── contracts/target/wasm32-unknown-unknown/release/yield_vault.wasm  # optional
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── ...
├── scripts/
│   ├── deploy_testnet.sh
│   └── deploy_testnet.ps1
└── docs/
    └── PAYOUT_AND_VOTING.md
```

Good luck!
