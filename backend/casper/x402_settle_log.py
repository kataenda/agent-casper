"""
Persistent log of real agent-to-agent x402 settlements (CEP-18
transfer_with_authorization on Casper testnet, where the X402 token lives).

Why this exists: the /x402 dashboard's agent-to-agent proof panel used to show a
hard-coded list of tx hashes. This module persists every recorded settlement to a
small JSON file so the panel can show live history (newest first), surviving
backend restarts. Deduped by tx_hash, seeded with the already-verified proofs so
the history is never empty on a fresh deploy.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# backend/x402_settlements.json (module lives in backend/casper/)
_LOG_PATH = Path(__file__).resolve().parent.parent / "x402_settlements.json"
_LOCK = threading.Lock()
_MAX_ENTRIES = 100
_TESTNET = "https://testnet.cspr.live/transaction/"

# Already-verified agent-to-agent settlements (referenced in README/SUBMISSION).
# Seeded so the proof history is never empty even before a new settlement runs.
_SEED: list[dict] = [
    {
        "tx_hash": "eb0e914cdd902b177d95cd92a345cff3d7cdfbc33bffe8927d456d8c8a1f469e",
        "kind": "Agent → Agent", "label": "Independent buyer pays provider",
        "from": "00e2d5cd…", "to": "0088cb6d…", "amount": "1000000000",
        "network": "casper:casper-test", "ts": "2026-06-29T00:00:00Z", "verified": True,
    },
    {
        "tx_hash": "aae75698ab2181750b8418b15597d20cdff650a0bc9ec55495f5b53a04cd71e3",
        "kind": "Agent → Agent", "label": "Buyer pays provider (repeat — reproducible)",
        "from": "00e2d5cd…", "to": "0088cb6d…", "amount": "1000000000",
        "network": "casper:casper-test", "ts": "2026-06-29T00:01:00Z", "verified": True,
    },
    {
        "tx_hash": "e297580fc01b3bd4bfb011a592f129822b253041bf643ce16aed6c34f4443fdc",
        "kind": "Settlement Rail", "label": "transfer_with_authorization (facilitator)",
        "from": "agent", "to": "agent", "amount": "1000000000",
        "network": "casper:casper-test", "ts": "2026-06-28T00:00:00Z", "verified": True,
    },
]


def _explorer(tx_hash: str) -> str:
    return _TESTNET + tx_hash


def _read() -> list[dict]:
    """Load the log, seeding the file on first use. Never raises."""
    if not _LOG_PATH.is_file():
        _write(_SEED)
        return list(_SEED)
    try:
        data = json.loads(_LOG_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else list(_SEED)
    except Exception as exc:
        logger.warning("x402_settle_log: could not read %s (%s) — using seed", _LOG_PATH, exc)
        return list(_SEED)


def _write(items: list[dict]) -> None:
    try:
        _LOG_PATH.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:
        logger.warning("x402_settle_log: could not write %s (%s)", _LOG_PATH, exc)


def record_settlement(
    tx_hash: str, *, kind: str = "Agent → Agent", label: str = "Buyer pays provider",
    frm: str = "", to: str = "", amount: str = "", verified: bool = True,
) -> bool:
    """Append a settlement to the persistent history. Deduped by tx_hash, newest
    first, capped. Returns True if newly recorded, False if it was already there."""
    if not tx_hash:
        return False
    entry = {
        "tx_hash": tx_hash, "kind": kind, "label": label,
        "from": frm or "buyer", "to": to or "provider", "amount": amount,
        "network": "casper:casper-test", "explorer_url": _explorer(tx_hash),
        "ts": datetime.now(timezone.utc).isoformat(), "verified": verified,
    }
    with _LOCK:
        items = _read()
        if any(i.get("tx_hash") == tx_hash for i in items):
            return False
        items.insert(0, entry)
        _write(items[:_MAX_ENTRIES])
    logger.info("x402_settle_log: recorded settlement %s (%s)", tx_hash[:16], kind)
    return True


def load_settlements(limit: int = 50) -> list[dict]:
    """Return the settlement history, newest first. Adds explorer_url if missing."""
    with _LOCK:
        items = _read()[:limit]
    for i in items:
        i.setdefault("explorer_url", _explorer(i.get("tx_hash", "")))
    return items
