"""
Demo: full x402 pay-per-request flow against the live Agent Casper backend.

Runs the real client side of the protocol:
  1. GET the protected resource  -> HTTP 402 + PaymentRequirements
  2. Build + ed25519-sign an X-PAYMENT payload with the agent key
  3. Retry with the X-PAYMENT header -> HTTP 200 + premium data

By default this does NOT settle on-chain (no CSPR spent) so you can run it
repeatedly while rehearsing. Pass --settle to trigger a real on-chain transfer.

Usage (no venv activation needed):
    .venv\\Scripts\\python.exe demo_x402.py
    .venv\\Scripts\\python.exe demo_x402.py --settle
    .venv\\Scripts\\python.exe demo_x402.py --base http://localhost:8000
"""
import argparse
import json
import sys

import httpx

sys.path.insert(0, "backend")
from casper.x402 import X402Handler, CHAIN_TESTNET  # noqa: E402

KEY_PATH = "backend/agent_secret_key.pem"
DEFAULT_BASE = "https://agentcasper.soenic.com"
RESOURCE = "/premium/yield-forecast"


def line(title):
    print(f"\n{'='*64}\n  {title}\n{'='*64}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=DEFAULT_BASE, help="backend base URL")
    ap.add_argument("--settle", action="store_true",
                    help="let the server settle a REAL on-chain transfer (spends 2.5 CSPR)")
    args = ap.parse_args()

    url = args.base.rstrip("/") + RESOURCE
    settle_q = "true" if args.settle else "false"

    # Client-side handler: only needs the key to sign the proof.
    client = X402Handler(
        agent_account="",
        key_path=KEY_PATH,
        chain=CHAIN_TESTNET,
        enabled=True,
    )
    print(f"Payer public key: {client.public_key_hex}")

    # ── Step 1: request without payment -> 402 ────────────────────────────────
    line("STEP 1  ·  Request premium resource WITHOUT payment")
    r1 = httpx.get(url, timeout=30)
    print(f"HTTP {r1.status_code} {r1.reason_phrase}")
    requirements = r1.json()["accepts"][0]
    print(json.dumps(requirements, indent=2))
    assert r1.status_code == 402, "expected a 402 challenge"

    # ── Step 2: build + sign the payment ──────────────────────────────────────
    line("STEP 2  ·  Build + ed25519-sign the X-PAYMENT proof")
    # Backdate validAfter to absorb client/server clock skew. build_payment sets
    # validAfter=now with no buffer, so even a few seconds of skew makes the
    # server reject the proof as "not yet valid".
    import casper.x402 as x402mod
    _real_time = x402mod.time.time
    x402mod.time.time = lambda: _real_time() - 120
    try:
        payload = client.build_payment(requirements)
    finally:
        x402mod.time.time = _real_time
    header = client.encode_header(payload)
    print(f"signature : {payload['payload']['signature'][:34]}…  (01 + 64-byte ed25519)")
    print(f"nonce     : {payload['payload']['authorization']['nonce'][:24]}…  (replay protection)")
    print(f"X-PAYMENT : {header[:54]}…  (base64, {len(header)} chars)")

    # ── Step 3: retry WITH payment -> 200 + premium data ──────────────────────
    line(f"STEP 3  ·  Retry WITH X-PAYMENT  (settle={settle_q})")
    r2 = httpx.get(url, params={"settle": settle_q},
                   headers={"X-PAYMENT": header, "X-402-Network": client.chain},
                   timeout=60)
    print(f"HTTP {r2.status_code} {r2.reason_phrase}")
    body = r2.json()
    print(json.dumps(body, indent=2))

    tx = body.get("settlement_tx") or body.get("tx_hash")
    if tx:
        print(f"\n  on-chain settlement -> https://testnet.cspr.live/deploy/{tx}")
    elif not args.settle:
        print("\n  (proof verified; on-chain settlement skipped — rerun with --settle to spend 2.5 CSPR)")


if __name__ == "__main__":
    main()
