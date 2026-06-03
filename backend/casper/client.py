"""
CSPR.cloud REST client — Official Casper AI Toolkit middleware.
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
        """Uses CSPR.cloud node proxy (https://node.testnet.cspr.cloud)."""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    self.node_url,
                    json={"id": 1, "jsonrpc": "2.0", "method": "chain_get_block", "params": []},
                    timeout=10,
                )
                resp.raise_for_status()
                return resp.json()["result"]["block"]["header"]["height"]
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

    async def fetch_simulated_yield_rates(self) -> list[YieldRate]:
        """
        Simulated yield rates — production: fetch from DeFi protocols via CSPR.cloud.
        CSPR.trade DEX data available via https://mcp.cspr.trade (CSPR.trade MCP).
        """
        return [
            YieldRate(strategy="conservative", apy_bps=300 + random.randint(-20, 20),
                      tvl_cspr=500_000, risk_score=0.15),
            YieldRate(strategy="balanced",     apy_bps=700 + random.randint(-50, 50),
                      tvl_cspr=1_200_000, risk_score=0.40),
            YieldRate(strategy="aggressive",   apy_bps=1500 + random.randint(-100, 200),
                      tvl_cspr=300_000, risk_score=0.75),
        ]

    async def get_vault_portfolio(self, contract_hash: str) -> PortfolioState:
        """Reads portfolio state from YieldVault contract. Falls back to mock data."""
        try:
            portfolio_data = await self.get_contract_state(contract_hash, "portfolio")
            if portfolio_data:
                return PortfolioState(**portfolio_data)
        except Exception:
            pass

        return PortfolioState(
            total_value_motes=50_000_000_000_000,
            conservative_pct=30,
            balanced_pct=50,
            aggressive_pct=20,
            current_strategy="balanced",
            last_rebalance_timestamp=0,
        )
