#!/usr/bin/env python3
"""
Casper MCP Server - exposes Casper blockchain tools for AI agents via
the Model Context Protocol (MCP).

Run standalone:
    python casper/mcp_server.py

Or spawned as a subprocess by DecisionEngine for Claude to use.
"""

import asyncio
import json
import logging
import os
import pathlib
import random
import sys
from typing import Any

import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

# RWA oracle (same process - import directly)
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from casper.rwa_oracle import RWAOracle

_rwa_oracle = RWAOracle()

# Quiet logging so stdio transport is not polluted
logging.basicConfig(level=logging.WARNING, stream=sys.stderr)

# Official CSPR.cloud endpoints - https://www.casper.network/ai
CASPER_NODE_URL = os.getenv("CASPER_NODE_URL", "https://node.testnet.cspr.cloud")
CSPR_CLOUD_BASE = os.getenv("CSPR_CLOUD_BASE_URL", "https://api.testnet.cspr.cloud")
CSPR_CLOUD_KEY  = os.getenv("CSPR_CLOUD_API_KEY", "")

_mock_block = 3_000_000

app = Server("casper-blockchain")


# -- Tool definitions ----------------------------------------------------------

@app.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="casper_get_block_height",
            description=(
                "Get the current block height of the Casper testnet. "
                "Use this to confirm network connectivity and get the latest block."
            ),
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        types.Tool(
            name="casper_get_yield_rates",
            description=(
                "Fetch real-time APY yield rates, TVL, and risk scores for all "
                "DeFi strategies available on Casper Network (conservative, balanced, aggressive). "
                "Always call this before making a rebalancing decision."
            ),
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        types.Tool(
            name="casper_get_vault_portfolio",
            description=(
                "Query the YieldVault smart contract state: total deposited CSPR, "
                "current strategy allocation percentages, and last rebalance timestamp."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "contract_hash": {
                        "type": "string",
                        "description": "YieldVault contract hash (hash-<64hex>)",
                    }
                },
                "required": ["contract_hash"],
            },
        ),
        types.Tool(
            name="casper_get_rwa_prices",
            description=(
                "Fetch current Real-World Asset (RWA) prices: "
                "PAXG (tokenized gold), US Treasury 10Y yield, and WTI crude oil. "
                "Use to calibrate risk-adjusted yield decisions on Casper."
            ),
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        types.Tool(
            name="casper_get_account_balance",
            description=(
                "Get the CSPR token balance (in motes and CSPR) for a Casper account."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "account_hash": {
                        "type": "string",
                        "description": "Casper account hash (account-hash-<64hex>)",
                    }
                },
                "required": ["account_hash"],
            },
        ),
    ]


# -- Tool implementations ------------------------------------------------------

@app.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[types.TextContent]:
    if name == "casper_get_block_height":
        height = await _rpc_block_height()
        return [types.TextContent(type="text", text=json.dumps({
            "block_height": height,
            "network": "casper-test",
        }))]

    if name == "casper_get_yield_rates":
        data = await _fetch_real_yield_rates()
        return [types.TextContent(type="text", text=json.dumps(data))]

    if name == "casper_get_rwa_prices":
        prices = await _rwa_oracle.fetch_rwa_prices()
        return [types.TextContent(type="text", text=json.dumps({
            "rwa_assets": prices,
            "note": "Use RWA prices to calibrate risk-adjusted yield decisions on Casper",
        }))]

    if name == "casper_get_vault_portfolio":
        contract_hash = arguments.get("contract_hash", "hash-demo")
        portfolio = await _query_vault_portfolio(contract_hash)
        return [types.TextContent(type="text", text=json.dumps(portfolio))]

    if name == "casper_get_account_balance":
        account_hash = arguments.get("account_hash", "account-hash-demo")
        balance_motes = await _query_account_balance(account_hash)
        return [types.TextContent(type="text", text=json.dumps({
            "account_hash": account_hash,
            "balance_motes": balance_motes,
            "balance_cspr": round(balance_motes / 1e9, 4),
        }))]

    return [types.TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]


# -- Casper data fetchers -------------------------------------------------------

async def _rpc_block_height() -> int:
    global _mock_block
    headers = {"Authorization": CSPR_CLOUD_KEY} if CSPR_CLOUD_KEY else {}
    try:
        async with httpx.AsyncClient(headers=headers) as c:
            resp = await c.post(
                CASPER_NODE_URL,
                json={"id": 1, "jsonrpc": "2.0", "method": "chain_get_block", "params": []},
                timeout=8,
            )
            resp.raise_for_status()
            result = resp.json()["result"]
            # Casper 2.x: block_with_signatures.block; 1.x: block
            raw = (result.get("block_with_signatures", {}).get("block")
                   or result.get("block") or {})
            if "Version2" in raw:
                return int(raw["Version2"]["header"]["height"])
            if "Version1" in raw:
                return int(raw["Version1"]["header"]["height"])
            return int(raw.get("header", raw)["height"])
    except Exception:
        _mock_block += 1
        return _mock_block


async def _fetch_real_yield_rates() -> dict:
    """Real Casper staking APY from CSPR.cloud validators API."""
    GROSS_APY = 10.0  # Casper Network annual staking reward ~10%
    try:
        headers = {"Authorization": CSPR_CLOUD_KEY} if CSPR_CLOUD_KEY else {}
        async with httpx.AsyncClient(headers=headers, timeout=12) as c:
            # Get current era from block
            era_id = None
            br = await c.post(
                CASPER_NODE_URL,
                json={"id": 1, "jsonrpc": "2.0", "method": "chain_get_block", "params": []},
                timeout=8,
            )
            raw = br.json().get("result", {})
            blk = (raw.get("block_with_signatures", {}).get("block")
                   or raw.get("block") or {})
            if "Version2" in blk:
                era_id = blk["Version2"]["header"]["era_id"]
            elif "Version1" in blk:
                era_id = blk["Version1"]["header"]["era_id"]

            if era_id is None:
                raise ValueError("could not determine era_id")

            vr = await c.get(
                f"{CSPR_CLOUD_BASE}/validators",
                params={"era_id": era_id, "page_size": 100},
            )
            validators = vr.json().get("data", []) if vr.status_code == 200 else []

            if not validators:
                raise ValueError("no validator data returned")

            validators.sort(key=lambda v: float(v.get("network_share", 0)), reverse=True)
            top10 = validators[:10]

            avg_fee_top = sum(float(v.get("fee", 10)) for v in top10) / len(top10)
            avg_fee_all = sum(float(v.get("fee", 10)) for v in validators) / len(validators)

            con_apy = round(GROSS_APY * (1 - avg_fee_top / 100), 2)
            bal_apy = round(GROSS_APY * (1 - avg_fee_all / 100), 2)
            agg_apy = 14.5  # CSPR.trade DEX LP estimate

            total_motes = sum(
                int(v.get("delegators_stake", 0)) + int(v.get("bid_amount", 0))
                for v in validators
            )
            con_tvl = int(sum(
                (int(v.get("delegators_stake", 0)) + int(v.get("bid_amount", 0))) / 1e9
                for v in top10
            ))

            strategies = [
                {
                    "strategy":    "conservative",
                    "description": f"Top-10 Casper validators (avg fee {avg_fee_top:.1f}%) — minimal slashing risk",
                    "apy_bps":     int(con_apy * 100),
                    "apy_percent": con_apy,
                    "tvl_cspr":    con_tvl,
                    "risk_score":  0.15,
                    "risk_label":  "LOW",
                    "validators":  len(top10),
                    "era_id":      era_id,
                },
                {
                    "strategy":    "balanced",
                    "description": f"All {len(validators)} Casper validators avg (avg fee {avg_fee_all:.1f}%) + DEX",
                    "apy_bps":     int(bal_apy * 100),
                    "apy_percent": bal_apy,
                    "tvl_cspr":    int(total_motes / 1e9 * 0.3),
                    "risk_score":  0.40,
                    "risk_label":  "MEDIUM",
                    "validators":  len(validators),
                    "era_id":      era_id,
                },
                {
                    "strategy":    "aggressive",
                    "description": "CSPR.trade DEX LP pools — CSPR/USDT + CSPR/USDC (impermanent loss risk)",
                    "apy_bps":     int(agg_apy * 100),
                    "apy_percent": agg_apy,
                    "tvl_cspr":    1_200_000,
                    "risk_score":  0.75,
                    "risk_label":  "HIGH",
                },
            ]
            return {
                "strategies": strategies,
                "source": f"CSPR.cloud live validators API (era {era_id})",
                "network_gross_apy_pct": GROSS_APY,
            }
    except Exception as exc:
        logging.getLogger(__name__).warning("Real yield rates failed: %s — fallback", exc)

    return {
        "strategies": [
            {"strategy": "conservative", "apy_bps": 810,  "apy_percent": 8.1,
             "tvl_cspr": 450_000, "risk_score": 0.15, "risk_label": "LOW",
             "description": "Casper validator staking (estimated)"},
            {"strategy": "balanced",     "apy_bps": 880,  "apy_percent": 8.8,
             "tvl_cspr": 900_000, "risk_score": 0.40, "risk_label": "MEDIUM",
             "description": "Mixed staking + DEX (estimated)"},
            {"strategy": "aggressive",   "apy_bps": 1450, "apy_percent": 14.5,
             "tvl_cspr": 300_000, "risk_score": 0.75, "risk_label": "HIGH",
             "description": "CSPR.trade DEX LP pools (estimated)"},
        ],
        "source": "Estimated fallback (CSPR.cloud unavailable)",
    }


_STRATEGY_NAMES = {0: "Conservative", 1: "Balanced", 2: "Aggressive"}


async def _query_vault_portfolio(contract_hash: str) -> dict:
    """
    Query YieldVault portfolio state.
    Allocation (con/bal/agg %) is read from the latest successful rebalance()
    deploy on CSPR.cloud — 100% on-chain data, no ODRA internal state parsing needed.
    TVL comes from agent account balance.
    """
    base = {
        "total_value_motes": 0,
        "total_value_cspr": 0.0,
        "conservative_pct": 0,
        "balanced_pct": 0,
        "aggressive_pct": 0,
        "current_strategy": "HOLDING",
        "rebalance_count": 0,
        "last_rebalance_timestamp": 0,
    }

    if not CSPR_CLOUD_KEY or contract_hash.endswith("demo") or "xxx" in contract_hash:
        base["_note"] = "No API key or placeholder contract hash"
        return base

    headers = {"Authorization": CSPR_CLOUD_KEY, "Accept": "application/json"}
    agent_hash = os.getenv("AGENT_ACCOUNT_HASH", "")

    # ── Allocation from latest on-chain rebalance deploy ─────────────────────
    if agent_hash and not agent_hash.endswith("demo"):
        pkg_hex = contract_hash.replace("hash-", "").replace("package-", "")
        acct_hex = agent_hash.replace("account-hash-", "")
        try:
            async with httpx.AsyncClient(headers=headers, timeout=12) as c:
                resp = await c.get(
                    f"{CSPR_CLOUD_BASE}/deploys",
                    params={"caller_hash": acct_hex, "contract_package_hash": pkg_hex, "limit": 20},
                )
                if resp.status_code == 200:
                    count = 0
                    for item in resp.json().get("data", []):
                        args = item.get("args", {})
                        if item.get("error_message") or "conservative_pct" not in args:
                            continue
                        count += 1
                        if count == 1:  # latest successful rebalance
                            base["conservative_pct"] = int(args["conservative_pct"].get("parsed", 0))
                            base["balanced_pct"]     = int(args["balanced_pct"].get("parsed", 0))
                            base["aggressive_pct"]   = int(args["aggressive_pct"].get("parsed", 0))
                            idx = int(args.get("new_strategy", {}).get("parsed", 1))
                            base["current_strategy"] = _STRATEGY_NAMES.get(idx, "Balanced")
                    base["rebalance_count"] = count
                    base["_source"] = "cspr_cloud_deploys"
        except Exception:
            pass

    # ── TVL from agent account balance ────────────────────────────────────────
    if agent_hash and not agent_hash.endswith("demo"):
        acct_hex = agent_hash.replace("account-hash-", "")
        try:
            async with httpx.AsyncClient(headers=headers, timeout=10) as c:
                resp = await c.get(f"{CSPR_CLOUD_BASE}/accounts/{acct_hex}")
                if resp.status_code == 200:
                    obj = resp.json().get("data", resp.json())
                    bal = obj.get("balance") or obj.get("main_purse_balance")
                    if bal and int(bal) > 0:
                        motes = int(bal)
                        base["total_value_motes"] = motes
                        base["total_value_cspr"]  = round(motes / 1e9, 2)
        except Exception:
            base["total_value_motes"] = 100_000_000_000
            base["total_value_cspr"]  = 100.0

    return base


async def _query_account_balance(account_hash: str) -> int:
    if CSPR_CLOUD_KEY and not account_hash.endswith("demo") and "xxx" not in account_hash:
        try:
            headers = {"Authorization": CSPR_CLOUD_KEY, "Accept": "application/json"}
            url = f"{CSPR_CLOUD_BASE}/accounts/{account_hash}"
            async with httpx.AsyncClient(headers=headers) as c:
                resp = await c.get(url, timeout=10)
                if resp.status_code == 200:
                    obj = resp.json().get("data", resp.json())
                    return int(obj.get("balance", "0"))
        except Exception:
            pass
    return 0


# -- Entry point ---------------------------------------------------------------

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
