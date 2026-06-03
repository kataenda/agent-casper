"""
CasperDeployer — builds, signs, and submits deploys to Casper Testnet.

Uses pycspr 0.12.x to call the YieldVault.rebalance() entry point.
Falls back to simulation mode when the agent key file is absent.
"""

import hashlib
import json
import logging
import os
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# 5 CSPR — enough gas for a contract call on testnet
REBALANCE_PAYMENT_MOTES = 5_000_000_000

# Casper Odra enum indices — must match Strategy order in yield_vault.rs
STRATEGY_INDEX = {"conservative": 0, "balanced": 1, "aggressive": 2}


class CasperDeployer:
    """
    Wraps pycspr to submit signed deploys to Casper Network via JSON-RPC.
    When AGENT_SECRET_KEY_PATH is absent (demo environment), it produces a
    clearly-labelled simulation hash so the rest of the agent loop still works.
    """

    def __init__(
        self,
        node_url: str,
        chain_name: str = "casper-test",
        payment_motes: int = REBALANCE_PAYMENT_MOTES,
    ):
        self.node_url = node_url
        self.chain_name = chain_name
        self.payment_motes = payment_motes

    # ── Public API ─────────────────────────────────────────────────────────

    async def submit_rebalance(
        self,
        contract_hash: str,
        key_path: str,
        new_strategy: str,
        conservative_pct: int,
        balanced_pct: int,
        aggressive_pct: int,
        reasoning: str,
    ) -> str:
        """
        Build, sign, and submit a rebalance() deploy.
        Returns deploy hash (real or simulation-prefixed).
        """
        if not os.path.isfile(key_path):
            logger.warning(
                "Key file not found at '%s' — running in simulation mode. "
                "Set AGENT_SECRET_KEY_PATH to a real .pem for on-chain execution.",
                key_path,
            )
            return self._simulation_hash(new_strategy, conservative_pct, balanced_pct, aggressive_pct)

        return await self._real_deploy(
            contract_hash=contract_hash,
            key_path=key_path,
            new_strategy=new_strategy,
            conservative_pct=conservative_pct,
            balanced_pct=balanced_pct,
            aggressive_pct=aggressive_pct,
            reasoning=reasoning,
        )

    # ── Real deploy (pycspr) ───────────────────────────────────────────────

    async def _real_deploy(
        self,
        contract_hash: str,
        key_path: str,
        new_strategy: str,
        conservative_pct: int,
        balanced_pct: int,
        aggressive_pct: int,
        reasoning: str,
    ) -> str:
        try:
            import pycspr
            from pycspr.crypto import KeyAlgorithm
            from pycspr.types.cl import CLV_U8, CLV_String
        except ImportError as exc:
            raise RuntimeError("pycspr is not installed. Run: pip install pycspr==0.12.4") from exc

        # 1. Load agent keypair from PEM file
        keypair = pycspr.parse_private_key(
            path_to_secret_key=key_path,
            key_algo=KeyAlgorithm.ED25519,
        )

        # 2. Strip "hash-" prefix from contract hash
        hash_hex = contract_hash.removeprefix("hash-")
        if len(hash_hex) != 64:
            raise ValueError(f"Expected 64-char contract hash hex, got: {hash_hex!r}")

        # 3. Map strategy name → Odra enum index
        strategy_idx = STRATEGY_INDEX.get(new_strategy.lower(), 1)

        # 4. Build deploy
        deploy_params = pycspr.create_deploy_parameters(
            account=keypair,
            chain_name=self.chain_name,
        )
        payment = pycspr.create_standard_payment(self.payment_motes)
        session = pycspr.create_contract_call(
            contract_hash=bytes.fromhex(hash_hex),
            entry_point="rebalance",
            args={
                "new_strategy":    CLV_U8(strategy_idx),
                "conservative_pct": CLV_U8(conservative_pct),
                "balanced_pct":    CLV_U8(balanced_pct),
                "aggressive_pct":  CLV_U8(aggressive_pct),
                "reasoning":       CLV_String(reasoning[:500]),
            },
        )
        deploy = pycspr.create_deploy(deploy_params, payment, session)

        # 5. Sign
        deploy.approve(keypair)

        # 6. Serialize and submit
        deploy_dict = json.loads(pycspr.to_json(deploy))
        deploy_hash = await self._put_deploy_rpc(deploy_dict)

        logger.info("Rebalance deploy submitted — hash: %s", deploy_hash)
        return deploy_hash

    # ── JSON-RPC submission ────────────────────────────────────────────────

    async def _put_deploy_rpc(self, deploy_dict: dict) -> str:
        """Submit deploy via account_put_deploy JSON-RPC. Returns deploy hash string."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                self.node_url,
                json={
                    "id": 1,
                    "jsonrpc": "2.0",
                    "method": "account_put_deploy",
                    "params": {"deploy": deploy_dict},
                },
            )
            resp.raise_for_status()

        result = resp.json()
        if "error" in result:
            msg = result["error"].get("message", str(result["error"]))
            raise RuntimeError(f"Casper node RPC error: {msg}")

        return result["result"]["deploy_hash"]

    # ── RWA Oracle on-chain posting ───────────────────────────────────────

    async def submit_rwa_price(
        self,
        contract_hash: str,
        key_path: str,
        asset_id: str,
        price_usd: float,   # e.g. 4492.54 → stored as 449254 cents
        yield_pct: float = 0.0,  # e.g. 4.22 → stored as 422 bps
    ) -> str:
        """
        Post a verified Real-World Asset price on-chain via
        YieldVault.update_rwa_price(). Emits RwaPriceUpdated event.
        Returns deploy hash (real or sim-rwa-prefixed).
        """
        price_usd_cents = int(round(price_usd * 100))
        yield_bps       = int(round(yield_pct * 100))

        if not os.path.isfile(key_path):
            return self._sim_rwa_hash(asset_id, price_usd_cents, yield_bps)

        try:
            import pycspr
            from pycspr.crypto import KeyAlgorithm
            from pycspr.types.cl import CLV_U8, CLV_U16, CLV_U64, CLV_String
        except ImportError as exc:
            raise RuntimeError("pycspr not installed") from exc

        keypair  = pycspr.parse_private_key(path_to_secret_key=key_path, key_algo=KeyAlgorithm.ED25519)
        hash_hex = contract_hash.removeprefix("hash-")

        deploy_params = pycspr.create_deploy_parameters(account=keypair, chain_name=self.chain_name)
        payment       = pycspr.create_standard_payment(2_000_000_000)   # 2 CSPR — lighter than rebalance
        session       = pycspr.create_contract_call(
            contract_hash=bytes.fromhex(hash_hex),
            entry_point="update_rwa_price",
            args={
                "asset_id":        CLV_String(asset_id),
                "price_usd_cents": CLV_U64(price_usd_cents),
                "yield_bps":       CLV_U16(yield_bps),
            },
        )
        deploy = pycspr.create_deploy(deploy_params, payment, session)
        deploy.approve(keypair)

        deploy_dict = json.loads(pycspr.to_json(deploy))
        deploy_hash = await self._put_deploy_rpc(deploy_dict)
        logger.info("RWA price posted on-chain [%s=$%.2f] — hash: %s", asset_id, price_usd, deploy_hash)
        return deploy_hash

    # ── Simulation fallbacks ───────────────────────────────────────────────

    @staticmethod
    def _simulation_hash(strategy: str, con: int, bal: int, agg: int) -> str:
        payload = json.dumps(
            {"strategy": strategy, "con": con, "bal": bal, "agg": agg, "t": time.time()},
            sort_keys=True,
        ).encode()
        return "sim-" + hashlib.sha256(payload).hexdigest()[:32]

    @staticmethod
    def _sim_rwa_hash(asset_id: str, price_cents: int, yield_bps: int) -> str:
        payload = json.dumps(
            {"asset": asset_id, "price": price_cents, "yield": yield_bps, "t": time.time()},
            sort_keys=True,
        ).encode()
        return "sim-rwa-" + hashlib.sha256(payload).hexdigest()[:24]
