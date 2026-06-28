"""
Persistent log of real, non-custodial DeFi swaps executed on Casper mainnet.

Why this exists: the dashboard's "Real DeFi Swap" proof used to show a single
hard-coded tx (or, at best, the latest swap still held in the agent's in-memory
cycle history). This module persists every executed swap to a small JSON file so
the proof becomes a real, append-only history that survives backend restarts.

Deduped by tx_hash and seeded with the two already-verified mainnet swaps so the
history is never empty — even on a fresh deploy before any new swap runs.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# backend/swap_history.json (module lives in backend/casper/)
_LOG_PATH = Path(__file__).resolve().parent.parent / "swap_history.json"
_LOCK = threading.Lock()
_MAX_ENTRIES = 100

# Already-verified real mainnet swaps (referenced in README/SUBMISSION). Seeded so
# the proof history is never empty. The `ts` values are the swaps' REAL on-chain
# deploy timestamps (fetched from cspr.cloud) — not fabricated.
_SEED: list[dict] = [
    {
        "tx_hash": "2bafdb43211c32d88d815873fc2bcee12d4c141dec8cc6e24399bea5c320164f",
        "amount": "5", "token_in": "CSPR", "token_out": "sCSPR",
        "explorer_url": "https://cspr.live/transaction/2bafdb43211c32d88d815873fc2bcee12d4c141dec8cc6e24399bea5c320164f",
        "executed": True, "settlement": "submitted",
        "triggered_by": "agent", "ts": "2026-06-26T17:42:20Z",
    },
    {
        "tx_hash": "f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5",
        "amount": "5", "token_in": "CSPR", "token_out": "sCSPR",
        "explorer_url": "https://cspr.live/transaction/f28a4051e17a67f4a6bd9951802cfb64a062b1daa01b59945b444fb25a052eb5",
        "executed": True, "settlement": "submitted",
        "triggered_by": "manual", "ts": "2026-06-25T17:31:37Z",
    },
]

# tx_hash → real on-chain timestamp, used to self-heal older log files that were
# seeded before these timestamps were known (their entries had ts=None).
_SEED_TS = {s["tx_hash"]: s["ts"] for s in _SEED}


def _read() -> list[dict]:
    """Load the log, seeding the file on first use. Never raises."""
    if not _LOG_PATH.is_file():
        _write(_SEED)
        return list(_SEED)
    try:
        data = json.loads(_LOG_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            return list(_SEED)
        # Self-heal: backfill real on-chain timestamps for seed entries that were
        # written before those timestamps were known (ts was None).
        for item in data:
            if not item.get("ts") and item.get("tx_hash") in _SEED_TS:
                item["ts"] = _SEED_TS[item["tx_hash"]]
        return data
    except Exception as exc:  # corrupt/unreadable — fall back to seed, don't crash
        logger.warning("swap_log: could not read %s (%s) — using seed", _LOG_PATH, exc)
        return list(_SEED)


def _write(items: list[dict]) -> None:
    try:
        _LOG_PATH.write_text(json.dumps(items, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning("swap_log: could not write %s (%s)", _LOG_PATH, exc)


def record_swap(record: dict, *, triggered_by: str | None = None) -> None:
    """
    Append an executed swap to the persistent history.

    Only records swaps that actually broadcast on-chain (executed + tx_hash).
    Deduped by tx_hash, newest first, capped at _MAX_ENTRIES.
    """
    tx_hash = record.get("tx_hash")
    if not (record.get("executed") and tx_hash):
        return
    entry = {
        "tx_hash": tx_hash,
        "amount": record.get("amount"),
        "token_in": record.get("token_in", "CSPR"),
        "token_out": record.get("token_out", "sCSPR"),
        "explorer_url": record.get("explorer_url") or f"https://cspr.live/transaction/{tx_hash}",
        "executed": True,
        "settlement": record.get("settlement", "submitted"),
        "triggered_by": triggered_by or record.get("triggered_by") or "manual",
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    with _LOCK:
        items = _read()
        if any(i.get("tx_hash") == tx_hash for i in items):
            return  # already logged
        items.insert(0, entry)
        _write(items[:_MAX_ENTRIES])
    logger.info("swap_log: recorded mainnet swap %s (%s)", tx_hash[:16], entry["triggered_by"])


def load_swaps(limit: int = 50) -> list[dict]:
    """Return the swap history, newest first."""
    with _LOCK:
        return _read()[:limit]
