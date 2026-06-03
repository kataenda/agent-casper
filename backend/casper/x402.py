"""
x402 Micropayment Protocol handler.
Official Casper AI Toolkit component — https://www.casper.network/ai
Facilitator: https://x402-facilitator.cspr.cloud
Spec: https://github.com/make-software/casper-x402/blob/master/docs/user-guide.md

Flow (per x402 spec):
  1. Agent requests a paid resource (HTTP call)
  2. Server returns 402 Payment Required + payment requirements
  3. Agent builds signed payment payload (EIP-712 / CEP-18 token approval)
  4. Agent attaches X-PAYMENT header and retries
  5. Resource server forwards to facilitator /verify then /settle
  6. Facilitator settles on-chain; resource server delivers response
"""

import hashlib
import time
import json
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Official CSPR.cloud x402 facilitator
FACILITATOR_URL = "https://x402-facilitator.cspr.cloud"

# CAIP-2 chain identifiers
CHAIN_TESTNET = "casper:casper-test"
CHAIN_MAINNET = "casper:casper"


class X402PaymentProof:
    def __init__(self, payer: str, recipient: str, amount_motes: int, nonce: str):
        self.payer = payer
        self.recipient = recipient
        self.amount_motes = amount_motes
        self.nonce = nonce
        self.timestamp = int(time.time())

    def to_header(self) -> str:
        payload = {
            "payer": self.payer,
            "recipient": self.recipient,
            "amount": self.amount_motes,
            "nonce": self.nonce,
            "ts": self.timestamp,
        }
        # Production: sign with agent's private key using EIP-712 typed-data
        # See: https://github.com/casper-ecosystem/casper-eip-712
        proof_hash = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        payload["proof"] = proof_hash
        return json.dumps(payload)


class X402Handler:
    """
    Attaches x402 payment headers to outbound HTTP requests.
    Uses CSPR.cloud official facilitator for on-chain settlement.
    """

    def __init__(
        self,
        agent_account: str,
        payment_amount_motes: int = 1_000_000,  # 0.001 CSPR
        enabled: bool = False,
        facilitator_url: str = FACILITATOR_URL,
        chain: str = CHAIN_TESTNET,
    ):
        self.agent_account = agent_account
        self.payment_amount = payment_amount_motes
        self.enabled = enabled
        self.facilitator_url = facilitator_url.rstrip("/")
        self.chain = chain
        self._nonce_counter = 0

    def _next_nonce(self) -> str:
        self._nonce_counter += 1
        return f"{int(time.time())}-{self._nonce_counter}"

    def payment_headers(self, recipient: str) -> dict:
        if not self.enabled:
            return {}

        proof = X402PaymentProof(
            payer=self.agent_account,
            recipient=recipient,
            amount_motes=self.payment_amount,
            nonce=self._next_nonce(),
        )
        return {
            "X-PAYMENT": proof.to_header(),
            "X-402-Network": self.chain,
        }

    async def get_supported_schemes(self) -> Optional[dict]:
        """
        GET /supported — Returns payment schemes and networks supported by the facilitator.
        https://x402-facilitator.cspr.cloud/supported
        """
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(f"{self.facilitator_url}/supported")
                resp.raise_for_status()
                return resp.json()
        except Exception as exc:
            logger.debug("x402 /supported failed: %s", exc)
            return None

    async def verify_payment(self, payment_payload: str) -> Optional[dict]:
        """
        POST /verify — Validates a payment payload without on-chain settlement.
        Use to pre-check before /settle.
        """
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.facilitator_url}/verify",
                    json={"payment": payment_payload, "chain": self.chain},
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as exc:
            logger.warning("x402 /verify failed: %s", exc)
            return None

    async def settle_payment(self, payment_payload: str) -> Optional[dict]:
        """
        POST /settle — Validates and settles payment on Casper Network.
        Returns deploy hash on success.
        """
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self.facilitator_url}/settle",
                    json={"payment": payment_payload, "chain": self.chain},
                )
                resp.raise_for_status()
                result = resp.json()
                logger.info("x402 settled: deploy_hash=%s", result.get("deploy_hash"))
                return result
        except Exception as exc:
            logger.warning("x402 /settle failed: %s", exc)
            return None

    def verify_incoming_payment(self, header_value: str) -> Optional[dict]:
        """Verifies an incoming x402 payment proof (for API providers)."""
        try:
            payload = json.loads(header_value)
            expected_hash = hashlib.sha256(
                json.dumps(
                    {k: v for k, v in payload.items() if k != "proof"},
                    sort_keys=True,
                ).encode()
            ).hexdigest()
            if payload.get("proof") == expected_hash:
                return payload
        except Exception:
            pass
        return None
