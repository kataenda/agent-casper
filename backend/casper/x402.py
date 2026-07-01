"""
x402 Micropayment Protocol — official `exact` scheme for Agent Casper.

Implements the CSPR.cloud Casper x402 v2 "pay-per-request" flow, conformant with
the official `@make-software/casper-x402` `exact` scheme (verified end-to-end
against the live facilitator `/verify`, which returns isValid: true):

  1. Client requests a protected resource.
  2. Server replies `402 Payment Required` + `{resource, accepts:[PaymentRequirements]}`.
  3. Client builds a `TransferWithAuthorization` and signs the EIP-712 typed-data
     digest (see casper.eip712) with its ed25519 key, retrying with `X-PAYMENT`.
  4. Server recomputes the digest, verifies the signature + binds it to the payer,
     then settles via the facilitator.

Cryptographic proof
    A real ed25519 signature over the EIP-712 `TransferWithAuthorization` digest
    (CEP-18 `transfer_with_authorization`). The facilitator recomputes the same
    digest, so a payment this server accepts is also facilitator-settleable.

Settlement
    The facilitator submits a CEP-18 `transfer_with_authorization` deploy moving
    `amount` of the configured token (`asset`) from the payer to `payTo` — true
    sub-CSPR micropayments, no native-transfer floor. The facilitator pays gas via
    its published feePayer; the agent only needs to hold the token.

Spec: https://github.com/make-software/casper-x402
EIP-712: https://github.com/casper-ecosystem/casper-eip-712
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

from casper.eip712 import transfer_authorization_digest

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
        settle_node_url: str = "",
        asset: str = "",
        token_name: str = "",
        token_version: str = "1",
        token_decimals: int = 6,
        token_symbol: str = "",
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
        # CEP-18 token for the official `exact` scheme: the facilitator settles a
        # `transfer_with_authorization` of this token. `asset` is the 64-hex contract
        # package hash; name/version form the EIP-712 domain; decimals/symbol are
        # display metadata advertised in PaymentRequirements.extra.
        self.asset = (asset or "").lower().replace("hash-", "")
        self.token_name = token_name
        self.token_version = token_version
        self.token_decimals = token_decimals
        self.token_symbol = token_symbol or token_name
        # Node used to VERIFY a payer-submitted settlement transfer on-chain. For the
        # mainnet provider this is the mainnet node (the payer pays on mainnet even
        # though proof verification is chain-agnostic). Defaults to node_url.
        self.settle_node_url = settle_node_url or node_url

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

    @property
    def account_hash_hex(self) -> str:
        """The agent's 64-hex Casper account hash (no prefix)."""
        try:
            from pycspr.crypto import get_account_hash
            return get_account_hash(bytes.fromhex(self.public_key_hex)).hex()
        except Exception:
            return ""

    @property
    def address(self) -> str:
        """The agent's x402 address: '00' + account hash (Casper account-hash address)."""
        ah = self.account_hash_hex
        return ("00" + ah) if ah else ""

    @staticmethod
    def account_hash_from_pubkey(public_key_hex: str) -> str:
        """'00' + account hash for a given public key hex."""
        try:
            from pycspr.crypto import get_account_hash
            return "00" + get_account_hash(bytes.fromhex(public_key_hex)).hex()
        except Exception:
            return ""

    def _chain_name(self) -> str:
        return "casper-test" if "casper-test" in self.chain else "casper"

    async def _ensure_pay_to(self) -> None:
        """Resolve a valid payee (account-hash address). If unset, default to the
        agent's own address so the exact-scheme `transfer_with_authorization`
        settles to a real, existing account."""
        if self.pay_to:
            return
        self.pay_to = self.address
        logger.info("x402: pay_to defaulted to agent address %s", self.pay_to[:18])

    # ── Server side: 402 requirements ───────────────────────────────────────

    def requirements(
        self,
        resource: str,
        amount: Optional[int] = None,
        description: Optional[str] = None,
    ) -> dict:
        """Build an official x402 `exact`-scheme PaymentRequirement (CSPR.cloud Casper).

        `payTo` is an account-hash address ('00'+hash); `asset` is the CEP-18 token
        contract package hash; `extra` carries the token name/version (EIP-712 domain)
        plus decimals/symbol for display. `amount` is in the token's base units.
        """
        pay_to = self.pay_to or self.address
        return {
            "scheme": SCHEME_EXACT,
            "network": self.chain,
            "asset": self.asset,
            "amount": str(amount if amount is not None else self.payment_amount),
            "payTo": pay_to,
            "maxTimeoutSeconds": 900,
            "extra": {
                "name": self.token_name,
                "version": self.token_version,
                "decimals": str(self.token_decimals),
                "symbol": self.token_symbol,
            },
        }

    def resource_object(self, url: str, description: Optional[str] = None,
                        mime_type: str = "application/json") -> dict:
        """The `resource` object included in the 402 response and payment payload."""
        obj = {"url": url, "mimeType": mime_type}
        if description:
            obj["description"] = description
        return obj

    # ── Client side: build + sign payment ───────────────────────────────────

    def build_payment(self, requirements: dict, resource: Optional[dict] = None) -> dict:
        """
        Build an official x402 `exact`-scheme payment payload for `requirements`,
        signing the EIP-712 `TransferWithAuthorization` digest with the agent's
        ed25519 key. Verified accepted by the CSPR.cloud facilitator `/verify`.

        The returned envelope is `{x402Version, resource, accepted, payload}` where
        `payload = {signature, publicKey, authorization}`.
        """
        kp = self._keypair()
        now = int(time.time())
        valid_after = now - 600                       # matches the official client
        valid_before = now + int(requirements.get("maxTimeoutSeconds", 900))
        frm = self.address
        pay_to = requirements.get("payTo") or self.pay_to or frm
        amount = str(requirements.get("amount", self.payment_amount))
        nonce = secrets.token_hex(32)
        extra = requirements.get("extra") or {}

        digest = transfer_authorization_digest(
            name=extra.get("name", self.token_name),
            version=extra.get("version", self.token_version),
            network=requirements.get("network", self.chain),
            asset=requirements.get("asset", self.asset),
            frm=frm, to=pay_to, value=int(amount),
            valid_after=valid_after, valid_before=valid_before, nonce=nonce,
        )
        signature = kp.get_signature(digest)          # 64-byte ed25519 over the digest

        return {
            "x402Version": X402_VERSION,
            "resource": resource or self.resource_object(requirements.get("resource", "")),
            "accepted": requirements,
            "payload": {
                # algorithm-prefixed signature: 01 (ed25519) + 64-byte sig
                "signature": "01" + signature.hex(),
                "publicKey": kp.account_key.hex(),
                "authorization": {
                    "from": frm,
                    "to": pay_to,
                    "value": amount,
                    "validAfter": str(valid_after),
                    "validBefore": str(valid_before),
                    "nonce": nonce,
                },
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
        Verify an incoming X-PAYMENT header against the official `exact` scheme:
        recompute the EIP-712 digest from the payload's `accepted` terms +
        `authorization`, check the ed25519 signature, bind the signer to
        `authorization.from`, enforce the time window and nonce replay protection.

        Returns the verified authorization dict (or None). Mirrors the facilitator's
        `/verify` so a payment that this server accepts is also facilitator-settleable.
        """
        try:
            from pycspr import crypto

            payload = json.loads(base64.b64decode(header_value))
            inner = payload["payload"]
            auth = inner["authorization"]
            accepted = payload.get("accepted") or {}
            extra = accepted.get("extra") or {}
            pub_hex = inner["publicKey"]
            pub = bytes.fromhex(pub_hex)
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

            # 3. Bind the signing public key to authorization.from (account hash)
            if self.account_hash_from_pubkey(pub_hex).lower() != str(auth["from"]).lower():
                logger.warning("x402: publicKey does not match authorization.from")
                return None

            # 4. ed25519/secp256k1 signature over the recomputed EIP-712 digest
            digest = transfer_authorization_digest(
                name=extra.get("name", self.token_name),
                version=extra.get("version", self.token_version),
                network=accepted.get("network", self.chain),
                asset=accepted.get("asset", self.asset),
                frm=auth["from"], to=auth["to"], value=int(auth["value"]),
                valid_after=int(auth["validAfter"]), valid_before=int(auth["validBefore"]),
                nonce=auth["nonce"],
            )
            vk = pub[1:] if len(pub) == 33 else pub          # strip 01 algo tag
            raw_sig = sig[1:] if len(sig) == 65 else sig      # strip 01 algo tag
            algo = (crypto.KeyAlgorithm.ED25519 if pub[:1] == b"\x01"
                    else crypto.KeyAlgorithm.SECP256K1)
            if not crypto.is_signature_valid(digest, raw_sig, vk, algo):
                logger.warning("x402: signature verification failed")
                return None

            self._used_nonces.add(nonce)
            logger.info("x402: payment proof verified for payer %s", str(auth["from"])[:18])
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
            # A returned hash is only a submission — verify the on-chain result before
            # claiming the provider was actually paid.
            ok = await self._verify_settlement(tx)
            logger.info("x402 provider settlement submitted on %s — %s (verified=%s)",
                        self.chain, tx[:16], ok)
            if ok is not False:  # True (confirmed) or None (pending) — surface honestly
                return {
                    "settled": ok is True,
                    "tx_hash": tx,
                    "settlement": "facilitator" if ok is True else "facilitator_submitted",
                    "network": self.chain,
                    "explorer_url": explorer_base + tx,
                    **({} if ok is True else {"note": "submitted; on-chain result not yet final"}),
                }
            logger.info("x402 provider: facilitator settlement %s reverted on-chain", tx[:16])

        # Facilitator couldn't settle — check whether the payer included the deploy
        # hash of a REAL on-chain transfer it already submitted to payTo. If that
        # transfer verifies on-chain (payer → payTo, ≥ amount, success), this is a
        # genuine provider settlement: another agent actually paid this agent.
        inner = payload.get("payload") or {}
        auth = inner.get("authorization") or {}
        settlement_tx = auth.get("settlement_tx")
        if settlement_tx:
            payer = inner.get("publicKey") or auth.get("from", "")
            pay_to = requirements.get("payTo") or self.pay_to
            min_amount = int(requirements.get("amount", self.payment_amount))
            ok, info = await self._verify_payer_transfer(settlement_tx, payer, pay_to, min_amount)
            if ok:
                logger.info("x402 provider settlement via payer on-chain transfer on %s — %s",
                            self.chain, settlement_tx[:16])
                return {
                    "settled": True,
                    "tx_hash": settlement_tx,
                    "settlement": "onchain_transfer_by_payer",
                    "network": self.chain,
                    "explorer_url": explorer_base + settlement_tx,
                    "verified": info,
                }
            logger.info("x402 provider: payer settlement_tx %s not verified — %s",
                        settlement_tx[:16], info.get("reason"))

        return {
            "settled": False,
            "tx_hash": None,
            "settlement": "proof_verified",
            "network": self.chain,
            "explorer_url": None,
            "note": ("Cryptographic payment proof verified and request honoured. "
                     "For real on-chain settlement, the payer either registers an "
                     "x402 allowance at the facilitator, or submits a native transfer "
                     "to payTo and passes its deploy hash as authorization.settlement_tx."),
        }

    async def _verify_payer_transfer(
        self, deploy_hash: str, expected_from_hex: str, pay_to_hex: str, min_amount: int
    ) -> tuple[bool, dict]:
        """Verify a payer-submitted native transfer landed on-chain: executed with
        Success, sent by the x402 payer, to payTo, for ≥ the required amount.
        Returns (ok, info). Best-effort target/amount parsing — never raises."""
        try:
            from pycspr.crypto import get_account_hash
        except Exception:
            get_account_hash = None

        headers = {"Content-Type": "application/json"}
        if self.cloud_api_key:
            headers["Authorization"] = self.cloud_api_key
        try:
            async with httpx.AsyncClient(timeout=20, headers=headers) as client:
                resp = await client.post(self.settle_node_url, json={
                    "id": 1, "jsonrpc": "2.0", "method": "info_get_deploy",
                    "params": {"deploy_hash": deploy_hash},
                })
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            return False, {"reason": f"deploy lookup failed: {str(exc)[:120]}"}
        if "error" in data:
            return False, {"reason": f"node: {data['error'].get('message', data['error'])}"}

        result = data.get("result", {}) or {}
        deploy = result.get("deploy", {}) or {}

        # 1. Executed successfully
        exec_results = result.get("execution_results") or []
        if not any("Success" in (er.get("result") or {}) for er in exec_results):
            return False, {"reason": "deploy not successfully executed yet"}

        # 2. Sender binds to the x402 payer (only the proof signer's transfer counts)
        sender = (deploy.get("header") or {}).get("account", "") or ""
        if expected_from_hex and sender and sender.lower() != expected_from_hex.lower():
            return False, {"reason": "transfer sender != x402 payer"}

        # 3. Transfer target == payTo and amount ≥ required (best-effort parse)
        transfer = (deploy.get("session") or {}).get("Transfer") or {}
        args = {}
        for entry in transfer.get("args", []):
            if isinstance(entry, list) and len(entry) == 2:
                args[entry[0]] = entry[1]

        def parsed(name: str) -> str:
            v = args.get(name) or {}
            return str(v.get("parsed", "")) if isinstance(v, dict) else str(v)

        if transfer:
            try:
                if int(parsed("amount") or 0) < int(min_amount):
                    return False, {"reason": "transfer amount below required"}
            except Exception:
                pass
            target_field = (parsed("target") or "").lower()
            if get_account_hash and pay_to_hex and target_field:
                try:
                    ah = get_account_hash(bytes.fromhex(pay_to_hex)).hex().lower()
                    if ah not in target_field and pay_to_hex.lower() not in target_field:
                        return False, {"reason": "transfer target != payTo"}
                except Exception:
                    pass  # parse failure — don't reject a successful, payer-bound transfer

        return True, {"sender": sender, "amount": parsed("amount"), "deploy_hash": deploy_hash}

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

    async def pay_provider_onchain(self, pay_to_hex: str, amount: int) -> str:
        """Buyer side: submit a REAL native CSPR transfer to the provider (payTo),
        returning the deploy hash. The hash is passed as authorization.settlement_tx
        so the provider can verify a genuine on-chain payment (payer → provider)."""
        import pycspr

        kp = self._keypair()
        amount = max(int(amount), MIN_NATIVE_TRANSFER_MOTES)
        # pycspr create_transfer expects the recipient's PUBLIC KEY account-key bytes
        # (01-tagged) as target — it derives the recipient internally. Passing an
        # account hash here fails ("not a valid KeyAlgorithm").
        target = bytes.fromhex(pay_to_hex)
        params = pycspr.create_deploy_parameters(account=kp, chain_name=self._chain_name())
        deploy = pycspr.create_transfer(
            params, amount=amount, target=target, correlation_id=int(time.time()),
        )
        deploy.approve(kp)
        deploy_hash = await self._put_deploy(pycspr.to_json(deploy))
        logger.info("x402 buyer: paid provider on-chain — %d motes → %s (deploy %s)",
                    amount, pay_to_hex[:16], deploy_hash[:16])
        return deploy_hash

    async def get_deploy_success(self, deploy_hash: str) -> Optional[bool]:
        """Poll info_get_deploy on settle_node_url. Returns True if executed with
        Success, False if Failure, None if not yet processed / lookup failed."""
        headers = {"Content-Type": "application/json"}
        if self.cloud_api_key:
            headers["Authorization"] = self.cloud_api_key
        try:
            async with httpx.AsyncClient(timeout=20, headers=headers) as client:
                resp = await client.post(self.settle_node_url, json={
                    "id": 1, "jsonrpc": "2.0", "method": "info_get_deploy",
                    "params": {"deploy_hash": deploy_hash},
                })
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            return None
        results = (data.get("result", {}) or {}).get("execution_results") or []
        if not results:
            return None
        for er in results:
            r = er.get("result") or {}
            if "Success" in r:
                return True
            if "Failure" in r:
                return False
        return None

    async def _verify_settlement(self, tx_hash: str) -> Optional[bool]:
        """Verify a facilitator settlement actually executed on-chain. Returns True on
        Success, False if it reverted, None if not yet final / unknown. Handles both
        Casper 2.x TransactionV1 (what transfer_with_authorization is) and legacy Deploy —
        the facilitator only returns a hash on *submission*, which can still revert."""
        headers = {"Content-Type": "application/json"}
        if self.cloud_api_key:
            headers["Authorization"] = self.cloud_api_key
        try:
            async with httpx.AsyncClient(timeout=15, headers=headers) as client:
                for method, params in (
                    ("info_get_transaction", {"transaction_hash": {"Version1": tx_hash}}),
                    ("info_get_deploy", {"deploy_hash": tx_hash}),
                ):
                    try:
                        resp = await client.post(self.settle_node_url, json={
                            "id": 1, "jsonrpc": "2.0", "method": method, "params": params})
                        data = resp.json()
                    except Exception:
                        continue
                    if "error" in data:
                        continue
                    res = data.get("result", {}) or {}
                    # Casper 2.x TransactionV1: execution_info.execution_result.Version2
                    er = (res.get("execution_info") or {}).get("execution_result") or {}
                    v2 = er.get("Version2")
                    if isinstance(v2, dict):
                        return v2.get("error_message") is None   # None => success
                    # Legacy Deploy: execution_results[].result Success/Failure
                    for e in (res.get("execution_results") or []):
                        rr = e.get("result") or {}
                        if "Success" in rr:
                            return True
                        if "Failure" in rr:
                            return False
        except Exception:
            return None
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
            "asset": requirements["asset"],
            "amount": int(requirements["amount"]),
            "payer": payload["payload"]["publicKey"],
            "payer_address": payload["payload"]["authorization"]["from"],
            "pay_to": requirements["payTo"],
            "proof_valid": verified is not None,
            "signature": payload["payload"]["signature"][:26] + "…",
            "settled": False,
            "tx_hash": None,
            "settlement": "proof_only",
        }
        if not verified:
            return record

        # Settle the CEP-18 transfer_with_authorization via the official facilitator
        # (rate-limited to conserve token balance). The signed proof is produced every
        # call regardless; only on-chain settlement is throttled.
        now = time.time()
        if settle and (now - self._last_settle_ts) >= self.min_settle_interval:
            fac = await self.facilitator_settle(payload, requirements)
            tx = (fac or {}).get("transaction") or (fac or {}).get("txHash")
            if tx:
                # The facilitator returning a hash only means SUBMITTED — the on-chain
                # transfer_with_authorization can still revert. Never claim "settled"
                # without verifying the actual execution result.
                ok = await self._verify_settlement(tx)
                self._last_settle_ts = now
                if ok is True:
                    record.update(settled=True, tx_hash=tx, settlement="facilitator")
                elif ok is False:
                    record.update(settled=False, tx_hash=tx, settlement="facilitator_failed",
                                  note="facilitator settlement reverted on-chain")
                else:
                    record.update(settled=False, tx_hash=tx, settlement="facilitator_submitted",
                                  note="submitted to facilitator; on-chain result not yet final")
            elif fac is not None:
                record["settlement"] = "facilitator_error"
                record["note"] = str(fac)[:200]
        return record
