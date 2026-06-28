#!/usr/bin/env python3
"""
Trigger a REAL on-chain x402 settlement: the agent (which holds the CEP-18 x402
token) signs a TransferWithAuthorization and the official CSPR.cloud facilitator
submits it as a `transfer_with_authorization` deploy — a real token transfer on
testnet, viewable on cspr.live.

Prereqs (do these first):
  1. python scripts/deploy_x402_token.py        # deploy the token, agent holds supply
  2. set X402_ASSET / X402_TOKEN_NAME / X402_TOKEN_VERSION / X402_TOKEN_DECIMALS in
     backend/.env (and Coolify) to the deployed token's values

Run from the repo root:
    python scripts/x402_settle_real.py
    python scripts/x402_settle_real.py --to <00+accounthash>   # pay another account
"""
import argparse
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import httpx
from dotenv import load_dotenv
from casper.x402 import X402Handler, CHAIN_TESTNET

load_dotenv(BACKEND / ".env")
KEY = os.getenv("CSPR_CLOUD_API_KEY", "")
FAC = os.getenv("X402_FACILITATOR_URL", "https://x402-facilitator.cspr.cloud")
KEY_PATH = os.getenv("AGENT_SECRET_KEY_PATH", "./agent_secret_key.pem")
ASSET = os.getenv("X402_ASSET", "")
NAME = os.getenv("X402_TOKEN_NAME", "Casper X402 Token")
VERSION = os.getenv("X402_TOKEN_VERSION", "1")
DECIMALS = int(os.getenv("X402_TOKEN_DECIMALS", "9"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--amount", default="1000000000", help="token base units (default 1 token @9dp)")
    ap.add_argument("--to", default="", help="recipient '00'+accounthash (default: agent self)")
    args = ap.parse_args()

    if not ASSET:
        sys.exit("X402_ASSET not set — deploy the token first (scripts/deploy_x402_token.py) "
                 "and set X402_ASSET in backend/.env")

    h = X402Handler(agent_account="", key_path=KEY_PATH, cloud_api_key=KEY, enabled=True,
                    facilitator_url=FAC, chain=CHAIN_TESTNET, pay_to="",
                    asset=ASSET, token_name=NAME, token_version=VERSION, token_decimals=DECIMALS)
    h.pay_to = args.to or h.address

    reqs = h.requirements("https://agentcasper.soenic.com/premium/yield-forecast", amount=int(args.amount))
    payload = h.build_payment(reqs)
    print(f"  payer (agent) : {h.address}")
    print(f"  payTo         : {h.pay_to}")
    print(f"  asset         : {ASSET}")
    print(f"  amount        : {args.amount} (base units)")

    # 1. sanity: facilitator must accept the proof
    rv = httpx.post(f"{FAC}/verify", headers={"Authorization": KEY, "Content-Type": "application/json"},
                    json={"paymentPayload": payload, "paymentRequirements": reqs}, timeout=30)
    print(f"\n  /verify -> HTTP {rv.status_code}  {rv.text[:120]}")
    if not (rv.status_code == 200 and rv.json().get("isValid")):
        sys.exit("  verify failed — fix token metadata (name/version/decimals) to match the deployed token")

    # 2. settle on-chain via facilitator (real transfer_with_authorization)
    rs = httpx.post(f"{FAC}/settle", headers={"Authorization": KEY, "Content-Type": "application/json"},
                    json={"paymentPayload": payload, "paymentRequirements": reqs}, timeout=120)
    print(f"\n  /settle -> HTTP {rs.status_code}")
    print(f"  {rs.text[:400]}")
    try:
        d = rs.json()
        tx = d.get("transaction") or d.get("txHash")
        if d.get("success") and tx:
            print(f"\n  [REAL SETTLE] transfer_with_authorization tx: {tx}")
            print(f"  https://testnet.cspr.live/transaction/{tx}")
        else:
            print(f"\n  settle not successful: {d.get('errorReason') or d.get('error')}")
    except Exception:
        pass


if __name__ == "__main__":
    main()
