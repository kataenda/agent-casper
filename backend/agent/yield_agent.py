"""
YieldAgent — main autonomous agent loop.
Polls market data, calls Claude AI, and executes on-chain transactions.
"""

import asyncio
import logging
from datetime import datetime, date
from typing import Callable, Optional

from pydantic import BaseModel

from casper.client import CasperClient, PortfolioState, YieldRate
from casper.deployer import CasperDeployer
from casper.rwa_oracle import RWAOracle
from casper.x402 import X402Handler
from agent.decision_engine import DecisionEngine, RebalanceDecision

logger = logging.getLogger(__name__)


class AgentCycleResult(BaseModel):
    timestamp: str
    block_height: int
    yield_rates: list[dict]
    portfolio: dict
    decision: dict
    rwa_prices: list[dict] = []
    rwa_tx_hashes: dict[str, str] = {}   # asset_id → deploy hash
    tx_hash: Optional[str] = None
    error: Optional[str] = None


class YieldAgent:
    def __init__(
        self,
        casper_client: CasperClient,
        decision_engine: DecisionEngine,
        x402_handler: X402Handler,
        deployer: CasperDeployer,
        rwa_oracle: RWAOracle,
        vault_contract_hash: str,
        agent_account_hash: str,
        agent_secret_key_path: str,
        poll_interval_seconds: int = 60,
        max_rebalances_per_day: int = 5,
        on_cycle_complete: Optional[Callable] = None,
    ):
        self.casper = casper_client
        self.engine = decision_engine
        self.x402 = x402_handler
        self.deployer = deployer
        self.rwa = rwa_oracle
        self.vault_contract_hash = vault_contract_hash
        self.agent_account = agent_account_hash
        self.agent_key_path = agent_secret_key_path
        self.poll_interval = poll_interval_seconds
        self.max_rebalances = max_rebalances_per_day
        self.on_cycle_complete = on_cycle_complete

        self._running = False
        self._rebalances_today = 0
        self._last_rebalance_date: Optional[date] = None
        self._cycle_history: list[AgentCycleResult] = []

    async def start(self):
        self._running = True
        logger.info("YieldAgent started — polling every %ds", self.poll_interval)
        while self._running:
            try:
                result = await self._run_cycle()
                self._cycle_history.append(result)
                # Keep last 100 cycles in memory
                if len(self._cycle_history) > 100:
                    self._cycle_history.pop(0)
                if self.on_cycle_complete:
                    await self.on_cycle_complete(result)
            except Exception as exc:
                logger.exception("Agent cycle error: %s", exc)
            await asyncio.sleep(self.poll_interval)

    def stop(self):
        self._running = False
        logger.info("YieldAgent stopped")

    async def _run_cycle(self) -> AgentCycleResult:
        today = date.today()
        if self._last_rebalance_date != today:
            self._rebalances_today = 0
            self._last_rebalance_date = today

        block_height = await self.casper.get_block_height()
        yield_rates  = await self.casper.fetch_yield_rates()
        portfolio    = await self.casper.get_vault_portfolio(self.vault_contract_hash, agent_account_hash=self.agent_account)
        rwa_prices   = await self.rwa.fetch_rwa_prices()

        # Claude autonomously queries blockchain + RWA data via MCP tools and decides.
        # Pre-gathered data is passed as fallback when MCP/Anthropic has transient issues.
        decision = await self.engine.analyze(
            vault_contract_hash=self.vault_contract_hash,
            agent_account_hash=self.agent_account,
            rebalance_count_today=self._rebalances_today,
            max_rebalances_per_day=self.max_rebalances,
            yield_rates=yield_rates,
            portfolio=portfolio,
            rwa_prices=rwa_prices,
            block_height=block_height,
        )

        logger.info(
            "[Block %d] Decision: %s | Confidence: %.2f | Risk: %s",
            block_height,
            decision.action,
            decision.confidence,
            decision.risk_level,
        )

        tx_hash = None
        if decision.action == "REBALANCE" and self._rebalances_today < self.max_rebalances:
            tx_hash = await self._execute_rebalance(decision, portfolio)
            if tx_hash:
                self._rebalances_today += 1

        # Post verified RWA prices on-chain — creates auditable oracle trail on Casper
        rwa_tx_hashes = await self._post_rwa_prices_onchain(rwa_prices)

        return AgentCycleResult(
            timestamp=datetime.utcnow().isoformat(),
            block_height=block_height,
            yield_rates=[r.model_dump() for r in yield_rates],
            portfolio=portfolio.model_dump(),
            decision=decision.model_dump(),
            rwa_prices=rwa_prices,
            rwa_tx_hashes=rwa_tx_hashes,
            tx_hash=tx_hash,
        )

    async def _post_rwa_prices_onchain(self, rwa_prices: list[dict]) -> dict[str, str]:
        """
        Post verified RWA prices to the YieldVault contract on Casper.
        Returns dict of asset_id → deploy_hash for each asset posted.
        Only posts PAXG and UST10Y — the key RWA indicators.
        """
        ASSETS_TO_POST = {"PAXG", "UST10Y"}
        results: dict[str, str] = {}

        for asset in rwa_prices:
            asset_id = asset.get("asset_id", "")
            if asset_id not in ASSETS_TO_POST:
                continue

            price_usd = asset.get("price_usd") or 0.0
            yield_pct = asset.get("yield_pct") or 0.0

            try:
                tx = await self.deployer.submit_rwa_price(
                    contract_hash=self.vault_contract_hash,
                    key_path=self.agent_key_path,
                    asset_id=asset_id,
                    price_usd=price_usd,
                    yield_pct=yield_pct,
                )
                results[asset_id] = tx
                logger.info("RWA on-chain [%s] → %s", asset_id, tx)
            except Exception as exc:
                logger.warning("RWA post failed for %s: %s", asset_id, exc)

        return results

    async def _execute_rebalance(
        self, decision: RebalanceDecision, current: PortfolioState
    ) -> Optional[str]:
        """
        Signs and submits a rebalance() call to the YieldVault contract.
        Returns the deploy hash on success, None on failure.
        """
        try:
            logger.info(
                "Executing rebalance: %s → conservative=%d%%, balanced=%d%%, aggressive=%d%%",
                decision.new_strategy,
                decision.conservative_pct,
                decision.balanced_pct,
                decision.aggressive_pct,
            )

            strategy = decision.new_strategy or current.current_strategy
            tx_hash = await self.deployer.submit_rebalance(
                contract_hash=self.vault_contract_hash,
                key_path=self.agent_key_path,
                new_strategy=strategy,
                conservative_pct=decision.conservative_pct,
                balanced_pct=decision.balanced_pct,
                aggressive_pct=decision.aggressive_pct,
                reasoning=decision.reasoning,
            )
            logger.info("Rebalance deploy hash: %s", tx_hash)
            return tx_hash

        except Exception as exc:
            logger.error("Failed to execute rebalance: %s", exc)
            return None

    def get_history(self, limit: int = 20) -> list[AgentCycleResult]:
        return list(reversed(self._cycle_history))[:limit]

    def is_running(self) -> bool:
        return self._running

    def get_stats(self) -> dict:
        return {
            "running": self._running,
            "rebalances_today": self._rebalances_today,
            "total_cycles": len(self._cycle_history),
            "poll_interval_seconds": self.poll_interval,
        }
