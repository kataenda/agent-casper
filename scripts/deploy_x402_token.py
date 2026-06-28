#!/usr/bin/env python3
"""
Deploy the CEP-18 x402 token (transfer_with_authorization) to Casper testnet and
mint the full supply to the agent (the deploying account receives initial_supply).

This is the token the official CSPR.cloud facilitator settles against — once the
agent holds it, x402 /settle moves real tokens on-chain (a real transfer_with_
authorization tx on cspr.live).

WASM + install recipe come from make-software/casper-x402 (infra deployer):
    name="Casper X402 Token" symbol=X402 decimals=9 initial_supply=1e15 chain_id=<network>

Run from the repo root, on a machine that can reach the Casper node:
    python scripts/deploy_x402_token.py

Needs backend/.env: CASPER_NODE_URL, CSPR_CLOUD_API_KEY, AGENT_SECRET_KEY_PATH.
Agent needs ~800 CSPR testnet for gas.
"""
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
from pycspr.types import ModuleBytes
from pycspr.types.cl_values import CL_String, CL_U8, CL_U256, CL_Bool

load_dotenv(BACKEND / ".env")
NODE = os.getenv("CASPER_NODE_URL", "https://node.testnet.cspr.cloud/rpc")
API_KEY = os.getenv("CSPR_CLOUD_API_KEY", "")
KEY_PATH = os.getenv("AGENT_SECRET_KEY_PATH", "./agent_secret_key.pem")
CHAIN_NAME = "casper-test"              # node chain name
NETWORK = "casper:casper-test"          # CAIP-2 id used as the EIP-712 domain chain_name

WASM = ROOT / "contracts" / "x402" / "Cep18X402.wasm"
PKG_KEY_NAME = "agent_x402_package_hash"
PAYMENT_MOTES = 800_000_000_000         # 800 CSPR install gas

# These become the token + EIP-712 domain metadata. After deploy, set them in Coolify:
#   X402_TOKEN_NAME, X402_TOKEN_DECIMALS, network casper:casper-test.
TOKEN = dict(name="Casper X402 Token", symbol="X402", decimals=9,
             initial_supply=1_000_000_000_000_000)


def headers():
    return {"Authorization": API_KEY} if API_KEY else {}


async def put_deploy(deploy_dict: dict) -> str:
    async with httpx.AsyncClient(timeout=60, headers=headers()) as c:
        r = await c.post(NODE, json={"id": 1, "jsonrpc": "2.0",
                                     "method": "account_put_deploy",
                                     "params": {"deploy": deploy_dict}})
        r.raise_for_status()
        d = r.json()
        if "error" in d:
            raise RuntimeError(d["error"].get("message", str(d["error"])))
        return d["result"]["deploy_hash"]


async def main():
    if not WASM.is_file():
        sys.exit(f"WASM not found: {WASM}")
    kp = pycspr.parse_private_key(pathlib.Path(KEY_PATH))
    print(f"  deployer (agent) pubkey : {kp.account_key.hex()}")
    print(f"  node                    : {NODE}")
    print(f"  token                   : {TOKEN['name']} ({TOKEN['symbol']}), {TOKEN['decimals']} decimals")
    print(f"  initial_supply -> agent : {TOKEN['initial_supply']}")

    session = ModuleBytes(
        module_bytes=WASM.read_bytes(),
        args={
            "name":            CL_String(TOKEN["name"]),
            "symbol":          CL_String(TOKEN["symbol"]),
            "decimals":        CL_U8(TOKEN["decimals"]),
            "initial_supply":  CL_U256(TOKEN["initial_supply"]),
            "chain_id":        CL_String(NETWORK),
            "odra_cfg_is_upgradable":        CL_Bool(True),
            "odra_cfg_is_upgrade":           CL_Bool(False),
            "odra_cfg_allow_key_override":   CL_Bool(True),
            "odra_cfg_package_hash_key_name": CL_String(PKG_KEY_NAME),
        },
    )
    params = pycspr.create_deploy_parameters(account=kp, chain_name=CHAIN_NAME)
    payment = pycspr.create_standard_payment(PAYMENT_MOTES)
    deploy = pycspr.create_deploy(params, payment, session)
    deploy.approve(kp)

    print("\n  submitting install deploy (≈800 CSPR gas)…")
    deploy_hash = await put_deploy(pycspr.to_json(deploy))
    print(f"\n  DEPLOY HASH: {deploy_hash}")
    print(f"  track: https://testnet.cspr.live/deploy/{deploy_hash}")
    print(f"\n  When it shows Success, find the token PACKAGE HASH on the agent account:")
    print(f"    https://testnet.cspr.live/account/{kp.account_key.hex()}  ->  Named keys -> '{PKG_KEY_NAME}'")
    print("\n  Then set in Coolify and redeploy backend:")
    print(f"    X402_ASSET=<that package hash, 64 hex, no 'hash-'>")
    print(f"    X402_TOKEN_NAME=Casper X402 Token")
    print(f"    X402_TOKEN_VERSION=1")
    print(f"    X402_TOKEN_DECIMALS=9")
    print(f"    X402_TOKEN_SYMBOL=X402")


if __name__ == "__main__":
    asyncio.run(main())
