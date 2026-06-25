"""
x402 Micropayment Protocol — real implementation for Agent Casper.

Implements the HTTP-native x402 v2 "pay-per-request" flow on Casper Network:

  1. Client requests a protected resource.
  2. Server replies `402 Payment Required` + PaymentRequirements.
  3. Client builds a payment authorization, signs it with its ed25519
     private key (real cryptographic proof), and retries with `X-PAYMENT`.
  4. Server cryptographically verifies the signature, checks expiry + nonce,
     then settles the micropayment.

Cryptographic proof
    A real ed25519 signature (pycspr) over the canonical authorization digest.
    Only the holder of the agent's private key can produce it; anyone with the
    public key can verify it. (The previous version used a plain SHA-256 hash of
    public data, which is forgeable — that has been replaced.)

Settlement
    A real native CSPR transfer submitted on-chain via pycspr, returning a
    Casper deploy hash. Best-effort integration with the official CSPR.cloud
    facilitator (https://x402-facilitator.cspr.cloud) is attempted first via its
    `/settle` endpoint; on any failure we fall back to a direct on-chain transfer
    so a verifiable payment transaction is always produced.

Spec: https://github.com/make-software/casper-x402
Facilitator: https://x402-facilitator.cspr.cloud
"""

import base64
import hashlib
import json
import logging
import secrets
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Official CSPR.cloud x402 facilitator
FACILITATOR_URL = "https://x402-facilitator.cspr.cloud"

# CAIP-2 chain identifiers
CHAIN_TESTNET = "casper:casper-test"
CHAIN_MAINNET = "casper:casper"

X402_VERSION = 2
SCHEME_EXACT = "exact"

# Casper enforces a 2.5 CSPR floor on native transfers. Sub-CSPR "micropayments"
# require a CEP-18 token (what the official facilitator uses); for self-contained
# on-chain settlement we use native transfers at the network minimum.
MIN_NATIVE_TRANSFER_MOTES = 2_500_000_000  # 2.5 CSPR


# ── Canonicalisation + digest ───────────────────────────────────────────────

def _canonical(obj: dict) -> str:
    """Deterministic JSON encoding (sorted keys, no whitespace) for signing."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def _authorization_digest(authorization: dict) -> bytes:
    """blake2b-256 digest of the canonical authorization — the bytes that get signed."""
    return hashlib.blake2b(_canonical(authorization).encode(), digest_size=32).digest()


# ── Handler ──────────────────────────────────────────────────────────────────

class X402Handler:
    """
    Real x402 v2 handler.

    Client side : `build_payment`, `payment_header`, `pay`
    Server side : `requirements`, `verify_payment`
    Settlement  : `settle_onchain` (native CSPR transfer) + `facilitator_settle`
    """

    def __init__(
        self,
        agent_account: str,
        key_path: str = "",
        node_url: str = "",
        cloud_api_key: str = "",
        payment_amount_motes: int = MIN_NATIVE_TRANSFER_MOTES,  # 2.5 CSPR (native-transfer floor)
        enabled: bool = False,
        facilitator_url: str = FACILITATOR_URL,
        chain: str = CHAIN_TESTNET,
        pay_to: str = "",
        min_settle_interval_seconds: int = 3600,
    ):
        self.agent_account = agent_account
        self.key_path = key_path
        self.node_url = node_url
        self.cloud_api_key = cloud_api_key
        self.payment_amount = payment_amount_motes
        self.enabled = enabled
        self.facilitator_url = facilitator_url.rstrip("/")
        self.chain = chain
        self.pay_to = pay_to
        self.min_settle_interval = min_settle_interval_seconds

        self._kp = None
        self._used_nonces: set[str] = set()
        self._last_settle_ts: float = 0.0

    # ── Keypair ────────────────────────────────────────────────────────────

    def _keypair(self):
        if self._kp is None:
            import pathlib
            import pycspr
            self._kp = pycspr.parse_private_key(pathlib.Path(self.key_path))
        return self._kp

    @property
    def public_key_hex(self) -> str:
        try:
            return self._keypair().account_key.hex()
        except Exception:
            return ""

    def _chain_name(self) -> str:
        return "casper-test" if "casper-test" in self.chain else "casper"

    async def _ensure_pay_to(self) -> None:
        """Resolve a valid payee. If unset, use the facilitator's on-chain feePayer
        for this network (a real, existing account — native self-transfers are
        rejected by the node with 'Invalid purse')."""
        if self.pay_to:
            return
        supported = await self.get_supported_schemes()
        for kind in (supported or {}).get("kinds", []):
            if kind.get("network") == self.chain:
                fee_payer = kind.get("extra", {}).get("feePayer", "")
                if fee_payer:
                    # facilitator publishes the raw 32-byte ed25519 key — add the 01 algo tag
                    self.pay_to = ("01" + fee_payer) if len(fee_payer) == 64 else fee_payer
                    logger.info("x402: pay_to resolved from facilitator feePayer %s", self.pay_to[:18])
                    return

    # ── Server side: 402 requirements ───────────────────────────────────────

    def requirements(
        self,
        resource: str,
        amount: Optional[int] = None,
        description: Optional[str] = None,
    ) -> dict:
        """Build the PaymentRequirements object returned in a 402 response.

        `amount`/`description` let one handler price multiple resources
        differently (used by the mainnet provider endpoints)."""
        pay_to = self.pay_to or self.public_key_hex
        return {
            "scheme": SCHEME_EXACT,
            "network": self.chain,
            "payTo": pay_to,
            "amount": str(amount if amount is not None else self.payment_amount),
            "asset": "CSPR",
            "resource": resource,
            "maxTimeoutSeconds": 900,
            "description": description or "Agent Casper premium analytics — x402 micropayment",
        }

    # ── Client side: build + sign payment ───────────────────────────────────

    def build_payment(self, requirements: dict) -> dict:
        """Build and ed25519-sign an x402 v2 payment payload for `requirements`."""
        kp = self._keypair()
        now = int(time.time())
        valid_before = now + int(requirements.get("maxTimeoutSeconds", 900))
        pay_to = requirements.get("payTo") or self.pay_to or kp.account_key.hex()

        authorization = {
            "from": kp.account_key.hex(),
            "to": pay_to,
            "value": str(requirements.get("amount", self.payment_amount)),
            "validAfter": str(now),
            "validBefore": str(valid_before),
            "nonce": secrets.token_hex(32),
        }
        signature = kp.get_signature(_authorization_digest(authorization))  # 64-byte ed25519

        return {
            "x402Version": X402_VERSION,
            "scheme": SCHEME_EXACT,
            "network": self.chain,
            "payload": {
                # Casper signature = 1-byte algo tag (01 = ed25519) + 64-byte sig
                "signature": "01" + signature.hex(),
                "publicKey": kp.account_key.hex(),
                "authorization": authorization,
            },
        }

    @staticmethod
    def encode_header(payload: dict) -> str:
        """base64-encode a payment payload for the X-PAYMENT header."""
        return base64.b64encode(_canonical(payload).encode()).decode()

    def payment_header(self, requirements: dict) -> dict:
        """Return the HTTP headers a client attaches to a paid request."""
        if not self.enabled:
            return {}
        return {
            "X-PAYMENT": self.encode_header(self.build_payment(requirements)),
            "X-402-Network": self.chain,
        }

    # ── Server side: verify proof ────────────────────────────────────────────

    def verify_payment(self, header_value: str) -> Optional[dict]:
        """
        Cryptographically verify an incoming X-PAYMENT header.
        Returns the verified authorization dict, or None if the signature is
        invalid, the authorization is expired, or the nonce was already used.
        """
        try:
            from pycspr import crypto

            payload = json.loads(base64.b64decode(header_value))
            inner = payload["payload"]
            auth = inner["authorization"]
            pub = bytes.fromhex(inner["publicKey"])
            sig = bytes.fromhex(inner["signature"])

            # 1. Time window
            now = int(time.time())
            if not (int(auth["validAfter"]) <= now <= int(auth["validBefore"])):
                logger.warning("x402: payment authorization expired or not yet valid")
                return None

            # 2. Replay protection
            nonce = auth["nonce"]
            if nonce in self._used_nonces:
                logger.warning("x402: nonce replay rejected")
                return None

            # 3. ed25519 signature over the authorization digest
            vk = pub[1:] if len(pub) == 33 else pub          # strip 01 algo tag
            raw_sig = sig[1:] if len(sig) == 65 else sig      # strip 01 algo tag
            algo = (crypto.KeyAlgorithm.ED25519 if pub[:1] == b"\x01"
                    else crypto.KeyAlgorithm.SECP256K1)
            if not crypto.is_signature_valid(_authorization_digest(auth), raw_sig, vk, algo):
                logger.warning("x402: signature verification failed")
                return None

            self._used_nonces.add(nonce)
            logger.info("x402: payment proof verified for payer %s", auth["from"][:16])
            return auth
        except Exception as exc:
            logger.warning("x402: verify error: %s", exc)
            return None

    # ── Settlement ───────────────────────────────────────────────────────────

    async def facilitator_settle(self, payload: dict, requirements: dict) -> Optional[dict]:
        """Best-effort settlement via the official CSPR.cloud facilitator /settle."""
        try:
            headers = {"Authorization": self.cloud_api_key} if self.cloud_api_key else {}
            async with httpx.AsyncClient(timeout=20, headers=headers) as client:
                resp = await client.post(
                    f"{self.facilitator_url}/settle",
                    json={"paymentPayload": payload, "paymentRequirements": requirements},
                )
                if resp.status_code == 200:
                    return resp.json()
                logger.debug("x402 facilitator /settle HTTP %s: %s", resp.status_code, resp.text[:200])
        except Exception as exc:
            logger.debug("x402 facilitator /settle unreachable: %s", exc)
        return None

    async def settle_as_provider(self, payload: dict, requirements: dict) -> dict:
        """
        Provider-side settlement: the remote PAYER pays this agent (payTo).

        Uses the official CSPR.cloud facilitator `/settle`, which moves CSPR from
        the payer's account → payTo using the payer's signed authorization. Unlike
        the consumer `pay()` flow we deliberately do NOT fall back to a self-funded
        on-chain transfer here — a service provider must never pay itself out. If
        the facilitator can't settle (e.g. the payer lacks an on-chain allowance),
        the cryptographic proof is still verified and the request is honoured; the
        settlement is reported as pending.

        Returns a settlement record: {settled, tx_hash, settlement, network, explorer_url}.
        """
        explorer_base = ("https://cspr.live/deploy/" if "casper-test" not in self.chain
                         else "https://testnet.cspr.live/deploy/")
        fac = await self.facilitator_settle(payload, requirements)
        tx = (fac or {}).get("transaction") or (fac or {}).get("txHash") if fac else None
        if tx:
            logger.info("x402 provider settlement via facilitator on %s — %s", self.chain, tx[:16])
            return {
                "settled": True,
                "tx_hash": tx,
                "settlement": "facilitator",
                "network": self.chain,
                "explorer_url": explorer_base + tx,
            }
        return {
            "settled": False,
            "tx_hash": None,
            "settlement": "proof_verified",
            "network": self.chain,
            "explorer_url": None,
            "note": ("Cryptographic payment proof verified and request honoured. "
                     "On-chain settlement requires the payer to hold a funded "
                     "mainnet account with an x402 allowance registered at the facilitator."),
        }

    async def settle_onchain(self, authorization: dict) -> Optional[str]:
        """Submit a real native CSPR transfer for the authorized amount.
        Returns the Casper deploy hash on success."""
        try:
            import pycspr

            kp = self._keypair()
            target_hex = authorization.get("to") or self.pay_to or kp.account_key.hex()
            # Native transfers below the 2.5 CSPR floor are rejected by the node.
            amount = max(int(authorization.get("value", self.payment_amount)), MIN_NATIVE_TRANSFER_MOTES)

            params = pycspr.create_deploy_parameters(account=kp, chain_name=self._chain_name())
            deploy = pycspr.create_transfer(
                params,
                amount=amount,
                target=bytes.fromhex(target_hex),
                correlation_id=int(time.time()),
            )
            deploy.approve(kp)
            deploy_hash = await self._put_deploy(pycspr.to_json(deploy))
            logger.info("x402: settled on-chain — %d motes → %s (deploy %s)",
                        amount, target_hex[:16], deploy_hash[:16])
            return deploy_hash
        except Exception as exc:
            logger.warning("x402: on-chain settle failed: %s", exc)
            return None

    async def _put_deploy(self, deploy_dict: dict) -> str:
        headers = {"Content-Type": "application/json"}
        if self.cloud_api_key:
            headers["Authorization"] = self.cloud_api_key
        async with httpx.AsyncClient(timeout=30, headers=headers) as client:
            resp = await client.post(self.node_url, json={
                "id": 1, "jsonrpc": "2.0",
                "method": "account_put_deploy",
                "params": {"deploy": deploy_dict},
            })
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(data["error"].get("message", str(data["error"])))
            return data["result"]["deploy_hash"]

    # ── Facilitator discovery ────────────────────────────────────────────────

    async def get_supported_schemes(self) -> Optional[dict]:
        """GET /supported — payment schemes/networks the facilitator supports."""
        try:
            headers = {"Authorization": self.cloud_api_key} if self.cloud_api_key else {}
            async with httpx.AsyncClient(timeout=8, headers=headers) as client:
                resp = await client.get(f"{self.facilitator_url}/supported")
                resp.raise_for_status()
                return resp.json()
        except Exception as exc:
            logger.debug("x402 /supported failed: %s", exc)
            return None

    # ── High-level flow used by the agent ────────────────────────────────────

    async def pay(self, resource: str, settle: bool = True) -> dict:
        """
        Full client-side x402 flow for one paid resource request:
          build requirements → sign payment → verify proof → (rate-limited) settle.

        On-chain settlement is rate-limited to one transfer per
        `min_settle_interval` seconds to conserve agent funds; the cryptographic
        proof is still produced every call (the HTTP-native part is free).
        Returns a record describing the payment.
        """
        if not self.enabled:
            return {"enabled": False}

        await self._ensure_pay_to()
        requirements = self.requirements(resource)
        payload = self.build_payment(requirements)
        verified = self.verify_payment(self.encode_header(payload))

        record = {
            "enabled": True,
            "resource": resource,
            "scheme": SCHEME_EXACT,
            "network": self.chain,
            "amount_motes": int(requirements["amount"]),
            "payer": payload["payload"]["publicKey"],
            "pay_to": requirements["payTo"],
            "proof_valid": verified is not None,
            "signature": payload["payload"]["signature"][:26] + "…",
            "settled": False,
            "tx_hash": None,
            "settlement": "proof_only",
        }
        if not verified:
            return record

        now = time.time()
        if settle and (now - self._last_settle_ts) >= self.min_settle_interval:
            fac = await self.facilitator_settle(payload, requirements)
            if fac and fac.get("transaction"):
                record.update(settled=True, tx_hash=fac["transaction"], settlement="facilitator")
            else:
                tx = await self.settle_onchain(verified)
                if tx:
                    record.update(settled=True, tx_hash=tx, settlement="onchain_transfer")
            if record["settled"]:
                self._last_settle_ts = now
        return record
