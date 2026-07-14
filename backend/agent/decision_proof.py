"""
Verifiable AI decisions — a cryptographic commitment, on-chain, every cycle.

An AI agent that merely *claims* it reasoned over some data is a black box: the
backend could rewrite the reasoning after the fact and nobody could tell. So each
cycle we hash the EXACT inputs the model saw together with the decision it
produced, and publish that digest **on-chain** inside the `reasoning` argument of
the `rebalance()` call (no contract change needed — the argument is already part
of the deploy, permanently visible on cspr.live).

The pre-image (inputs + decision) is served from `/agent/decision-proof`, so
anyone can recompute the digest and check it against the deploy. If the backend
ever altered a stored decision, the hash would stop matching the chain.

Commitment = sha256(canonical_json(preimage)), canonical = sorted keys, no spaces.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from casper.paths import data_file

logger = logging.getLogger(__name__)

_STORE = data_file("decision_proofs.json")
_MAX_KEEP = 300
_ONCHAIN_TAG = "sha256:"


def _canonical(obj: Any) -> str:
    """Stable JSON: sorted keys, compact separators — so the digest is reproducible."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def build_preimage(
    *,
    block_height: int,
    portfolio: dict,
    yield_rates: list,
    rwa_prices: list,
    decision: dict,
) -> dict:
    """The exact material the commitment covers: what the model saw + what it decided."""
    return {
        "block_height": block_height,
        "inputs": {
            "portfolio": portfolio,
            "yield_rates": yield_rates,
            "rwa_prices": rwa_prices,
        },
        "decision": decision,
    }


def digest(preimage: dict) -> str:
    return hashlib.sha256(_canonical(preimage).encode("utf-8")).hexdigest()


def onchain_reasoning(reasoning: str, commitment: str, max_reason: int = 400) -> str:
    """The string actually sent on-chain: the AI's own words + the commitment."""
    text = (reasoning or "").strip()[:max_reason]
    return f"{text} | {_ONCHAIN_TAG}{commitment}"


def record(tx_hash: str, commitment: str, preimage: dict) -> None:
    """Persist the pre-image so the on-chain digest stays independently checkable."""
    try:
        entries = load_all()
        entries.append({"tx_hash": tx_hash, "commitment": commitment, "preimage": preimage})
        _STORE.write_text(_canonical(entries[-_MAX_KEEP:]), encoding="utf-8")
    except OSError as exc:
        logger.warning("could not persist decision proof for %s: %s", tx_hash, exc)


def load_all() -> list[dict]:
    try:
        if _STORE.is_file():
            data = json.loads(_STORE.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
    except (OSError, ValueError) as exc:
        logger.warning("decision proof store unreadable (%s) — starting fresh", exc)
    return []


def find(tx_hash: str) -> dict | None:
    tx = (tx_hash or "").lower().removeprefix("0x")
    for e in reversed(load_all()):
        if str(e.get("tx_hash", "")).lower() == tx:
            return e
    return None


def verify(entry: dict) -> bool:
    """Recompute the digest from the stored pre-image — this is what an auditor runs."""
    return digest(entry.get("preimage") or {}) == entry.get("commitment")
