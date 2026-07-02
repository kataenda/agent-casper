#!/usr/bin/env python3
"""
Trigger a REAL x402 settlement THROUGH THE LIVE PRODUCTION API (not by calling the
facilitator directly). Unlike scripts/x402_settle_real.py — which talks to the
CSPR.cloud facilitator itself — this script exercises the deployed backend:

  1. GET the protected resource with no payment  -> server replies HTTP 402 +
     PaymentRequirements (the `accepts` array).
  2. Build a signed `X-PAYMENT` header for exactly those requirements.
  3. POST the resource again WITH the header -> the *production server* verifies the
     proof and settles the CEP-18 transfer_with_authorization on-chain, then returns
     the settlement tx.

So the on-chain settle is performed by production, and you see production's response.

Run from the repo root:
    python scripts/pay_live_endpoint.py
    python scripts/pay_live_endpoint.py --base https://agentcasper.soenic.com
    python scripts/pay_live_endpoint.py --resource /premium/yield-forecast
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

DEFAULT_BASE = os.getenv("X402_LIVE_BASE", "https://agentcasper.soenic.com")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=DEFAULT_BASE, help="live backend base URL")
    ap.add_argument("--resource", default="/premium/yield-forecast",
                    help="protected resource path (default: /premium/yield-forecast)")
    args = ap.parse_args()

    if not ASSET:
        sys.exit("X402_ASSET not set — set it in backend/.env to match the deployed token")

    url = args.base.rstrip("/") + args.resource

    h = X402Handler(agent_account="", key_path=KEY_PATH, cloud_api_key=KEY, enabled=True,
                    facilitator_url=FAC, chain=CHAIN_TESTNET, pay_to="",
                    asset=ASSET, token_name=NAME, token_version=VERSION, token_decimals=DECIMALS)

    # 1. Ask the live server for its PaymentRequirements (the 402 challenge).
    print(f"  GET  {url}")
    r0 = httpx.get(url, timeout=30)
    print(f"  -> HTTP {r0.status_code}")
    if r0.status_code != 402:
        print(f"  unexpected (expected 402 challenge):\n  {r0.text[:400]}")
        return
    challenge = r0.json()
    accepts = challenge.get("accepts") or []
    if not accepts:
        sys.exit("  402 response had no `accepts` requirements — cannot build payment")
    reqs = accepts[0]
    reqs.setdefault("resource", url)
    print(f"  payTo   : {reqs.get('payTo')}")
    print(f"  asset   : {reqs.get('asset')}")
    print(f"  amount  : {reqs.get('amount')} (base units)  network={reqs.get('network')}")

    # 2. Build a signed X-PAYMENT header for exactly those requirements.
    header = h.encode_header(h.build_payment(reqs))
    print(f"  payer   : {h.address}")

    # 3. POST the resource WITH payment -> production verifies + settles on-chain.
    print(f"\n  POST {url}  (X-PAYMENT attached)")
    r1 = httpx.post(url, headers={"X-PAYMENT": header, "X-402-Network": h.chain},
                    timeout=180)
    print(f"  -> HTTP {r1.status_code}")
    print(f"  {r1.text[:600]}")
    try:
        d = r1.json()
        tx = d.get("settlement_tx")
        if tx:
            print(f"\n  [LIVE API SETTLE] settlement={d.get('settlement')}  tx: {tx}")
            print(f"  {d.get('explorer_url') or f'https://testnet.cspr.live/transaction/{tx}'}")
        else:
            print(f"\n  settlement: {d.get('settlement')} (no tx returned)")
    except Exception:
        pass


if __name__ == "__main__":
    main()
