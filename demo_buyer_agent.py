"""
Demo: a BUYER AGENT that pays Agent Casper over x402 to consume its services.

This is the other side of the x402 loop — an independent agent (its own ed25519
identity) that discovers Agent Casper's paid endpoints and buys premium data:

    /x402/decision  -> a fresh Claude AI rebalance recommendation (RWA-aware)
    /x402/rwa-feed   -> aggregated RWA prices verified on-chain

Flow per endpoint (real x402 v2, Casper mainnet):
    1. GET resource            -> 402 Payment Required + PaymentRequirements
    2. build + ed25519-sign an X-PAYMENT authorization with the BUYER's key
    3. retry with X-PAYMENT    -> 200 OK + the premium payload

The buyer generates a brand-new keypair each run, so this proves ANY agent can
pay — not just Agent Casper itself. No CSPR is spent: the cryptographic proof is
verified server-side; on-chain settlement only fires for a funded mainnet payer.

Usage (no venv activation needed):
    .venv\\Scripts\\python.exe demo_buyer_agent.py
    .venv\\Scripts\\python.exe demo_buyer_agent.py --base http://localhost:8000
"""
import argparse
import sys
import tempfile

import httpx

# Force UTF-8 so server text containing arrows/ellipsis prints on Windows (cp1252).
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

sys.path.insert(0, "backend")
import casper.x402 as x402mod                                # noqa: E402
from casper.x402 import X402Handler, CHAIN_MAINNET           # noqa: E402
from pycspr.crypto import KeyAlgorithm, get_key_pair, get_pvk_pem_from_bytes  # noqa: E402

DEFAULT_BASE = "https://agentcasper.soenic.com"
RESOURCES = ["/x402/decision", "/x402/rwa-feed"]


def banner(title):
    print(f"\n{'=' * 66}\n  {title}\n{'=' * 66}")


def new_buyer_key() -> str:
    """Generate a fresh ed25519 buyer identity, return the temp PEM path."""
    pvk, _pbk = get_key_pair(KeyAlgorithm.ED25519)
    pem = get_pvk_pem_from_bytes(pvk, KeyAlgorithm.ED25519)
    f = tempfile.NamedTemporaryFile(mode="wb", suffix=".pem", delete=False)
    f.write(pem)
    f.close()
    return f.name


def buy(buyer: X402Handler, base: str, resource: str):
    url = base.rstrip("/") + resource

    banner(f"BUY  {resource}")

    # 1. Request without payment -> expect 402 + PaymentRequirements
    r1 = httpx.get(url, timeout=30)
    print(f"  [1] GET {resource}  ->  HTTP {r1.status_code} (no payment)")
    if r1.status_code != 402:
        print(f"      unexpected: {r1.text[:200]}")
        return
    requirements = r1.json()["accepts"][0]
    price = int(requirements["amount"]) / 1e9
    print(f"      price={price:g} CSPR | network={requirements['network']} "
          f"| payTo={requirements['payTo'][:20]}...")

    # 2. Build + ed25519-sign the X-PAYMENT proof.
    #    Backdate validAfter to absorb client/server clock skew (build_payment uses
    #    now with no buffer, so a few seconds of skew = "not yet valid" rejection).
    real_time = x402mod.time.time
    x402mod.time.time = lambda: real_time() - 120
    try:
        payload = buyer.build_payment(requirements)
    finally:
        x402mod.time.time = real_time
    header = buyer.encode_header(payload)
    print(f"  [2] signed X-PAYMENT  ->  sig={payload['payload']['signature'][:22]}... "
          f"(01 + 64B ed25519), {len(header)}B base64")

    # 3. Retry WITH payment -> expect 200 + premium data
    r2 = httpx.get(url, headers={"X-PAYMENT": header, "X-402-Network": CHAIN_MAINNET}, timeout=60)
    print(f"  [3] GET + X-PAYMENT   ->  HTTP {r2.status_code}")
    if r2.status_code != 200:
        print(f"      {r2.text[:240]}")
        return
    body = r2.json()
    settle = body.get("settlement", {})
    print(f"      paid={body.get('paid')} | settlement={settle.get('settlement')}"
          + (f" | tx={settle.get('tx_hash')}" if settle.get("tx_hash") else ""))

    if resource == "/x402/decision":
        rec = body["recommendation"]
        print(f"      AI -> {rec['action']} | {rec['conservative_pct']}/{rec['balanced_pct']}/"
              f"{rec['aggressive_pct']} | conf {rec['confidence']:.0%} | risk {rec['risk_level']}")
        print(f"      reasoning: {rec['reasoning'][:120]}...")
    else:
        for a in body["rwa_prices"]:
            v = a.get("price_usd") or a.get("yield_pct")
            print(f"      {a['asset_id']:7} {v} {a['unit']}  ({a['source']})")
        for asset, proof in (body.get("onchain_proof") or {}).items():
            print(f"      on-chain {asset}: {proof['explorer_url']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=DEFAULT_BASE, help="Agent Casper backend base URL")
    args = ap.parse_args()

    buyer = X402Handler(agent_account="", key_path=new_buyer_key(),
                        chain=CHAIN_MAINNET, enabled=True)
    banner("BUYER AGENT — independent x402 client")
    print(f"  buyer public key : {buyer.public_key_hex}")
    print(f"  target backend   : {args.base}")

    for resource in RESOURCES:
        buy(buyer, args.base, resource)

    print("\n  done — buyer paid Agent Casper for every resource via x402.\n")


if __name__ == "__main__":
    main()
