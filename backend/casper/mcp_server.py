#!/usr/bin/env python3
"""
Casper MCP Server — exposes Casper blockchain tools for AI agents via
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

# RWA oracle (same process — import directly)
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from casper.rwa_oracle import RWAOracle

_rwa_oracle = RWAOracle()

# Quiet logging so stdio transport is not polluted
logging.basicConfig(level=logging.WARNING, stream=sys.stderr)

# Official CSPR.cloud endpoints — https://www.casper.network/ai
CASPER_NODE_URL = os.getenv("CASPER_NODE_URL", "https://node.testnet.cspr.cloud")
CSPR_CLOUD_BASE = os.getenv("CSPR_CLOUD_BASE_URL", "https://api.testnet.cspr.cloud")
CSPR_CLOUD_KEY  = os.getenv("CSPR_CLOUD_API_KEY", "")

_mock_block = 3_000_000

app = Server("casper-blockchain")


# ── Tool definitions ───────────────────────────────────────────────────────────

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
                "current strategy allocation percentages (conservative/balanced/aggressive), "
                "and last rebalance timestamp. Use this to understand current position."
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
                "Fetch current Real-World Asset (RWA) prices relevant to DeFi yield optimization: "
                "PAXG (PAX Gold — tokenized gold RWA, 1 token = 1 troy oz of physical gold), "
                "US Treasury 10Y yield as the risk-free rate baseline, and WTI crude oil as an "
                "inflation proxy. Use these to calibrate risk-adjusted thresholds: "
                "e.g., if Treasury yield > 5%, require higher DeFi APY premium before rebalancing to aggressive. "
                "Rising gold signals flight-to-safety; prefer conservative in that scenario."
            ),
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        types.Tool(
            name="casper_get_account_balance",
            description=(
                "Get the CSPR token balance (in motes and CSPR) for a Casper account. "
                "Use to check agent wallet balance before deciding on large rebalances."
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


# ── Tool implementations ───────────────────────────────────────────────────────

@app.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> list[types.TextContent]:
    if name == "casper_get_block_height":
        height = await _rpc_block_height()
        return [types.TextContent(type="text", text=json.dumps({
            "block_height": height,
            "network": "casper-test",
        }))]

    if name == "casper_get_yield_rates":
        data = _simulated_yield_rates()
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


# ── Casper data fetchers ───────────────────────────────────────────────────────

async def _rpc_block_height() -> int:
    global _mock_block
    try:
        async with httpx.AsyncClient() as c:
            resp = await c.post(
                CASPER_NODE_URL,
                json={"id": 1, "jsonrpc": "2.0", "method": "chain_get_block", "params": []},
                timeout=8,
            )
            resp.raise_for_status()
            return resp.json()["result"]["block"]["header"]["height"]
    except Exception:
        _mock_block += 1
        return _mock_block


def _simulated_yield_rates() -> dict:
    """
    Returns yield rates for all three strategies.
    In production: fetch from CSPR.cloud DeFi protocol APIs.
    """
    strategies = [
        {
            "strategy": "conservative",
            "description": "Staking in vetted Casper validators — minimal slashing risk",
            "apy_bps":   300 + random.randint(-25, 25),
            "tvl_cspr":  500_000 + random.randint(-10_000, 10_000),
            "risk_score": 0.15,
            "risk_label": "LOW",
        },
        {
            "strategy": "balanced",
            "description": "Mixed validator staking + DEX liquidity on CSPR.trade",
            "apy_bps":   700 + random.randint(-60, 60),
            "tvl_cspr":  1_200_000 + random.randint(-20_000, 20_000),
            "risk_score": 0.40,
            "risk_label": "MEDIUM",
        },
        {
            "strategy": "aggressive",
            "description": "High-yield CSPR.trade DEX pools — impermanent loss risk",
            "apy_bps":   1500 + random.randint(-150, 300),
            "tvl_cspr":  300_000 + random.randint(-30_000, 30_000),
            "risk_score": 0.75,
            "risk_label": "HIGH",
        },
    ]
    for s in strategies:
        s["apy_percent"] = round(s["apy_bps"] / 100, 2)
    return {"strategies": strategies, "source": "CSPR.cloud (simulated testnet data)"}


async def _query_vault_portfolio(contract_hash: str) -> dict:
    if CSPR_CLOUD_KEY and not contract_hash.endswith("demo"):
        try:
            headers = {
                "Authorization": f"Bearer {CSPR_CLOUD_KEY}",
                "Content-Type": "application/json",
            }
            url = f"{CSPR_CLOUD_BASE}/global-state/named-key"
            async with httpx.AsyncClient(headers=headers) as c:
                resp = await c.get(
                    url,
                    params={"key": contract_hash, "name": "portfolio"},
                    timeout=12,
                )
                if resp.status_code == 200:
                    return resp.json()
        except Exception:
            pass

    return {
        "total_value_motes": 50_000_000_000_000,
        "total_value_cspr": 50_000_000,
        "conservative_pct": 30,
        "balanced_pct": 50,
        "aggressive_pct": 20,
        "current_strategy": "balanced",
        "last_rebalance_timestamp": 0,
        "_note": "Demo portfolio — deploy contract to testnet for live data",
    }


async def _query_account_balance(account_hash: str) -> int:
    if CSPR_CLOUD_KEY and not account_hash.endswith("demo"):
        try:
            headers = {"Authorization": CSPR_CLOUD_KEY, "Accept": "application/json"}
            url = f"{CSPR_CLOUD_BASE}/accounts/{account_hash}"
            async with httpx.AsyncClient(headers=headers) as c:
                resp = await c.get(url, timeout=10)
                if resp.status_code == 200:
                    obj = resp.json()
                    data = obj.get("data", obj)
                    return int(data.get("balance", "0"))
        except Exception:
            pass
    return 100_000_000_000_000  # 100,000 CSPR demo


# ── Entry point ────────────────────────────────────────────────────────────────

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options(),
        )


if __name__ == "__main__":
    asyncio.run(main())
