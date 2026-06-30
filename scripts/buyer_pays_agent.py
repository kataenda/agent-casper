#!/usr/bin/env python3
"""
REAL agent-to-agent on-chain settlement: the BUYER agent (buyer_key.pem — its own
ed25519 identity, distinct from Agent Casper) pays the Agent Casper provider via the
official x402 `exact` scheme. The CSPR.cloud facilitator submits a CEP-18
`transfer_with_authorization` on Casper testnet — a real token transfer
buyer -> provider, viewable on cspr.live. This is the machine economy literally on-chain.

Prereq: scripts/fund_buyer.py has given the buyer some X402 tokens.

Run from the repo root:
    python scripts/buyer_pays_agent.py
    python scripts/buyer_pays_agent.py --amount 1000000000   # 1 X402 @ 9dp
"""
import argparse
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
from casper.x402 import X402Handler, CHAIN_TESTNET

load_dotenv(BACKEND / ".env")
KEY = os.getenv("CSPR_CLOUD_API_KEY", "")
FAC = os.getenv("X402_FACILITATOR_URL", "https://x402-facilitator.cspr.cloud")
ASSET = os.getenv("X402_ASSET", "")
NAME = os.getenv("X402_TOKEN_NAME", "Casper X402 Token")
VERSION = os.getenv("X402_TOKEN_VERSION", "1")
DECIMALS = int(os.getenv("X402_TOKEN_DECIMALS", "9"))


def agent_address() -> str:
    """'00' + agent account hash, derived from the agent key — the provider payTo."""
    kp = pycspr.parse_private_key(pathlib.Path(os.getenv("AGENT_SECRET_KEY_PATH", "./agent_secret_key.pem")))
    return "00" + kp.account_hash.hex()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--buyer-key", default=str(ROOT / "buyer_key.pem"))
    ap.add_argument("--amount", type=int, default=1_000_000_000, help="token base units (default 1 X402 @9dp)")
    args = ap.parse_args()

    if not ASSET:
        sys.exit("X402_ASSET not set in backend/.env — deploy the token first")

    pay_to = agent_address()
    h = X402Handler(agent_account="", key_path=args.buyer_key, cloud_api_key=KEY, enabled=True,
                    facilitator_url=FAC, chain=CHAIN_TESTNET, pay_to=pay_to,
                    asset=ASSET, token_name=NAME, token_version=VERSION, token_decimals=DECIMALS)

    reqs = h.requirements("https://agentcasper.soenic.com/x402/decision", amount=args.amount)
    payload = h.build_payment(reqs)
    print("  payer (BUYER) :", h.address)
    print("  payTo (AGENT) :", reqs["payTo"])
    print("  asset         :", ASSET)
    print("  amount        :", args.amount)
    if h.address == reqs["payTo"]:
        sys.exit("  payer and payTo are identical — buyer must be a DIFFERENT account than the agent")

    rv = httpx.post(f"{FAC}/verify", headers={"Authorization": KEY, "Content-Type": "application/json"},
                    json={"paymentPayload": payload, "paymentRequirements": reqs}, timeout=30)
    print(f"\n  /verify -> HTTP {rv.status_code}  {rv.text[:160]}")
    if not (rv.status_code == 200 and rv.json().get("isValid")):
        sys.exit("  verify failed — check token metadata (name/version/decimals) matches the deployed token")

    rs = httpx.post(f"{FAC}/settle", headers={"Authorization": KEY, "Content-Type": "application/json"},
                    json={"paymentPayload": payload, "paymentRequirements": reqs}, timeout=120)
    print(f"\n  /settle -> HTTP {rs.status_code}")
    print("  " + rs.text[:500])
    try:
        d = rs.json()
        tx = d.get("transaction") or d.get("txHash")
        if d.get("success") and tx:
            print(f"\n  [REAL AGENT-TO-AGENT SETTLE] transfer_with_authorization tx: {tx}")
            print(f"  https://testnet.cspr.live/transaction/{tx}")
        else:
            print(f"\n  settle not successful: {d.get('errorReason') or d.get('error')}")
    except Exception as e:
        print("  parse error:", e)


if __name__ == "__main__":
    main()
