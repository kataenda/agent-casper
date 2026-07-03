# Real On-Chain Custody — Deploy & Wire Runbook

This turns the vault from an *allocation-record* into one that genuinely **custodies
depositor CSPR on-chain**: `deposit()` is now Odra `#[odra(payable)]` (attached CSPR
lands in the contract purse), `withdraw()` sends real CSPR back via `transfer_tokens`,
and `get_tvl()` reports the real purse balance.

The contract change is committed. What remains is **build → deploy → propagate hash →
wire the UI**, which needs a build toolchain and your funded Testnet key.

> **Why this can't be one click:** this dev machine has **no MSVC C++ toolset**, so the
> Odra contract can't be compiled locally, and a redeploy needs a funded key that must
> not live in CI. Both steps below are yours to run; everything else is already in place.

---

## 1. Build the contract wasm

**Option A — CI (recommended, no local toolchain):**
1. GitHub → **Actions** → **Build YieldVault WASM** → **Run workflow** (or it runs on push to `contracts/**`).
2. If the run is green, the contract **compiles** (this is the compile-verification we can't do locally).
3. Download the `yield_vault-wasm` artifact → place it at `contracts/wasm/yield_vault.wasm`.

**Option B — local:** install **Build Tools for Visual Studio 2022** with the *Desktop
development with C++* workload, then from a **Developer PowerShell** (not Git Bash):
```powershell
cd contracts
cargo install cargo-odra --locked
cargo odra build -b casper      # outputs contracts/wasm/yield_vault.wasm
```

### Also grab the proxy-caller wasm (for browser deposits)
The payable `deposit()` is called from the browser via Odra's **proxy-caller** wasm.
After `cargo odra build`, copy the proxy wasm Odra produces (e.g.
`proxy_caller.wasm` / `proxy_caller_with_return.wasm`, under `contracts/wasm/` or
`~/.cargo` odra resources) to:
```
backend/proxy_caller.wasm
```
The backend serves it at `GET /vault/proxy-wasm` (already implemented).

---

## 2. Deploy to Testnet

Needs a Testnet key with ~250+ CSPR ([faucet](https://testnet.cspr.live/tools/faucet)).
```powershell
# from repo root, in PowerShell
./scripts/deploy_testnet.ps1
```
Copy the printed **contract-package hash** — this is your new `VAULT_CONTRACT_HASH`.

---

## 3. Propagate the new hash

| Where | Key | Value |
|---|---|---|
| `backend/.env` + **Coolify** env | `VAULT_CONTRACT_HASH` | new package hash |
| **Coolify** frontend env | `NEXT_PUBLIC_VAULT_PACKAGE_HASH` | new package hash (`hash-…` or bare hex) |
| Dashboard | — | click **Register Agent** (new contract ⇒ agent not registered yet) |

Then **redeploy** backend + frontend on Coolify.

---

## 4. Wire the real deposit/withdraw into the UI

The builders are ready in [`frontend/src/lib/vaultDeposit.ts`](../frontend/src/lib/vaultDeposit.ts)
(`buildDepositDeploy`, `buildWithdrawDeploy`, `isRealVaultEnabled`). They stay dormant
until `NEXT_PUBLIC_VAULT_PACKAGE_HASH` is set, so nothing changes before deploy.

In [`frontend/src/components/VaultControls.tsx`](../frontend/src/components/VaultControls.tsx),
replace the body of `doDeposit` (currently a native transfer to the agent account) with:
```ts
import { buildDepositDeploy, isRealVaultEnabled } from "@/lib/vaultDeposit";

// inside doDeposit(), when isRealVaultEnabled():
const { deploy } = await buildDepositDeploy(account.publicKey, amount);
const deployBody = await signDeploy(deploy, account.publicKey,
                                    await import("casper-js-sdk"));
const hash = await submitDeploy(deployBody);
```
Add a matching **Withdraw** control using `buildWithdrawDeploy`. Keep the old
transfer-to-agent path as a fallback when `!isRealVaultEnabled()`.

---

## 5. Verify it's really real

1. Deposit e.g. 100 CSPR from the wallet.
2. Open the contract on [testnet.cspr.live](https://testnet.cspr.live) → the **contract
   purse balance** should rise by ~100 CSPR (minus fee). `get_tvl()` returns it.
3. `withdraw(50)` → your wallet balance rises, purse falls, `Withdrawn` event emitted.
4. Now the README's "real-world applicability" claim is backed by on-chain fact:
   the vault holds and returns real CSPR.

---

## Status checklist

- [x] Contract: payable `deposit()` + CSPR-returning `withdraw()` + `get_tvl()`
- [x] CI workflow to build the wasm without a local toolchain
- [x] Backend `GET /vault/proxy-wasm` endpoint
- [x] Frontend deposit/withdraw builders (`vaultDeposit.ts`, flag-gated)
- [ ] Build wasm (CI) + copy proxy wasm to `backend/proxy_caller.wasm`
- [ ] Deploy to Testnet + propagate `VAULT_CONTRACT_HASH` / `NEXT_PUBLIC_VAULT_PACKAGE_HASH`
- [ ] Wire `vaultDeposit.ts` into `VaultControls.tsx` + add Withdraw control
- [ ] On-chain verify: purse balance rises on deposit, falls on withdraw
