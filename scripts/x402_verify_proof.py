#!/usr/bin/env python3
"""
Proof that Agent Casper's x402 payments are conformant with the official CSPR.cloud
`exact` scheme: builds a real EIP-712-signed payment with the production X402Handler
and submits it to the live facilitator `/verify`, which must return isValid: true.

Usage (from backend/):
    python ../scripts/x402_verify_proof.py
Requires CSPR_CLOUD_API_KEY in backend/.env and the agent key at AGENT_SECRET_KEY_PATH.
"""
import os
import sys
import pathlib

# Run with backend/ on the path so `casper.*` imports resolve.
BACKEND = pathlib.Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

import httpx
from dotenv import load_dotenv
from casper.x402 import X402Handler, CHAIN_TESTNET

load_dotenv(BACKEND / ".env")
KEY = os.getenv("CSPR_CLOUD_API_KEY", "")
if not KEY:
    sys.exit("CSPR_CLOUD_API_KEY not set in backend/.env")
FAC = os.getenv("X402_FACILITATOR_URL", "https://x402-facilitator.cspr.cloud")
KEY_PATH = os.getenv("AGENT_SECRET_KEY_PATH", "./agent_secret_key.pem")
# A CEP-18 token with transfer_with_authorization (override via env for your token).
ASSET = os.getenv("X402_ASSET") or "9824d60dc3a5c44a20b9fd260a412437933835b52fc683d8ae36e4ec2114843e"
NAME = os.getenv("X402_TOKEN_NAME") or "USDC"
VERSION = os.getenv("X402_TOKEN_VERSION") or "1"

h = X402Handler(
    agent_account="", key_path=KEY_PATH, cloud_api_key=KEY, enabled=True,
    facilitator_url=FAC, chain=CHAIN_TESTNET, pay_to="",
    asset=ASSET, token_name=NAME, token_version=VERSION, token_decimals=6, token_symbol=NAME,
)
h.pay_to = h.address  # pay to self for the proof

reqs = h.requirements("https://agentcasper.soenic.com/premium/yield-forecast")
payload = h.build_payment(reqs)

print(f"payer address : {h.address}")
print(f"asset         : {ASSET}")
print(f"signature     : {payload['payload']['signature'][:34]}…")

resp = httpx.post(
    f"{FAC}/verify",
    headers={"Authorization": KEY, "Content-Type": "application/json"},
    json={"paymentPayload": payload, "paymentRequirements": reqs},
    timeout=30,
)
print(f"\nfacilitator {FAC}/verify -> HTTP {resp.status_code}")
print(resp.text)
data = resp.json()
ok = resp.status_code == 200 and data.get("isValid") is True
print("\n[PASS] payload conforms to the official x402 exact scheme"
      if ok else "\n[FAIL] see invalidReason above")
sys.exit(0 if ok else 1)
