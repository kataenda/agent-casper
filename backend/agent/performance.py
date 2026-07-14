"""
Does the agent actually EARN its keep?

A dashboard that only shows "portfolio value" never answers the one question a
DeFi judge cares about: is the AI's decision-making better than doing nothing?
So we report two things, and we keep them strictly separate — conflating them is
how projects end up claiming yield they never earned.

1. DECISION QUALITY (measurable today, no capital movement required)
   Each cycle the model saw live validator rates and chose an allocation. The APY
   that allocation TARGETS is  Σ (weight_i × apy_i).  We compute the same number
   for a passive baseline — "just hold Balanced forever" — and report the edge.
   That is an honest read on whether the AI's choices beat sitting still.

   It is an *implied* (targeted) APY, not money earned. We label it as such.

2. REALIZED (only once the vault's CSPR is actually delegated)
   Until `STAKING_ENABLED` puts capital to work, the vault earns nothing and the
   realized figures are zero — reported plainly, with a reason, never dressed up.
   A `rebalance()` only rewrites allocation percentages on-chain; no CSPR moves.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

logger = logging.getLogger(__name__)

BASELINE_NAME = "Balanced"   # the passive comparator: hold Balanced, forever


def _rate_map(yield_rates: Iterable[Any]) -> dict[str, float]:
    """strategy -> apy in bps, from whatever shape the cycle stored."""
    out: dict[str, float] = {}
    for r in yield_rates or []:
        d = r if isinstance(r, dict) else getattr(r, "model_dump", lambda: {})()
        name = str(d.get("strategy", "")).strip()
        if name:
            try:
                out[name] = float(d.get("apy_bps", 0))
            except (TypeError, ValueError):
                continue
    return out


def implied_apy_bps(allocation: dict, rates: dict[str, float]) -> float | None:
    """APY (bps) that an allocation targets, weighted across the live rates."""
    if not rates:
        return None
    weights = {
        "Conservative": allocation.get("conservative_pct"),
        "Balanced":     allocation.get("balanced_pct"),
        "Aggressive":   allocation.get("aggressive_pct"),
    }
    total = 0.0
    used = 0.0
    for strategy, pct in weights.items():
        if pct is None or strategy not in rates:
            continue
        total += (float(pct) / 100.0) * rates[strategy]
        used += float(pct)
    if used <= 0:
        return None
    return total


def summarize(cycles: list[Any], aum_cspr: float, staked_cspr: float,
              staking_enabled: bool) -> dict:
    """Build the performance panel from the persisted cycle history."""
    agent_series: list[float] = []
    base_series: list[float] = []
    points: list[dict] = []
    derisk_cycles = 0   # cycles the AI flagged HIGH risk — it targets LESS yield on purpose

    for c in cycles:
        d = c if isinstance(c, dict) else getattr(c, "model_dump", lambda: {})()
        rates = _rate_map(d.get("yield_rates") or [])
        if not rates:
            continue
        portfolio = d.get("portfolio") or {}
        agent_bps = implied_apy_bps(portfolio, rates)
        base_bps = rates.get(BASELINE_NAME)
        if agent_bps is None or base_bps is None:
            continue
        agent_series.append(agent_bps)
        base_series.append(float(base_bps))
        risk = str(((d.get("decision") or {}).get("risk_level") or "")).upper()
        if risk == "HIGH":
            derisk_cycles += 1
        points.append({
            "ts": d.get("timestamp"),
            "block_height": d.get("block_height"),
            "agent_apy_pct": round(agent_bps / 100, 2),
            "baseline_apy_pct": round(float(base_bps) / 100, 2),
            "edge_bps": round(agent_bps - float(base_bps)),
            "risk_level": risk or None,
        })

    n = len(agent_series)
    if n:
        cur_agent = agent_series[-1]
        cur_base = base_series[-1]
        avg_edge = sum(a - b for a, b in zip(agent_series, base_series)) / n
        beat = sum(1 for a, b in zip(agent_series, base_series) if a > b)
    else:
        cur_agent = cur_base = avg_edge = 0.0
        beat = 0

    decision_quality = {
        "measurable": bool(n),
        "cycles_measured": n,
        "agent_implied_apy_pct": round(cur_agent / 100, 2) if n else None,
        "baseline_implied_apy_pct": round(cur_base / 100, 2) if n else None,
        "baseline": f"passive hold — 100% {BASELINE_NAME}",
        "edge_bps": round(cur_agent - cur_base) if n else None,
        "avg_edge_bps": round(avg_edge) if n else None,
        "cycles_beating_baseline": beat,
        "beat_rate_pct": round(100 * beat / n) if n else None,
        "derisk_cycles": derisk_cycles,
        "note": (
            "APY the AI's allocation TARGETS, using the validator rates the model actually "
            "saw each cycle, versus passively holding Balanced. This measures decision quality — "
            "it is not money earned."
        ),
        "reading_it": (
            "A NEGATIVE edge is not a failure: on a HIGH-risk signal the agent deliberately "
            "targets less yield to preserve capital — a passive Balanced hold cannot do that. "
            "Judge the agent on when it gives up yield, not only on how much it targets."
        ),
        "series": points[-60:],
    }

    # ── Realized — no dressing up. Allocation percentages are not yield. ──────
    deployed = staked_cspr > 0
    realized = {
        "capital_deployed": deployed,
        "staked_cspr": round(staked_cspr, 2),
        "idle_cspr": round(max(aum_cspr - staked_cspr, 0.0), 2),
        "aum_cspr": round(aum_cspr, 2),
        "deployed_pct": round(100 * staked_cspr / aum_cspr, 1) if aum_cspr > 0 else 0.0,
        "realized_yield_cspr": 0.0 if not deployed else None,
        "status": (
            "earning" if deployed
            else ("armed" if staking_enabled else "not_deployed")
        ),
        "note": (
            "The vault's CSPR is delegated to a Casper validator — rewards accrue on-chain at "
            "the validator and are visible in the auction state."
            if deployed else
            "No CSPR is delegated yet, so the vault has earned nothing — reported as zero rather "
            "than implied. A rebalance() only rewrites allocation percentages on-chain; it moves "
            "no funds. Realized yield begins when the agent delegates (STAKING_ENABLED)."
        ),
    }

    return {"decision_quality": decision_quality, "realized": realized}
