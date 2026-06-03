#!/usr/bin/env python3
"""
YieldVault Smart Contract Deployment Script
Deploys the compiled WASM to Casper Testnet and registers the AI agent address.

Usage (local):
    python deploy/deploy_vault.py \
        --key-path ./agent_secret_key.pem \
        --agent-account account-hash-<64hex>

Usage (GitHub Actions):
    Set secrets: AGENT_SECRET_KEY_PEM, CSPR_CLOUD_API_KEY
    Run workflow: Actions → Build & Deploy YieldVault

Output:
    Prints VAULT_CONTRACT_HASH → add to backend/.env
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

# Load .env from backend/ (local runs); CI sets env vars directly
_env_path = Path(__file__).parent.parent / "backend" / ".env"
if _env_path.exists():
    load_dotenv(_env_path)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s — %(message)s")
logger = logging.getLogger(__name__)

NODE_URL      = os.getenv("CASPER_NODE_URL",     "https://node.testnet.cspr.cloud")
CLOUD_BASE    = os.getenv("CSPR_CLOUD_BASE_URL", "https://api.testnet.cspr.cloud")
CLOUD_KEY     = os.getenv("CSPR_CLOUD_API_KEY",  "")
CHAIN_NAME    = "casper-test"
WASM_PATH     = Path(__file__).parent.parent / "contracts" / "wasm" / "yield_vault.wasm"
PAYMENT_MOTES = 150_000_000_000   # 150 CSPR — WASM deploy is expensive


# ── RPC helpers ────────────────────────────────────────────────────────────────

async def put_deploy_rpc(deploy_dict: dict) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            NODE_URL,
            json={"id": 1, "jsonrpc": "2.0", "method": "account_put_deploy",
                  "params": {"deploy": deploy_dict}},
        )
        resp.raise_for_status()
    result = resp.json()
    if "error" in result:
        raise RuntimeError(f"Node RPC error: {result['error']}")
    return result["result"]["deploy_hash"]


async def wait_for_deploy(deploy_hash: str, timeout: int = 180) -> dict:
    """Poll CSPR.cloud until deploy is finalized (max 3 minutes)."""
    headers  = {"Authorization": CLOUD_KEY, "Accept": "application/json"}
    url      = f"{CLOUD_BASE}/deploys/{deploy_hash}"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            async with httpx.AsyncClient(headers=headers, timeout=10) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    obj = resp.json().get("data", resp.json())
                    if obj.get("execution_results"):
                        status = obj["execution_results"][0].get("result", {})
                        if "Failure" in status:
                            raise RuntimeError(f"Deploy failed on-chain: {status['Failure']}")
                        logger.info("Deploy finalized!")
                        return obj
        except RuntimeError:
            raise
        except Exception:
            pass
        logger.info("Waiting for deploy %s…", deploy_hash[:16])
        await asyncio.sleep(8)
    raise TimeoutError(f"Deploy {deploy_hash} not finalized within {timeout}s")


async def get_contract_hash(deployer_public_key: str) -> str:
    """Find 'yield_vault' in deployer named keys after deployment."""
    headers = {"Authorization": CLOUD_KEY, "Accept": "application/json"}
    url     = f"{CLOUD_BASE}/accounts/{deployer_public_key}"
    async with httpx.AsyncClient(headers=headers, timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
    obj = resp.json().get("data", resp.json())
    for nk in obj.get("named_keys", []):
        if "yield_vault" in nk.get("name", "").lower():
            return nk["key"]
    raise RuntimeError(
        "Contract hash not found in deployer named keys.\n"
        "The named key should contain 'yield_vault' — check the deploy succeeded."
    )


# ── Deployment ─────────────────────────────────────────────────────────────────

async def deploy_vault(key_path: str, agent_account: str | None) -> None:
    try:
        import pycspr
        from pycspr.crypto import KeyAlgorithm
    except ImportError:
        sys.exit("ERROR: pycspr not installed.\nRun: pip install pycspr==0.12.4")

    if not WASM_PATH.exists():
        sys.exit(
            f"ERROR: WASM not found at {WASM_PATH}\n"
            "Build first:\n  cd contracts && cargo odra build -b casper\n"
            "Or run the GitHub Actions workflow."
        )

    logger.info("Loading keypair from %s", key_path)
    keypair = pycspr.parse_private_key(
        path_to_secret_key=key_path,
        key_algo=KeyAlgorithm.ED25519,
    )
    public_key_hex = keypair.account_key.hex()
    logger.info("Deployer public key: %s…", public_key_hex[:20])

    wasm_bytes = WASM_PATH.read_bytes()
    logger.info("WASM size: %d bytes (%.1f KB)", len(wasm_bytes), len(wasm_bytes) / 1024)

    # ── 1. Build + sign + submit WASM deploy ──────────────────────────────
    logger.info("Building deploy…")
    deploy_params = pycspr.create_deploy_parameters(
        account=keypair,
        chain_name=CHAIN_NAME,
    )
    payment = pycspr.create_standard_payment(PAYMENT_MOTES)

    # pycspr 0.12.x — ModuleBytes session for WASM upload
    from pycspr.types.cl import CLTypeKey
    session = pycspr.factory.create_deploy_session_wasm(
        module_bytes=wasm_bytes,
        args={},
    )

    deploy = pycspr.create_deploy(deploy_params, payment, session)
    deploy.approve(keypair)

    deploy_dict  = json.loads(pycspr.to_json(deploy))
    deploy_hash  = await put_deploy_rpc(deploy_dict)
    logger.info("Deploy submitted — hash: %s", deploy_hash)
    logger.info("Waiting for finalization (60–120 s typical on testnet)…")

    await wait_for_deploy(deploy_hash)

    # ── 2. Resolve contract hash ───────────────────────────────────────────
    logger.info("Resolving contract hash from account named keys…")
    contract_hash = await get_contract_hash(public_key_hex)
    logger.info("Contract hash: %s", contract_hash)

    # ── 3. Register agent ─────────────────────────────────────────────────
    if agent_account:
        logger.info("Registering agent: %s", agent_account)
        from pycspr.types.cl import CLV_Key
        hash_hex = contract_hash.removeprefix("hash-")

        reg_params  = pycspr.create_deploy_parameters(account=keypair, chain_name=CHAIN_NAME)
        reg_payment = pycspr.create_standard_payment(5_000_000_000)
        reg_session = pycspr.create_contract_call(
            contract_hash=bytes.fromhex(hash_hex),
            entry_point="register_agent",
            args={"agent": CLV_Key(bytes.fromhex(agent_account.removeprefix("account-hash-")))},
        )
        reg_deploy = pycspr.create_deploy(reg_params, reg_payment, reg_session)
        reg_deploy.approve(keypair)

        reg_dict = json.loads(pycspr.to_json(reg_deploy))
        reg_hash = await put_deploy_rpc(reg_dict)
        logger.info("Agent registration submitted — hash: %s", reg_hash)
        await wait_for_deploy(reg_hash)
        logger.info("Agent registered successfully!")

    # ── 4. Summary ────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("DEPLOYMENT SUCCESSFUL")
    print("=" * 60)
    print(f"Contract hash : {contract_hash}")
    print(f"Deploy hash   : {deploy_hash}")
    if agent_account:
        print(f"Agent account : {agent_account}")
    print("\nAdd to backend/.env:")
    print(f"  VAULT_CONTRACT_HASH={contract_hash}")
    print("=" * 60)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deploy YieldVault to Casper Testnet")
    parser.add_argument("--key-path",       default=os.getenv("AGENT_SECRET_KEY_PATH", "./agent_secret_key.pem"))
    parser.add_argument("--agent-account",  default=os.getenv("AGENT_ACCOUNT_HASH", ""))
    args = parser.parse_args()

    if not os.path.isfile(args.key_path):
        sys.exit(f"ERROR: Key file not found: {args.key_path}\n"
                 "Generate with: casper-client keygen ./keys")

    asyncio.run(deploy_vault(
        key_path=args.key_path,
        agent_account=args.agent_account or None,
    ))
