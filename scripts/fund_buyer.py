#!/usr/bin/env python3
"""
Fund the buyer agent with CEP-18 X402 tokens (agent -> buyer `transfer`) so the
buyer can then pay the agent via x402 `transfer_with_authorization` — the setup
step for a REAL agent-to-agent on-chain settlement (see scripts/buyer_pays_agent.py).

Prereq: the X402 token is deployed (scripts/deploy_x402_token.py) and the agent
holds the supply; X402_ASSET set in backend/.env. The buyer identity comes from
buyer_key.pem (scripts/gen_buyer_key.py / gen_buyer_key.py). Testnet.

Run from the repo root:
    python scripts/fund_buyer.py
    python scripts/fund_buyer.py --amount 100000000000   # 100 X402 @ 9dp
"""
import argparse
import asyncio
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

import httpx
from dotenv import load_dotenv
import pycspr
from pycspr.types import StoredContractByHash
from pycspr.types.cl_values import CL_Key, CL_U256

load_dotenv(BACKEND / ".env")
NODE = os.getenv("CASPER_NODE_URL", "https://node.testnet.cspr.cloud/rpc")
API_KEY = os.getenv("CSPR_CLOUD_API_KEY", "")
KEY_PATH = os.getenv("AGENT_SECRET_KEY_PATH", "./agent_secret_key.pem")
ASSET = os.getenv("X402_ASSET", "")
GAS = 5_000_000_000  # 5 CSPR install gas for a CEP-18 transfer


def headers():
    return {"Authorization": API_KEY} if API_KEY else {}


async def rpc(method, params):
    async with httpx.AsyncClient(timeout=30, headers=headers()) as c:
        r = await c.post(NODE, json={"id": 1, "jsonrpc": "2.0", "method": method, "params": params})
        r.raise_for_status()
        return r.json()


async def resolve_version(pkg: str) -> str:
    d = await rpc("query_global_state", {"key": f"hash-{pkg}", "path": []})
    cp = d.get("result", {}).get("stored_value", {}).get("ContractPackage", {})
    vers = cp.get("versions", [])
    if not vers:
        raise SystemExit(f"no versions in package {pkg}: {d}")
    return vers[-1]["contract_hash"].replace("contract-", "")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--buyer-key", default=str(ROOT / "buyer_key.pem"))
    ap.add_argument("--amount", type=int, default=100_000_000_000, help="token base units (default 100 X402 @9dp)")
    args = ap.parse_args()

    if not ASSET:
        sys.exit("X402_ASSET not set in backend/.env — deploy the token first")

    agent = pycspr.parse_private_key(pathlib.Path(KEY_PATH))
    buyer = pycspr.parse_private_key(pathlib.Path(args.buyer_key), pycspr.KeyAlgorithm.ED25519)
    buyer_acct = "account-hash-" + buyer.account_hash.hex()
    print("  agent (sender):", agent.account_key.hex())
    print("  buyer (recip) :", buyer_acct)

    vh = await resolve_version(ASSET)
    print("  token version :", vh)

    params = pycspr.create_deploy_parameters(account=agent, chain_name="casper-test")
    payment = pycspr.create_standard_payment(GAS)
    session = StoredContractByHash(
        args={"recipient": CL_Key.from_string(buyer_acct), "amount": CL_U256(args.amount)},
        entry_point="transfer", hash=bytes.fromhex(vh),
    )
    deploy = pycspr.create_deploy(params, payment, session)
    deploy.approve(agent)

    res = await rpc("account_put_deploy", {"deploy": pycspr.to_json(deploy)})
    if "error" in res:
        raise SystemExit(f"  RPC error: {res['error']}")
    dh = res["result"]["deploy_hash"]
    print("\n  TRANSFER deploy hash:", dh)
    print("  https://testnet.cspr.live/deploy/" + dh)
    print("  Wait for Success, then run: python scripts/buyer_pays_agent.py")


if __name__ == "__main__":
    asyncio.run(main())
