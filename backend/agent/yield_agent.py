"""
YieldAgent — main autonomous agent loop.
Polls market data, calls Claude AI, and executes on-chain transactions.
"""

import asyncio
import logging
import time
from datetime import datetime, date
from typing import Callable, Optional

from pydantic import BaseModel

from casper.client import CasperClient, PortfolioState, YieldRate
from casper.deployer import CasperDeployer
from casper.rwa_oracle import RWAOracle
from casper.x402 import X402Handler
from casper.cspr_trade import CsprTradeMCP
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
    x402_payment: dict = {}              # x402 micropayment record for this cycle
    defi_execution: dict = {}            # real CSPR.trade mainnet swap triggered by a rebalance
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
        rwa_onchain_enabled: bool = True,
        rwa_post_interval_seconds: int = 3600,
        cspr_trade: Optional[CsprTradeMCP] = None,
        defi_execute_on_rebalance: bool = False,
        defi_swap_amount_cspr: float = 5.0,
        defi_swap_token_in: str = "CSPR",
        defi_swap_token_out: str = "sCSPR",
        defi_max_swaps_per_day: int = 1,
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
        self.rwa_onchain_enabled = rwa_onchain_enabled
        self.rwa_post_interval = rwa_post_interval_seconds
        # Real DeFi: when the AI decides to REBALANCE, optionally route a small,
        # capped real swap on Casper mainnet via CSPR.trade — closing the loop from
        # AI decision → real on-chain execution. OFF by default (spends real CSPR).
        self.cspr_trade = cspr_trade
        self.defi_execute_on_rebalance = defi_execute_on_rebalance
        self.defi_swap_amount_cspr = defi_swap_amount_cspr
        self.defi_swap_token_in = defi_swap_token_in
        self.defi_swap_token_out = defi_swap_token_out
        self.defi_max_swaps_per_day = defi_max_swaps_per_day
        self.on_cycle_complete = on_cycle_complete

        self._running = False
        self.paused = False           # set True to freeze rebalancing without stopping loop
        self._rebalances_today = 0
        self._defi_swaps_today = 0
        self._last_rebalance_date: Optional[date] = None
        self._last_rwa_post_ts: float = 0.0
        # Last on-chain RWA deploy hashes, carried forward across cycles so the
        # dashboard's on-chain proof stays visible (deploys are permanent) instead
        # of flickering on only the ~1 cycle/hour that actually posts.
        self._last_rwa_tx_hashes: dict[str, str] = {}
        self._cycle_history: list[AgentCycleResult] = []

    async def start(self):
        if self._running:
            logger.warning("YieldAgent.start() called while already running — ignored")
            return
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
            self._defi_swaps_today = 0
            self._last_rebalance_date = today

        block_height, yield_rates, portfolio, rwa_prices = await asyncio.gather(
            self.casper.get_block_height(),
            self.casper.fetch_yield_rates(),
            self.casper.get_vault_portfolio(self.vault_contract_hash, agent_account_hash=self.agent_account),
            self.rwa.fetch_rwa_prices(),
        )

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

        if decision is None:
            from agent.decision_engine import RebalanceDecision
            decision = RebalanceDecision(action="HOLD", new_strategy=None, conservative_pct=0,
                                         balanced_pct=0, aggressive_pct=0, confidence=0.0,
                                         risk_level="LOW", reasoning="analyze() returned None — holding")

        logger.info(
            "[Block %d] Decision: %s | Confidence: %.2f | Risk: %s",
            block_height,
            decision.action,
            decision.confidence,
            decision.risk_level,
        )

        tx_hash = None
        cycle_error = None
        defi_execution: dict = {}
        if decision.action == "REBALANCE":
            if self.paused:
                cycle_error = "PAUSED"
            elif self._rebalances_today >= self.max_rebalances:
                cycle_error = f"QUOTA {self._rebalances_today}/{self.max_rebalances}"
            else:
                tx_hash = await self._execute_rebalance(decision, portfolio)
                if tx_hash:
                    self._rebalances_today += 1
                    # Close the loop: the AI's allocation decision is now also
                    # executed as a real, capped, non-custodial swap on mainnet.
                    defi_execution = await self._execute_defi_swap(decision)
                else:
                    cycle_error = "TX_FAILED"

        # Post verified RWA prices on-chain — creates auditable oracle trail on Casper.
        # Posting is rate-limited (hourly), so most cycles post nothing; carry the
        # last known deploy hashes forward so the dashboard proof doesn't flicker.
        posted = await self._post_rwa_prices_onchain(rwa_prices)
        if posted:
            self._last_rwa_tx_hashes.update(posted)
        rwa_tx_hashes = dict(self._last_rwa_tx_hashes)

        # x402 micropayment — agent pays per request for the premium RWA risk feed.
        # A real ed25519-signed payment proof is produced every cycle; on-chain
        # settlement is rate-limited inside the handler to conserve agent funds.
        x402_payment: dict = {}
        try:
            x402_payment = await self.x402.pay(resource="rwa-risk-feed")
            if x402_payment.get("tx_hash"):
                logger.info("x402 micropayment settled on-chain — %s", x402_payment["tx_hash"][:16])
        except Exception as exc:
            logger.warning("x402 payment error: %s", exc)

        return AgentCycleResult(
            timestamp=datetime.utcnow().isoformat(),
            block_height=block_height,
            yield_rates=[r.model_dump() for r in yield_rates],
            portfolio=portfolio.model_dump(),
            decision=decision.model_dump(),
            rwa_prices=rwa_prices,
            rwa_tx_hashes=rwa_tx_hashes,
            tx_hash=tx_hash,
            x402_payment=x402_payment,
            defi_execution=defi_execution,
            error=cycle_error,
        )

    # Key RWA indicators posted on-chain via YieldVault.update_rwa_price()
    RWA_ASSETS_TO_POST: set[str] = {"PAXG", "UST10Y"}

    async def _post_rwa_prices_onchain(self, rwa_prices: list[dict]) -> dict[str, str]:
        """
        Post verified RWA prices to the YieldVault contract on Casper, creating an
        auditable on-chain oracle trail (emits RwaPriceUpdated events).
        Posts PAXG + UST10Y, rate-limited to once per `rwa_post_interval` seconds
        to conserve agent gas. Returns dict of asset_id → deploy_hash.
        """
        results: dict[str, str] = {}
        if not self.rwa_onchain_enabled:
            return results

        now = time.time()
        if (now - self._last_rwa_post_ts) < self.rwa_post_interval:
            return results  # within rate-limit window — skip this cycle
        self._last_rwa_post_ts = now

        ASSETS_TO_POST = self.RWA_ASSETS_TO_POST

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

    async def _execute_defi_swap(self, decision: RebalanceDecision) -> dict:
        """
        Execute a real, capped, non-custodial swap on Casper mainnet via CSPR.trade,
        triggered by an AI rebalance decision — turning the on-chain allocation record
        into actual on-chain DeFi execution.

        Heavily guarded: OFF unless `defi_execute_on_rebalance` is enabled; bounded by
        a small fixed amount, a per-day swap cap, and CSPR.trade's own amount +
        price-impact caps. Never raises — the swap is best-effort and reported in the
        cycle result so the dashboard can show "decision → executed on-chain".
        """
        if not (self.defi_execute_on_rebalance and self.cspr_trade):
            return {}
        if self._defi_swaps_today >= self.defi_max_swaps_per_day:
            return {
                "executed": False,
                "settlement": "daily_cap",
                "note": f"defi swap daily cap reached ({self._defi_swaps_today}/{self.defi_max_swaps_per_day})",
            }
        try:
            record = await self.cspr_trade.swap(
                token_in=self.defi_swap_token_in,
                token_out=self.defi_swap_token_out,
                amount=str(self.defi_swap_amount_cspr),
                execute=True,
            )
            record["triggered_by"] = decision.new_strategy or decision.action
            if record.get("executed"):
                self._defi_swaps_today += 1
                logger.info(
                    "DeFi execution on mainnet — %s %s→%s tx=%s",
                    self.defi_swap_amount_cspr, self.defi_swap_token_in,
                    self.defi_swap_token_out, record.get("tx_hash"),
                )
            else:
                logger.info("DeFi execution not broadcast — %s", record.get("settlement"))
            return record
        except Exception as exc:
            logger.warning("DeFi execution error: %s", exc)
            return {"executed": False, "settlement": "error", "note": str(exc)[:200]}

    async def force_rebalance(self, strategy: str = "balanced") -> Optional[str]:
        """
        Immediately execute a rebalance with the specified strategy.
        Bypasses the normal decision cycle; used for manual chat commands.
        """
        _ALLOC = {
            "conservative": (70, 20, 10),
            "balanced":     (20, 60, 20),
            "aggressive":   (10, 20, 70),
        }
        con, bal, agg = _ALLOC.get(strategy, (20, 60, 20))
        portfolio = await self.casper.get_vault_portfolio(
            self.vault_contract_hash, agent_account_hash=self.agent_account
        )
        decision = RebalanceDecision(
            action="REBALANCE",
            new_strategy=strategy,
            conservative_pct=con,
            balanced_pct=bal,
            aggressive_pct=agg,
            confidence=1.0,
            risk_level="MEDIUM",
            reasoning=f"Manual command: force rebalance to {strategy}",
        )
        tx_hash = await self._execute_rebalance(decision, portfolio)
        if tx_hash:
            self._rebalances_today += 1
        return tx_hash

    def get_history(self, limit: int = 20) -> list[AgentCycleResult]:
        return list(reversed(self._cycle_history))[:limit]

    def is_running(self) -> bool:
        return self._running

    def get_stats(self) -> dict:
        return {
            "running": self._running,
            "paused": self.paused,
            "rebalances_today": self._rebalances_today,
            "defi_swaps_today": self._defi_swaps_today,
            "defi_execute_on_rebalance": self.defi_execute_on_rebalance,
            "total_cycles": len(self._cycle_history),
            "poll_interval_seconds": self.poll_interval,
        }
