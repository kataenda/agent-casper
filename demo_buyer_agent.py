"""
Demo: a BUYER AGENT that pays Agent Casper over x402 to consume its services.

This is the other side of the x402 loop — an independent agent (its own ed25519
identity) that discovers Agent Casper's paid endpoints and buys premium data:

    /x402/decision  -> a fresh Claude AI rebalance recommendation (RWA-aware)
    /x402/rwa-feed   -> aggregated RWA prices verified on-chain

Flow per endpoint (official CSPR.cloud x402 `exact` scheme):
    1. GET resource            -> 402 Payment Required + {resource, accepts:[...]}
    2. build a TransferWithAuthorization and sign the EIP-712 digest with the
       BUYER's ed25519 key -> base64 X-PAYMENT header
    3. retry with X-PAYMENT    -> 200 OK + the premium payload

By default the buyer generates a brand-new keypair each run, so this proves ANY
agent can pay — not just Agent Casper itself. The server verifies the EIP-712 proof
and settles via the facilitator (a CEP-18 transfer_with_authorization); if the
provider does not yet hold the token the request is still honoured and settlement
is reported as pending — the cryptographic proof is what gates access.

Usage (no venv activation needed):
    python demo_buyer_agent.py
    python demo_buyer_agent.py --base http://localhost:8000
    python demo_buyer_agent.py --only decision
"""
import argparse
import sys

import httpx

# Force UTF-8 so server text containing arrows/ellipsis prints on Windows (cp1252).
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

sys.path.insert(0, "backend")
from casper.x402 import X402Handler, CHAIN_MAINNET           # noqa: E402
from pycspr.crypto import KeyAlgorithm, get_key_pair, get_pvk_pem_from_bytes  # noqa: E402

DEFAULT_BASE = "https://agentcasper.soenic.com"
RESOURCES = ["/x402/decision", "/x402/rwa-feed"]


def banner(title):
    print(f"\n{'=' * 66}\n  {title}\n{'=' * 66}")


def new_buyer_key() -> str:
    """Generate a fresh ed25519 buyer identity, return a temp PEM path."""
    import tempfile
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
    body = r1.json()
    requirements = body["accepts"][0]
    resource_obj = body.get("resource")
    extra = requirements.get("extra") or {}
    print(f"      amount={requirements['amount']} {extra.get('symbol', '')} "
          f"| network={requirements['network']} | asset={requirements['asset'][:16]}… "
          f"| payTo={requirements['payTo'][:18]}…")

    # 2. Build + EIP-712-sign the X-PAYMENT proof with the BUYER's key.
    payload = buyer.build_payment(requirements, resource=resource_obj)
    header = buyer.encode_header(payload)
    print(f"  [2] signed X-PAYMENT  ->  sig={payload['payload']['signature'][:22]}… "
          f"(01 + 64B ed25519 over EIP-712 digest), {len(header)}B base64")
    print(f"      payer={payload['payload']['authorization']['from'][:18]}…")

    # 3. Retry WITH payment -> expect 200 + premium data
    r2 = httpx.get(url, headers={"X-PAYMENT": header}, timeout=60)
    print(f"  [3] GET + X-PAYMENT   ->  HTTP {r2.status_code}")
    if r2.status_code != 200:
        print(f"      {r2.text[:240]}")
        return
    data = r2.json()
    s = data.get("settlement", {})
    s = s if isinstance(s, dict) else {"settlement": s}
    print(f"      paid={data.get('paid')} | settlement={s.get('settlement')}"
          + (f" | tx={s.get('tx_hash')}" if s.get("tx_hash") else ""))

    if resource == "/x402/decision" and data.get("recommendation"):
        rec = data["recommendation"]
        print(f"      AI -> {rec['action']} | {rec['conservative_pct']}/{rec['balanced_pct']}/"
              f"{rec['aggressive_pct']} | conf {rec['confidence']:.0%} | risk {rec['risk_level']}")
    elif data.get("rwa_prices"):
        for a in data["rwa_prices"]:
            v = a.get("price_usd") or a.get("yield_pct")
            print(f"      {a['asset_id']:7} {v} {a['unit']}  ({a['source']})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=DEFAULT_BASE, help="Agent Casper backend base URL")
    ap.add_argument("--key", default="", help="Buyer PEM (default: a fresh ed25519 key)")
    ap.add_argument("--only", default="", choices=["decision", "rwa-feed"],
                    help="Buy only ONE resource")
    args = ap.parse_args()

    resources = [f"/x402/{args.only}"] if args.only else RESOURCES
    buyer = X402Handler(
        agent_account="", key_path=(args.key or new_buyer_key()),
        chain=CHAIN_MAINNET, enabled=True,
    )
    banner("BUYER AGENT — independent x402 client (official exact scheme)")
    print(f"  buyer public key : {buyer.public_key_hex}")
    print(f"  buyer address    : {buyer.address}")
    print(f"  target backend   : {args.base}")

    for resource in resources:
        buy(buyer, args.base, resource)

    print("\n  done — buyer paid Agent Casper for every resource via x402.\n")


if __name__ == "__main__":
    main()
