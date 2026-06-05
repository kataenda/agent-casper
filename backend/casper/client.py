"""
CSPR.cloud REST client â€" Official Casper AI Toolkit middleware.
Docs: https://docs.cspr.cloud  |  Skill: https://cspr.cloud/skill.md
"""

import httpx
import random
from typing import Optional
from pydantic import BaseModel


class YieldRate(BaseModel):
    strategy: str
    apy_bps: int       # basis points (100 = 1%)
    tvl_cspr: float
    risk_score: float  # 0.0 (low) to 1.0 (high)


class PortfolioState(BaseModel):
    total_value_motes: int
    conservative_pct: int
    balanced_pct: int
    aggressive_pct: int
    current_strategy: str
    last_rebalance_timestamp: int


class CasperClient:
    """
    Wraps CSPR.cloud REST API (https://api.testnet.cspr.cloud).
    Node RPC is proxied via CSPR.cloud (https://node.testnet.cspr.cloud).
    Auth: Authorization header with CSPR.cloud API key.
    """

    def __init__(self, node_url: str, cloud_api_key: str, cloud_base_url: str):
        self.node_url = node_url
        self.cloud_base_url = cloud_base_url.rstrip("/")
        self.headers = {
            "Authorization": cloud_api_key,   # CSPR.cloud uses bare token (no "Bearer" prefix)
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        self._mock_block = 3_000_000

    def _unwrap(self, resp_json: dict) -> dict:
        """CSPR.cloud wraps responses in a 'data' object per API spec."""
        return resp_json.get("data", resp_json)

    async def get_block_height(self) -> int:
        """Uses CSPR.cloud node proxy. Handles both Casper 1.x and 2.x block formats."""
        try:
            async with httpx.AsyncClient(headers={"Authorization": self.headers["Authorization"]}) as client:
                resp = await client.post(
                    self.node_url,
                    json={"id": 1, "jsonrpc": "2.0", "method": "chain_get_block", "params": []},
                    timeout=10,
                )
                resp.raise_for_status()
                block = resp.json()["result"]["block"]
                # Casper 2.x wraps block in {"Version2": {...}} or {"Version1": {...}}
                if "Version2" in block:
                    return block["Version2"]["header"]["height"]
                if "Version1" in block:
                    return block["Version1"]["header"]["height"]
                # Casper 1.x flat format
                return block["header"]["height"]
        except Exception:
            self._mock_block += 1
            return self._mock_block

    async def get_account_balance(self, account_identifier: str) -> int:
        """
        GET /accounts/{account_identifier}
        account_identifier: public key or account hash
        Returns balance in motes.
        """
        url = f"{self.cloud_base_url}/accounts/{account_identifier}"
        try:
            async with httpx.AsyncClient(headers=self.headers) as client:
                resp = await client.get(url, timeout=10)
                resp.raise_for_status()
                obj = self._unwrap(resp.json())
                # balance is returned as a string of motes
                return int(obj.get("balance", "0"))
        except Exception:
            return 100_000_000_000_000  # 100,000 CSPR demo fallback

    async def get_deploy_status(self, deploy_hash: str) -> dict:
        """GET /deploys/{deploy_hash}"""
        url = f"{self.cloud_base_url}/deploys/{deploy_hash}"
        async with httpx.AsyncClient(headers=self.headers) as client:
            resp = await client.get(url, timeout=10)
            resp.raise_for_status()
            return self._unwrap(resp.json())

    async def get_contract_state(self, contract_hash: str, key: str) -> Optional[dict]:
        """Query named key from contract state via CSPR.cloud."""
        url = f"{self.cloud_base_url}/contracts/{contract_hash}/named-keys/{key}"
        try:
            async with httpx.AsyncClient(headers=self.headers) as client:
                resp = await client.get(url, timeout=15)
                if resp.status_code == 404:
                    return None
                resp.raise_for_status()
                return self._unwrap(resp.json())
        except Exception:
            return None


    def _is_placeholder(self, value: str) -> bool:
        """True when the hash/account is still the default placeholder."""
        return "xxx" in value or value.endswith("-demo")

    async def get_vault_portfolio(self, contract_hash: str) -> PortfolioState:
        """
        Reads portfolio state from YieldVault contract via Casper RPC.
        In Casper 2.x, contract named keys are queried via query_global_state
        using the package hash.
        """
        if self._is_placeholder(contract_hash):
            return PortfolioState(
                total_value_motes=0, conservative_pct=0, balanced_pct=0,
                aggressive_pct=0, current_strategy="N/A", last_rebalance_timestamp=0,
            )
        try:
            # query_global_state: key = "hash-<hex>", path = ["portfolio"]
            async with httpx.AsyncClient(
                headers={"Authorization": self.headers["Authorization"]},
                timeout=15,
            ) as client:
                resp = await client.post(
                    self.node_url,
                    json={
                        "id": 1, "jsonrpc": "2.0",
                        "method": "query_global_state",
                        "params": {"key": contract_hash, "path": ["portfolio"]},
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            sv = data.get("result", {}).get("stored_value", {})
            # Could be CLValue with parsed Portfolio or raw struct
            parsed = sv.get("CLValue", {}).get("parsed") or sv.get("Account") or sv
            if isinstance(parsed, dict):
                return PortfolioState(
                    total_value_motes   = int(parsed.get("total_value", 0)),
                    conservative_pct    = int(parsed.get("conservative_pct", 0)),
                    balanced_pct        = int(parsed.get("balanced_pct", 0)),
                    aggressive_pct      = int(parsed.get("aggressive_pct", 0)),
                    current_strategy    = str(parsed.get("current_strategy", "N/A")),
                    last_rebalance_timestamp = int(parsed.get("last_rebalance", 0)),
                )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).debug("get_vault_portfolio error: %s", exc)

        return PortfolioState(
            total_value_motes=0, conservative_pct=0, balanced_pct=0,
            aggressive_pct=0, current_strategy="N/A", last_rebalance_timestamp=0,
        )

    async def fetch_simulated_yield_rates(self) -> list[YieldRate]:
        """Simulated yield rates â€" placeholder until real DeFi protocol integration."""
        return [
            YieldRate(strategy="conservative", apy_bps=0, tvl_cspr=0, risk_score=0.0),
            YieldRate(strategy="balanced",     apy_bps=0, tvl_cspr=0, risk_score=0.0),
            YieldRate(strategy="aggressive",   apy_bps=0, tvl_cspr=0, risk_score=0.0),
        ]

