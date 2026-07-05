"""
Persistent, per-vault staking history.

Native-staking actions (set_validator / stake / unstake) are stored contract
calls whose entry-point name CSPR.cloud does not expose (and stake/unstake/
withdraw share the same `amount` arg), so they can't be reconstructed reliably
from deploy args. Instead we log each action here the moment the agent (or the
owner via the admin API) submits it — we know the action and amount at that
point. Keyed by vault package hash so the UI can show a history per vault.

Append-only JSON, deduped by tx_hash, newest first, capped.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_LOG_PATH = Path(__file__).resolve().parent.parent / "staking_history.json"
_LOCK = threading.Lock()
_MAX_ENTRIES = 300


def _norm(pkg: str) -> str:
    return (pkg or "").replace("hash-", "").replace("package-", "").lower()


def _read() -> list[dict]:
    if not _LOG_PATH.is_file():
        return []
    try:
        data = json.loads(_LOG_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception as exc:
        logger.warning("staking_log: could not read %s (%s)", _LOG_PATH, exc)
        return []


def _write(items: list[dict]) -> None:
    try:
        _LOG_PATH.write_text(json.dumps(items, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning("staking_log: could not write %s (%s)", _LOG_PATH, exc)


def record(package: str, action: str, tx_hash: str, *,
           amount_cspr: float | None = None, validator: str = "") -> None:
    """Append a staking action. `action` ∈ {set_validator, stake, unstake}."""
    if not tx_hash:
        return
    entry = {
        "package": _norm(package),
        "action": action,
        "amount_cspr": amount_cspr,
        "validator": (validator or "").lower(),
        "tx_hash": tx_hash,
        "explorer_url": f"https://testnet.cspr.live/deploy/{tx_hash}",
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    with _LOCK:
        items = _read()
        if any(i.get("tx_hash") == tx_hash for i in items):
            return
        items.insert(0, entry)
        _write(items[:_MAX_ENTRIES])
    logger.info("staking_log: %s %s on %s (%s)", action, amount_cspr, _norm(package)[:10], tx_hash[:14])


def load(package: str | None = None, limit: int = 50) -> list[dict]:
    """Staking history, newest first — filtered to one vault package when given."""
    items = _read()
    if package:
        pkg = _norm(package)
        items = [i for i in items if i.get("package") == pkg]
    return items[:limit]
