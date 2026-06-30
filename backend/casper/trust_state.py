"""
On-chain anchoring + persistence for the Trust Engine.

The trust score is computed off-chain (deterministically, from real data), but to
make it *verifiable* and readable by other agents we anchor it on-chain: the agent
signs a native Casper transfer to itself whose transfer-id encodes the score
(round(score × 100), e.g. 94.1 → 9410). The transaction is visible on cspr.live, so
anyone — including another agent over x402 — can independently confirm the score the
agent claimed at that block. The last anchor is persisted so the dashboard and the
public read endpoint can surface it without re-querying the chain every call.

Cost: one native transfer (2.5 CSPR floor + gas) per anchor — so anchoring is an
explicit, admin-gated, rate-limited action, not something done every cycle.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_STATE_PATH = Path(__file__).resolve().parent.parent / "trust_state.json"
_LOCK = threading.Lock()

MIN_NATIVE_TRANSFER_MOTES = 2_500_000_000  # 2.5 CSPR — Casper native-transfer floor
MIN_ANCHOR_INTERVAL_S = 300                 # don't anchor more than once per 5 min


# ── Persistence ───────────────────────────────────────────────────────────────

def _read() -> dict:
    if not _STATE_PATH.is_file():
        return {}
    try:
        d = json.loads(_STATE_PATH.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except Exception as exc:
        logger.warning("trust_state: read failed (%s)", exc)
        return {}


def _write(d: dict) -> None:
    try:
        _STATE_PATH.write_text(json.dumps(d, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning("trust_state: write failed (%s)", exc)


def get_last_anchor() -> Optional[dict]:
    with _LOCK:
        return _read().get("last_anchor")


def _set_last_anchor(record: dict) -> None:
    with _LOCK:
        d = _read()
        d["last_anchor"] = record
        _write(d)


# ── On-chain anchor ───────────────────────────────────────────────────────────

async def anchor_onchain(
    score: float,
    key_path: str,
    node_url: str,
    cloud_api_key: str = "",
    chain_name: str = "casper-test",
    explorer_base: str = "https://testnet.cspr.live/deploy/",
) -> dict:
    """Submit a real on-chain anchor of `score`. Rate-limited. Returns a record with
    the deploy hash + explorer URL, and persists it as the last anchor."""
    last = get_last_anchor()
    if last and (time.time() - last.get("_ts", 0)) < MIN_ANCHOR_INTERVAL_S:
        wait = int(MIN_ANCHOR_INTERVAL_S - (time.time() - last["_ts"]))
        raise RuntimeError(f"anchor rate-limited — try again in {wait}s")

    import pycspr  # local import keeps module import cheap

    kp = pycspr.parse_private_key(Path(key_path))
    encoded = int(round(float(score) * 100))   # 94.1 → 9410
    params = pycspr.create_deploy_parameters(account=kp, chain_name=chain_name)
    deploy = pycspr.create_transfer(
        params,
        amount=MIN_NATIVE_TRANSFER_MOTES,
        target=kp.account_key,                  # self — the score lives in the transfer id
        correlation_id=encoded,
    )
    deploy.approve(kp)

    headers = {"Content-Type": "application/json"}
    if cloud_api_key:
        headers["Authorization"] = cloud_api_key
    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        resp = await client.post(node_url, json={
            "id": 1, "jsonrpc": "2.0", "method": "account_put_deploy",
            "params": {"deploy": pycspr.to_json(deploy)},
        })
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise RuntimeError(data["error"].get("message", str(data["error"])))
        deploy_hash = data["result"]["deploy_hash"]

    record = {
        "score": round(float(score), 1),
        "encoded_id": encoded,
        "tx_hash": deploy_hash,
        "explorer_url": explorer_base + deploy_hash,
        "ts": datetime.now(timezone.utc).isoformat(),
        "_ts": time.time(),
        "note": "Native self-transfer; transfer-id encodes score×100. Verifiable on cspr.live.",
    }
    _set_last_anchor(record)
    logger.info("trust: anchored score %.1f on-chain — %s", score, deploy_hash[:16])
    return record
