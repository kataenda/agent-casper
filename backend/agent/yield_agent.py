"""
YieldAgent — main autonomous agent loop.
Polls market data, calls Claude AI, and executes on-chain transactions.
"""

import asyncio
import json
import logging
import time
from pathlib import Path
from datetime import datetime, date, timezone
from typing import Callable, Optional

from pydantic import BaseModel

from casper.client import CasperClient, PortfolioState, YieldRate
from casper.deployer import CasperDeployer
from casper.rwa_oracle import RWAOracle
from casper.x402 import X402Handler
from casper.cspr_trade import CsprTradeMCP
from casper import swap_log
from casper import x402_settle_log
from casper import staking_log
from casper import vault_registry
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
    tenant_executions: list[dict] = []   # per-enrolled-vault servicing results (multi-tenant)
    aum_motes: int = 0                   # custodied CSPR across ALL enrolled vaults (multi-tenant AUM)
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
        defi_min_drift_pct: float = 10.0,
        defi_min_net_gain_bps: int = 50,
        x402_settle_onchain: bool = True,
        staking_enabled: bool = False,
        validator_public_key: str = "",
        stake_amount_cspr: float = 500.0,   # per stake action (must clear Casper min delegation)
        stake_buffer_cspr: float = 200.0,   # liquid CSPR kept for instant withdrawals
        stake_max_per_day: int = 2,
        multi_tenant_enabled: bool = True,
        tenant_min_drift_pct: float = 10.0,
        tenant_max_rebalances_per_day: int = 2,
        gas_reserve_cspr: float = 20.0,     # keep at least this much CSPR as runway
        gas_per_action_cspr: float = 6.0,   # est. gas one on-chain action costs
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
        self.defi_min_drift_pct = defi_min_drift_pct
        self.defi_min_net_gain_bps = defi_min_net_gain_bps
        self.x402_settle_onchain = x402_settle_onchain
        self.staking_enabled = staking_enabled
        self.validator_public_key = validator_public_key.strip()
        self.stake_amount_cspr = stake_amount_cspr
        self.stake_buffer_cspr = stake_buffer_cspr
        self.stake_max_per_day = stake_max_per_day
        self._validator_set = False
        self._active_validator = ""            # validator currently set on-chain
        self._selected_validator_info = None   # {public_key, delegation_rate, staked_cspr}
        self._staked_cspr = 0.0     # session estimate of delegated CSPR
        self._stakes_today = 0
        self.on_cycle_complete = on_cycle_complete

        # Multi-tenant servicing: apply the cycle's AI market target to every
        # enrolled vault (drift-gated, per-vault daily cap). One AI decision per
        # cycle — market signals are global — executed per vault.
        self.multi_tenant_enabled = multi_tenant_enabled
        self.tenant_min_drift_pct = tenant_min_drift_pct
        self.tenant_max_rebalances = tenant_max_rebalances_per_day

        self._running = False
        self.paused = False           # set True to freeze rebalancing without stopping loop
        self._rebalances_today = 0
        self._defi_swaps_today = 0
        self._tenant_rebalances_today: dict[str, int] = {}
        # Running estimate of sCSPR acquired via our own de-risk swaps. Gates risk-on
        # unwinds: you can't unstake sCSPR you never bought. Updated after each swap.
        self._scspr_est = 0.0
        # The yield token the agent currently rotates into — chosen live from the DEX
        # (most profitable CSPR pair), not fixed by env. Seeded from the env default.
        self._yield_token = defi_swap_token_out or "sCSPR"
        self._yield_reason = "default"
        # Gas-awareness: the agent tracks its own CSPR (its gas tank) and refuses to
        # spend gas it doesn't have — so it never strands funds mid-management.
        self.gas_reserve_cspr = gas_reserve_cspr
        self.gas_per_action_cspr = gas_per_action_cspr
        self._agent_gas_cspr = 999_999.0    # refreshed each cycle
        self._last_refuel_date: Optional[date] = None
        self._last_rebalance_date: Optional[date] = None
        self._last_rwa_post_ts: float = 0.0
        # Last on-chain RWA deploy hashes, carried forward across cycles so the
        # dashboard's on-chain proof stays visible (deploys are permanent) instead
        # of flickering on only the ~1 cycle/hour that actually posts.
        self._last_rwa_tx_hashes: dict[str, str] = {}
        # Cycle history persists to disk (DB-lite) so decisions/TVL survive
        # backend restarts instead of resetting to an empty dashboard.
        self._history_path = Path(__file__).resolve().parent.parent / "cycle_history.json"
        self._cycle_history: list[AgentCycleResult] = self._load_history()

    def _load_history(self) -> list[AgentCycleResult]:
        try:
            if self._history_path.is_file():
                raw = json.loads(self._history_path.read_text(encoding="utf-8"))
                return [AgentCycleResult(**c) for c in raw if isinstance(c, dict)][-100:]
        except Exception as exc:
            logger.warning("cycle history unreadable (%s) — starting fresh", exc)
        return []

    def _persist_history(self) -> None:
        try:
            self._history_path.write_text(
                json.dumps([c.model_dump() for c in self._cycle_history[-100:]]),
                encoding="utf-8")
        except Exception as exc:
            logger.debug("cycle history write failed: %s", exc)

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
                self._persist_history()   # DB-lite: survive restarts
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
            self._stakes_today = 0
            self._tenant_rebalances_today = {}
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

        # ── Gas-awareness ────────────────────────────────────────────────────
        # Read the agent's own CSPR (its gas tank). If it's running low, refuel from
        # the vault's accrued fees (self-funding) BEFORE any gas-spending action.
        # Every on-chain execution below is gated on _can_spend_gas(), so the agent
        # never fires a rebalance/stake/swap it can't pay for (no wasted reverts,
        # no stranding depositor funds mid-management).
        self._agent_gas_cspr = await self._read_agent_gas()
        if self._agent_gas_cspr < self.gas_reserve_cspr:
            await self._maybe_refuel_gas()
            self._agent_gas_cspr = await self._read_agent_gas()

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
            elif not self._can_spend_gas():
                cycle_error = (f"LOW_GAS {self._agent_gas_cspr:.0f} CSPR (< {self.gas_reserve_cspr + self.gas_per_action_cspr:.0f}) "
                               "— holding to preserve runway; fund the agent account")
                logger.warning("skip rebalance — %s", cycle_error)
            else:
                tx_hash = await self._execute_rebalance(decision, portfolio)
                if tx_hash:
                    self._rebalances_today += 1
                    # Close the loop: the AI's allocation decision is now also
                    # executed as a real, capped, non-custodial swap on mainnet —
                    # but only when the reallocation is economically worth it.
                    defi_execution = await self._execute_defi_swap(decision, portfolio, yield_rates)
                else:
                    cycle_error = "TX_FAILED"

        # Real-yield routing — DECISION-DRIVEN, not a forced toggle. Staking tracks
        # the agent's own allocation call: the AI's conservative ("safe-yield")
        # bucket maps to delegated CSPR. The agent delegates toward that target
        # (idle liquid above the buffer) and picks the most profitable validator
        # live. staking_enabled is only a safety master-switch.
        await self._maybe_stake(portfolio, decision)

        # Post verified RWA prices on-chain — creates auditable oracle trail on Casper.
        # Posting is rate-limited (hourly), so most cycles post nothing; carry the
        # last known deploy hashes forward so the dashboard proof doesn't flicker.
        posted = await self._post_rwa_prices_onchain(rwa_prices)
        if posted:
            self._last_rwa_tx_hashes.update(posted)
        rwa_tx_hashes = dict(self._last_rwa_tx_hashes)

        # x402 micropayment — agent pays per cycle for the premium RWA risk feed.
        # A real ed25519-signed PROOF is produced every cycle (free HTTP part), and
        # on-chain settlement (CEP-18 transfer_with_authorization via the facilitator)
        # is attempted too — rate-limited to once per `min_settle_interval` so it
        # settles ~1×/hour, not every cycle. The earlier `User error: 37003` reverts
        # were caused by the malformed payTo ('01'+pubkey); with the corrected
        # account-hash payTo the settlement succeeds on-chain (verified: ef8798c8).
        # pay() verifies the real execution result and only marks `settled` when the
        # transfer actually succeeded — a revert is recorded honestly, never faked.
        x402_payment: dict = {}
        try:
            x402_payment = await self.x402.pay(resource="rwa-risk-feed",
                                               settle=self.x402_settle_onchain)
            if x402_payment.get("settled") and x402_payment.get("tx_hash"):
                logger.info("x402 micropayment settled on-chain — %s", x402_payment["tx_hash"][:16])
                # Persist the settlement so the /x402 history reflects live agent activity.
                try:
                    x402_settle_log.record_settlement(
                        x402_payment["tx_hash"],
                        kind="Settlement Rail",
                        label="agent per-cycle RWA feed (facilitator)",
                        frm=x402_payment.get("payer_address", ""),
                        to=x402_payment.get("pay_to", ""),
                        amount=str(x402_payment.get("amount", "")),
                    )
                except Exception:
                    pass
        except Exception as exc:
            logger.warning("x402 payment error: %s", exc)

        # Multi-tenant servicing: apply this cycle's AI market target to every
        # OTHER enrolled vault (the primary was handled above).
        tenant_executions = await self._service_tenant_vaults(decision)

        # Multi-tenant AUM for this cycle: primary custody + every enrolled
        # tenant vault's custody (cached package reads — no extra quota).
        aum_motes = portfolio.total_value_motes
        try:
            primary_pkg = (self.vault_contract_hash or "").replace("hash-", "").lower()
            for v in vault_registry.list_vaults():
                pkg = v.get("package_hash", "")
                if pkg and pkg != primary_pkg:
                    aum_motes += await self.casper._fetch_tvl_from_deploys(pkg)
        except Exception:
            pass

        return AgentCycleResult(
            # timezone-aware ISO (+00:00) — a naive string gets parsed as LOCAL time
            # by JS `new Date()`, which skewed the trajectory axis hours off the log.
            timestamp=datetime.now(timezone.utc).isoformat(),
            block_height=block_height,
            yield_rates=[r.model_dump() for r in yield_rates],
            portfolio=portfolio.model_dump(),
            decision=decision.model_dump(),
            rwa_prices=rwa_prices,
            rwa_tx_hashes=rwa_tx_hashes,
            tx_hash=tx_hash,
            x402_payment=x402_payment,
            defi_execution=defi_execution,
            tenant_executions=tenant_executions,
            aum_motes=aum_motes,
            error=cycle_error,
        )

    async def _service_tenant_vaults(self, decision: RebalanceDecision) -> list[dict]:
        """
        Multi-tenant servicing (one AI decision → per-vault execution).

        Market signals (RWA, validator yields) are global, so the cycle's AI target
        allocation applies to every vault; what differs per tenant is its CURRENT
        on-chain allocation. For each enrolled non-primary vault: read its
        allocation, and when it drifts from the AI target by ≥ tenant_min_drift_pct
        points, execute a real rebalance() on THAT vault (the agent is registered
        on it by its owner — verified at enrollment). Guards: per-vault daily cap,
        never raises into the main cycle, every action recorded in the registry.
        """
        results: list[dict] = []
        if not (self.multi_tenant_enabled and not self.paused):
            return results
        target = (decision.conservative_pct, decision.balanced_pct, decision.aggressive_pct)
        if sum(target) != 100:
            return results  # no valid market target this cycle

        primary = (self.vault_contract_hash or "").replace("hash-", "").lower()
        try:
            vaults = vault_registry.list_vaults()
        except Exception:
            return results

        for v in vaults:
            pkg = v.get("package_hash", "")
            if not pkg or pkg == primary:
                continue
            entry: dict = {"package_hash": pkg, "action": "HOLD", "tx_hash": None, "note": ""}
            try:
                done = self._tenant_rebalances_today.get(pkg, 0)
                if done >= self.tenant_max_rebalances:
                    entry.update(action="SKIP", note=f"daily cap {done}/{self.tenant_max_rebalances}")
                    results.append(entry)
                    continue

                port = await self.casper.get_vault_portfolio(pkg, agent_account_hash=self.agent_account)
                drift = max(
                    abs(target[0] - port.conservative_pct),
                    abs(target[1] - port.balanced_pct),
                    abs(target[2] - port.aggressive_pct),
                )
                if drift < self.tenant_min_drift_pct:
                    entry.update(note=f"within target (drift {drift}pp)")
                    results.append(entry)
                    continue

                reasoning = (f"[tenant] serviced from shared AI market target "
                             f"{target[0]}/{target[1]}/{target[2]} (drift {drift}pp). "
                             f"{decision.reasoning[:140]}")
                tx = await self.deployer.submit_rebalance(
                    contract_hash=pkg,
                    key_path=self.agent_key_path,
                    new_strategy=decision.new_strategy or "balanced",
                    conservative_pct=target[0],
                    balanced_pct=target[1],
                    aggressive_pct=target[2],
                    reasoning=reasoning,
                )
                self._tenant_rebalances_today[pkg] = done + 1
                entry.update(action="REBALANCE", tx_hash=tx, note=f"drift {drift}pp → {target}")
                vault_registry.record_action(pkg, "REBALANCE", tx_hash=tx or "",
                                             note=f"drift {drift}pp → {target[0]}/{target[1]}/{target[2]}")
                logger.info("[tenant %s…] rebalanced to %s — tx %s", pkg[:10], target, (tx or "")[:16])
            except Exception as exc:
                entry.update(action="ERROR", note=str(exc)[:160])
                logger.warning("[tenant %s…] servicing error: %s", pkg[:10], exc)
            results.append(entry)
        return results

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

    def _swap_worth_it(self, decision, portfolio, yield_rates) -> tuple[bool, str]:
        """
        Economic gate — decide whether a rebalance is materially worth a real swap.

        A swap costs gas + price impact, so a "clearly better allocation" isn't enough:
        the move must clear two bars. (1) Drift: the current allocation must be off the
        AI's target by at least `defi_min_drift_pct` points — avoids churning on noise.
        (2) Net gain: the estimated annualized portfolio APY uplift must clear
        `defi_min_net_gain_bps`. A HIGH-risk de-risk move bypasses the gain bar, since
        capital preservation can rightly accept lower yield. Returns (ok, reason).
        """
        drift = max(
            abs(decision.conservative_pct - portfolio.conservative_pct),
            abs(decision.balanced_pct - portfolio.balanced_pct),
            abs(decision.aggressive_pct - portfolio.aggressive_pct),
        )
        if drift < self.defi_min_drift_pct:
            return False, (f"drift {drift}pp < min {self.defi_min_drift_pct}pp — "
                           "allocation already near target")

        # Risk-driven de-risk is legitimate even at lower APY — skip the gain bar.
        if str(decision.risk_level).upper() == "HIGH":
            return True, f"de-risk (HIGH risk), drift {drift}pp"

        apy = {str(r.strategy).lower(): r.apy_bps for r in (yield_rates or [])}
        def _port_apy(con, bal, agg) -> float:  # weighted portfolio APY in bps
            return (con * apy.get("conservative", 0)
                    + bal * apy.get("balanced", 0)
                    + agg * apy.get("aggressive", 0)) / 100.0
        gain_bps = (
            _port_apy(decision.conservative_pct, decision.balanced_pct, decision.aggressive_pct)
            - _port_apy(portfolio.conservative_pct, portfolio.balanced_pct, portfolio.aggressive_pct)
        )
        if gain_bps < self.defi_min_net_gain_bps:
            return False, (f"est. APY uplift {gain_bps:.0f}bps < min "
                           f"{self.defi_min_net_gain_bps}bps — not worth swap cost")
        return True, f"drift {drift}pp, est. +{gain_bps:.0f}bps APY"

    async def _execute_defi_swap(self, decision: RebalanceDecision, portfolio, yield_rates) -> dict:
        """
        Execute a real, capped, non-custodial swap on Casper mainnet via CSPR.trade,
        triggered by an AI rebalance decision — turning the on-chain allocation record
        into actual on-chain DeFi execution.

        Heavily guarded: OFF unless `defi_execute_on_rebalance` is enabled; gated by an
        economic worth-it check (drift + net-gain), a per-day swap cap, a small fixed
        amount, and CSPR.trade's own amount + price-impact caps. Never raises — the swap
        is best-effort and reported in the cycle result so the dashboard can show
        "decision → executed on-chain".
        """
        if not (self.defi_execute_on_rebalance and self.cspr_trade):
            return {}
        if self._defi_swaps_today >= self.defi_max_swaps_per_day:
            return {
                "executed": False,
                "settlement": "daily_cap",
                "note": f"defi swap daily cap reached ({self._defi_swaps_today}/{self.defi_max_swaps_per_day})",
            }
        worth_it, reason = self._swap_worth_it(decision, portfolio, yield_rates)
        if not worth_it:
            logger.info("DeFi swap skipped — %s", reason)
            return {"executed": False, "settlement": "below_threshold", "note": reason}

        # Agent picks WHICH token to rotate into — the most profitable CSPR pair,
        # read live from the DEX — instead of a hard-coded env pair. Only refreshes
        # the choice when we don't already hold a position (avoids stranding it).
        if self._scspr_est < 1.0:
            try:
                pick = await self.cspr_trade.select_best_yield_token(fallback=self._yield_token)
                self._yield_token  = pick.get("token") or self._yield_token
                self._yield_reason = pick.get("reason") or "default"
                logger.info("agent picked yield token %s (%s)", self._yield_token, self._yield_reason)
            except Exception as exc:
                logger.info("yield-token pick failed (%s) — keeping %s", exc, self._yield_token)

        # Translate the AI's allocation change into a concrete, tradable swap.
        plan = self._plan_swap(decision, portfolio)
        if plan is None:
            note = "risk-on rebalance but agent holds no sCSPR position to unwind yet"
            logger.info("DeFi swap skipped — %s", note)
            return {"executed": False, "settlement": "no_position", "note": note}
        token_in, token_out, amount, dir_reason = plan

        # Balance guard: a mainnet swap spends the agent's OWN mainnet CSPR (amount +
        # gas). Pre-check the balance so we don't fire a swap the agent can't fund.
        # Only enforced when we can read a real balance; fail-open on read error
        # (the swap's own submit path back-stops it).
        if token_in.upper() == "CSPR":
            try:
                bal = await self.cspr_trade.get_native_cspr_balance(self.cspr_trade.agent_public_key)
                raw = (bal or {}).get("balance") or (bal or {}).get("cspr") or (bal or {}).get("motes")
                mainnet_cspr = float(raw) / (1e9 if raw and float(raw) > 1e6 else 1) if raw else None
                if mainnet_cspr is not None and mainnet_cspr < (amount + self.gas_per_action_cspr):
                    note = (f"insufficient mainnet CSPR for swap: have ~{mainnet_cspr:.1f}, "
                            f"need {amount:.1f} + gas")
                    logger.info("DeFi swap skipped — %s", note)
                    return {"executed": False, "settlement": "insufficient_balance", "note": note}
            except Exception:
                pass  # can't read balance → let the swap path decide

        try:
            record = await self.cspr_trade.swap(
                token_in=token_in, token_out=token_out,
                amount=str(amount), execute=True,
            )
            record["triggered_by"] = decision.new_strategy or decision.action
            record["direction_reason"] = dir_reason
            if record.get("executed"):
                self._defi_swaps_today += 1
                self._update_scspr_estimate(token_in, token_out, amount, record)
                swap_log.record_swap(record, triggered_by=record["triggered_by"])
                logger.info(
                    "DeFi execution on mainnet — %s %s→%s tx=%s (%s)",
                    amount, token_in, token_out, record.get("tx_hash"), dir_reason,
                )
            else:
                logger.info("DeFi execution not broadcast — %s", record.get("settlement"))
            return record
        except Exception as exc:
            logger.warning("DeFi execution error: %s", exc)
            return {"executed": False, "settlement": "error", "note": str(exc)[:200]}

    # sCSPR (liquid staking) is the only deep-liquidity yield instrument on CSPR.trade,
    # so the vault's risk axis maps to CSPR (deployable/aggressive) <-> sCSPR (staked/safe).
    def _plan_swap(self, decision: RebalanceDecision, portfolio) -> Optional[tuple]:
        """Translate the AI's allocation decision into (token_in, token_out, amount_cspr,
        reason). De-risking (more conservative / HIGH risk) stakes CSPR → sCSPR; risk-on
        (more aggressive) unwinds sCSPR → CSPR. Amount scales with allocation drift, capped
        by the CSPR.trade safety cap. Returns None when a risk-on move has no sCSPR to unwind.
        """
        agg_delta  = decision.aggressive_pct   - portfolio.aggressive_pct
        cons_delta = decision.conservative_pct - portfolio.conservative_pct
        drift = max(abs(agg_delta), abs(cons_delta),
                    abs(decision.balanced_pct - portfolio.balanced_pct))

        cap = self.cspr_trade.max_amount_cspr if self.cspr_trade else 25.0
        amount = min(cap, max(self.defi_swap_amount_cspr, round(drift * 0.5)))

        de_risk = (str(decision.risk_level).upper() == "HIGH"
                   or agg_delta < 0
                   or (agg_delta == 0 and cons_delta > 0))
        yt = self._yield_token
        if de_risk:
            return ("CSPR", yt, amount,
                    f"de-risk → rotate into {yt} ({self._yield_reason}): aggressive "
                    f"{portfolio.aggressive_pct}%→{decision.aggressive_pct}%, {amount} CSPR")

        # Risk-on: unwind the held yield token back to CSPR — only if we hold a position.
        if self._scspr_est < 1.0:
            return None
        amount = round(min(amount, self._scspr_est), 3)
        return (yt, "CSPR", amount,
                f"risk-on → unwind {yt}: aggressive {portfolio.aggressive_pct}%→"
                f"{decision.aggressive_pct}%, {amount} {yt}")

    def _update_scspr_estimate(self, token_in: str, token_out: str, amount: float, record: dict) -> None:
        """Track our yield-token position so risk-on unwinds stay feasible. CSPR→token
        adds the estimated output; token→CSPR subtracts what was spent. Works for
        whichever yield token the agent picked (not just sCSPR)."""
        yt = (self._yield_token or "").upper()
        if token_in.upper() == "CSPR" and token_out.upper() == yt:
            try:
                out = float((record.get("summary") or {}).get("out_estimate") or amount)
            except (TypeError, ValueError):
                out = amount
            self._scspr_est += out
        elif token_in.upper() == yt:
            self._scspr_est = max(0.0, self._scspr_est - amount)

    async def _read_agent_gas(self) -> float:
        """The agent's own CSPR balance (its gas tank), in CSPR. get_account_balance
        returns a large sentinel on read failure, which we treat as 'unknown' and
        fail OPEN (a transient RPC hiccup shouldn't freeze the agent) — still logged."""
        try:
            acct = (self.agent_account or "").replace("account-hash-", "")
            motes = await self.casper.get_account_balance(acct)
            return (motes or 0) / 1e9
        except Exception:
            return 999_999.0   # unknown → fail open

    def _can_spend_gas(self) -> bool:
        """True when the agent can afford one on-chain action AND keep its reserve —
        so it never strands itself mid-management with an empty tank."""
        return self._agent_gas_cspr >= (self.gas_reserve_cspr + self.gas_per_action_cspr)

    async def _maybe_refuel_gas(self) -> None:
        """Self-funding refuel: when the gas tank is low, sweep the vault's accrued
        management fees to the agent account (collect_fees) so it keeps operating on
        its own revenue. Best-effort, at most once per day."""
        today = date.today()
        if self._last_refuel_date == today:
            return
        try:
            tx = await self.deployer.submit_collect_fees(self.vault_contract_hash, self.agent_key_path)
            if tx:
                self._last_refuel_date = today
                logger.info("gas low (%.0f CSPR) — swept vault fees to refuel the agent — %s",
                            self._agent_gas_cspr, tx[:16])
        except Exception as exc:
            logger.info("gas refuel (collect_fees) skipped: %s", exc)

    async def _maybe_stake(self, portfolio, decision=None) -> None:
        """Decision-driven real-yield routing. Staking follows the agent's OWN
        allocation decision — the AI's conservative ('safe-yield') bucket maps to
        delegated CSPR — rather than blindly staking every cycle. The agent (1)
        computes a staked TARGET from the decision's allocation, (2) picks the most
        profitable validator live (lowest-fee active), and (3) delegates toward the
        target only when idle liquid clears the buffer + Casper minimum. This is
        exactly 'stake when the analysis says yield is worth it'. Best-effort; the
        contract guards back-stop it. staking_enabled is a safety master-switch."""
        if not self.staking_enabled:
            return
        if not self._can_spend_gas():
            logger.info("skip stake — low gas (%.0f CSPR), preserving runway", self._agent_gas_cspr)
            return
        if self._stakes_today >= self.stake_max_per_day:
            return

        # ── The AI's DECISION sets the yield target ──────────────────────────
        # The conservative bucket is the vault's safe, yield-bearing allocation →
        # that is the fraction the agent stakes. No decision / 0% target = no stake.
        tvl_cspr   = (getattr(portfolio, "total_value_motes", 0) or 0) / 1e9
        target_pct = float(getattr(decision, "conservative_pct", 0) or 0) if decision else 0.0
        target_staked = min(tvl_cspr * target_pct / 100.0,
                            max(0.0, tvl_cspr - self.stake_buffer_cspr))
        gap = target_staked - self._staked_cspr
        if target_pct <= 0 or gap < self.stake_amount_cspr:
            logger.info("skip stake — AI target staked ~%.0f CSPR (%.0f%%), already ~%.0f (gap %.0f < min %.0f)",
                        target_staked, target_pct, self._staked_cspr, gap, self.stake_amount_cspr)
            return

        try:
            # (1) WHICH validator — explicit env override, else the agent selects
            #     the most profitable validator autonomously from on-chain data.
            validator = self.validator_public_key
            if not validator:
                best = await self.casper.select_best_validator()
                if not best:
                    logger.info("skip stake — no validator selectable yet")
                    return
                validator = best["public_key"]
                self._selected_validator_info = best
                logger.info("agent picked validator %s (fee %d%%)", validator[:16], best["delegation_rate"])

            # Register the chosen validator on-chain once (or when it changes).
            if not self._validator_set or validator != self._active_validator:
                vtx = await self.deployer.submit_set_validator(
                    self.vault_contract_hash, self.agent_key_path, validator)
                if vtx:
                    self._validator_set = True
                    self._active_validator = validator
                    logger.info("validator set on-chain (%s) — %s", validator[:16], vtx[:16])
                    staking_log.record(self.vault_contract_hash, "set_validator", vtx, validator=validator)
                return  # let it finalize; delegate on a later cycle

            # (2) HOW MUCH — one delegation chunk toward the AI's target this cycle
            #     (the decision gate above already confirmed gap ≥ min chunk and that
            #     idle liquid clears the buffer). Incremental across cycles/days cap.
            stake_amt = self.stake_amount_cspr
            tx = await self.deployer.submit_stake(
                self.vault_contract_hash, self.agent_key_path, stake_amt)
            if tx:
                self._staked_cspr += stake_amt
                self._stakes_today += 1
                logger.info("staked %.0f CSPR toward AI target (real yield) — validator %s — %s",
                            stake_amt, (self._active_validator or "")[:16], tx[:16])
                staking_log.record(self.vault_contract_hash, "stake", tx,
                                   amount_cspr=stake_amt, validator=self._active_validator)
        except Exception as exc:
            logger.warning("staking error: %s", exc)

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
        gas = self._agent_gas_cspr if self._agent_gas_cspr < 90_000 else None
        return {
            "running": self._running,
            "paused": self.paused,
            "rebalances_today": self._rebalances_today,
            "defi_swaps_today": self._defi_swaps_today,
            "defi_execute_on_rebalance": self.defi_execute_on_rebalance,
            "multi_tenant_enabled": self.multi_tenant_enabled,
            "tenant_rebalances_today": dict(self._tenant_rebalances_today),
            "total_cycles": len(self._cycle_history),
            "poll_interval_seconds": self.poll_interval,
            # Agent gas tank (its own CSPR) + runway so the UI can show fuel level.
            "agent_gas_cspr": round(gas, 1) if gas is not None else None,
            "gas_reserve_cspr": self.gas_reserve_cspr,
            "gas_per_action_cspr": self.gas_per_action_cspr,
            "runway_actions": (int(max(0.0, (gas - self.gas_reserve_cspr)) / self.gas_per_action_cspr)
                               if gas is not None and self.gas_per_action_cspr > 0 else None),
            "staking_enabled": self.staking_enabled,
            # The agent's own mainnet DeFi position (from CSPR.trade swaps of AGENT
            # capital) — a yield token like sCSPR. Distinct from per-vault CSPR.
            "defi_position": ({"token": self._yield_token, "amount_est": round(self._scspr_est, 3),
                               "reason": self._yield_reason} if self._scspr_est > 0 else None),
        }
