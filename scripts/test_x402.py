#!/usr/bin/env python3
"""
Step-by-step x402 test for Agent Casper — one command runs every check in order:

    STEP 1  facilitator /supported        (the official CSPR.cloud schemes)
    STEP 2  compliance proof              (our payload -> /verify -> isValid:true)
    STEP 3  buyer roundtrip               (402 -> EIP-712 X-PAYMENT -> 200 + data)

Usage (from the repo root):
    python scripts/test_x402.py
    python scripts/test_x402.py --base http://localhost:8000     # test a local server
    python scripts/test_x402.py --only decision                  # one provider resource

Needs backend/.env (CSPR_CLOUD_API_KEY) and backend/agent_secret_key.pem.
"""
import argparse
import os
import sys
import pathlib

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
from casper.x402 import X402Handler, CHAIN_TESTNET, CHAIN_MAINNET
from pycspr.crypto import KeyAlgorithm, get_key_pair, get_pvk_pem_from_bytes

load_dotenv(BACKEND / ".env")
KEY = os.getenv("CSPR_CLOUD_API_KEY", "")
FAC = os.getenv("X402_FACILITATOR_URL", "https://x402-facilitator.cspr.cloud")
KEY_PATH = os.getenv("AGENT_SECRET_KEY_PATH", "./agent_secret_key.pem")
ASSET = os.getenv("X402_ASSET") or "9824d60dc3a5c44a20b9fd260a412437933835b52fc683d8ae36e4ec2114843e"
NAME = os.getenv("X402_TOKEN_NAME") or "USDC"
VERSION = os.getenv("X402_TOKEN_VERSION") or "1"


def step(n, title):
    print(f"\n{'=' * 68}\n  STEP {n} — {title}\n{'=' * 68}")


def fresh_key() -> str:
    import tempfile
    pvk, _ = get_key_pair(KeyAlgorithm.ED25519)
    pem = get_pvk_pem_from_bytes(pvk, KeyAlgorithm.ED25519)
    f = tempfile.NamedTemporaryFile(mode="wb", suffix=".pem", delete=False)
    f.write(pem); f.close()
    return f.name


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://agentcasper.soenic.com",
                    help="Agent Casper backend base URL (default: live)")
    ap.add_argument("--only", default="", choices=["decision", "rwa-feed"])
    args = ap.parse_args()
    results = []

    if not KEY:
        sys.exit("CSPR_CLOUD_API_KEY not set in backend/.env")

    # ── STEP 1 ────────────────────────────────────────────────────────────────
    step(1, "facilitator /supported")
    r = httpx.get(f"{FAC}/supported", headers={"Authorization": KEY}, timeout=15)
    print(f"  GET {FAC}/supported -> HTTP {r.status_code}")
    ok1 = r.status_code == 200
    if ok1:
        for k in r.json().get("kinds", []):
            print(f"    scheme={k.get('scheme')} network={k.get('network')} v{k.get('x402Version')}")
    results.append(("facilitator reachable", ok1))

    # ── STEP 2 ────────────────────────────────────────────────────────────────
    step(2, "compliance proof — our payload against the official /verify")
    h = X402Handler(agent_account="", key_path=KEY_PATH, cloud_api_key=KEY, enabled=True,
                    facilitator_url=FAC, chain=CHAIN_TESTNET, pay_to="",
                    asset=ASSET, token_name=NAME, token_version=VERSION)
    h.pay_to = h.address
    reqs = h.requirements("https://agentcasper.soenic.com/premium/yield-forecast")
    payload = h.build_payment(reqs)
    print(f"  payer={h.address[:20]}…  asset={ASSET[:16]}…")
    rv = httpx.post(f"{FAC}/verify", headers={"Authorization": KEY, "Content-Type": "application/json"},
                    json={"paymentPayload": payload, "paymentRequirements": reqs}, timeout=30)
    print(f"  POST {FAC}/verify -> HTTP {rv.status_code}  {rv.text[:120]}")
    ok2 = rv.status_code == 200 and rv.json().get("isValid") is True
    print(f"  -> {'isValid: true (CONFORMANT)' if ok2 else 'FAILED'}")
    results.append(("payload conforms (facilitator isValid)", ok2))

    # ── STEP 3 ────────────────────────────────────────────────────────────────
    step(3, f"buyer roundtrip against {args.base}")
    buyer = X402Handler(agent_account="", key_path=fresh_key(), chain=CHAIN_MAINNET, enabled=True)
    print(f"  buyer address = {buyer.address[:20]}…  (fresh random identity)")
    resources = [f"/x402/{args.only}"] if args.only else ["/x402/decision", "/x402/rwa-feed"]
    for res in resources:
        url = args.base.rstrip("/") + res
        print(f"\n  --- {res} ---")
        r1 = httpx.get(url, timeout=30)
        print(f"  [1] GET (no pay)      -> HTTP {r1.status_code}")
        if r1.status_code != 402:
            print(f"      unexpected: {r1.text[:160]}")
            results.append((f"buyer {res}", False)); continue
        body = r1.json()
        req = body["accepts"][0]
        print(f"      amount={req['amount']} | network={req['network']} | payTo={req['payTo'][:16]}…")
        pay = buyer.build_payment(req, resource=body.get("resource"))
        r2 = httpx.get(url, headers={"X-PAYMENT": buyer.encode_header(pay)}, timeout=60)
        ok = r2.status_code == 200 and r2.json().get("paid") is True
        print(f"  [2] signed X-PAYMENT  -> sig={pay['payload']['signature'][:18]}…")
        print(f"  [3] GET + X-PAYMENT   -> HTTP {r2.status_code}  paid={r2.json().get('paid') if r2.status_code==200 else '-'}")
        if r2.status_code != 200:
            print(f"      {r2.text[:160]}")
        results.append((f"buyer paid {res}", ok))

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'=' * 68}\n  SUMMARY\n{'=' * 68}")
    for name, ok in results:
        print(f"  [{'PASS' if ok else 'FAIL'}]  {name}")
    sys.exit(0 if all(ok for _, ok in results) else 1)


if __name__ == "__main__":
    main()
