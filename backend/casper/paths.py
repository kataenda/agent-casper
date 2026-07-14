"""
Single place that decides WHERE runtime state lives.

Every piece of persisted agent state — cycle history, swap/staking logs, trust
state, and the multi-tenant vault registry — is written into ONE directory, so a
single mounted volume keeps all of it across container redeploys. Without this,
a redeploy silently resets the decision log, the portfolio trajectory, and (worst)
the vault registry that tells the agent which tenant vaults to service.

Override the location with DATA_DIR (e.g. a Coolify volume at /app/data).

Files written before this module existed lived next to the code (backend/*.json).
`data_file()` migrates such a file into DATA_DIR on first use, so upgrading an
existing deployment never loses state.
"""

from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(_BACKEND_DIR / "data")))


def data_file(name: str) -> Path:
    """Return the path for a state file inside DATA_DIR, migrating any legacy
    copy that still sits next to the code."""
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as exc:  # read-only FS — fall back to the legacy location
        logger.warning("DATA_DIR %s not writable (%s) — using %s", DATA_DIR, exc, _BACKEND_DIR)
        return _BACKEND_DIR / name

    target = DATA_DIR / name
    legacy = _BACKEND_DIR / name
    if not target.exists() and legacy.is_file():
        try:
            shutil.copy2(legacy, target)
            logger.info("Migrated %s -> %s", legacy, target)
        except OSError as exc:
            logger.warning("Could not migrate %s (%s) — starting fresh", legacy, exc)
    return target
