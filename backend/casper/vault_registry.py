"""
Vault registry — the multi-tenant onboarding ledger.

Every vault where the agent has been registered ON-CHAIN by that vault's owner
(a successful only_owner `register_agent` deploy) is enrolled here. Enrollment
is automatic and evidence-based: it happens when /vault/agent-registered
verifies the registration for a package, so an entry always corresponds to a
real, checkable on-chain fact — never a self-claim.

This is deliberately step 1 of multi-tenancy (the tenant onboarding pipeline).
Autonomous management of every enrolled vault by the agent loop is Phase 3.

Persistence mirrors swap_log.py: a small JSON file, deduped by package hash.
The file is also self-healing — if it's lost on a redeploy, entries re-enroll
the next time each vault's registration is verified.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# backend/vault_registry.json (module lives in backend/casper/)
_PATH = Path(__file__).resolve().parent.parent / "vault_registry.json"
_LOCK = threading.Lock()
_MAX_ENTRIES = 200


def _read() -> list[dict]:
    """Load the registry. Never raises."""
    if not _PATH.is_file():
        return []
    try:
        data = json.loads(_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception as exc:
        logger.warning("vault registry unreadable (%s) — starting empty", exc)
        return []


def _write(entries: list[dict]) -> None:
    try:
        _PATH.write_text(json.dumps(entries, indent=1), encoding="utf-8")
    except Exception as exc:
        logger.warning("vault registry write failed: %s", exc)


def enroll(package_hash: str, *, agent_hash: str = "", owner_public_key: str = "",
           register_tx: str = "", is_primary: bool = False) -> None:
    """Enroll (or refresh) a vault whose on-chain agent registration was just
    verified. Deduped by package hash; updates fields on re-verification."""
    pkg = (package_hash or "").replace("hash-", "").replace("package-", "").lower()
    if len(pkg) != 64:
        return
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _LOCK:
        entries = _read()
        existing = next((e for e in entries if e.get("package_hash") == pkg), None)
        if existing:
            existing.update({
                "agent_hash": agent_hash or existing.get("agent_hash", ""),
                "owner_public_key": owner_public_key or existing.get("owner_public_key", ""),
                "register_tx": register_tx or existing.get("register_tx", ""),
                "is_primary": is_primary or existing.get("is_primary", False),
                "last_verified": now,
            })
        else:
            entries.append({
                "package_hash": pkg,
                "agent_hash": agent_hash,
                "owner_public_key": owner_public_key,
                "register_tx": register_tx,
                "is_primary": is_primary,
                "enrolled_at": now,
                "last_verified": now,
            })
            logger.info("vault enrolled: %s… (primary=%s)", pkg[:12], is_primary)
        _write(entries[-_MAX_ENTRIES:])


def list_vaults() -> list[dict]:
    """All enrolled vaults, primary first, then newest enrollment first."""
    entries = _read()
    entries.sort(key=lambda e: e.get("enrolled_at", ""), reverse=True)
    entries.sort(key=lambda e: not e.get("is_primary", False))
    return entries
