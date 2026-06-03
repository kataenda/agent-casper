"""
Decision Engine — Claude AI with Casper MCP tools for autonomous yield analysis.

Architecture:
  1. Spawns the Casper MCP server as a subprocess (stdio transport)
  2. Discovers available blockchain tools (get_yield_rates, get_portfolio, ...)
  3. Runs an agentic loop: Claude calls MCP tools autonomously to gather data
  4. Claude calls `rebalance_decision` tool when ready with its final decision

This is genuinely agentic: Claude decides WHAT blockchain data to query,
not just receiving pre-bundled context.
"""

import json
import logging
import os
import pathlib
import sys
from typing import Any

import anthropic
try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    MCP_AVAILABLE = True
except Exception:
    MCP_AVAILABLE = False
    class ClientSession:  # placeholder
        pass
    class StdioServerParameters:  # placeholder
        pass
    async def stdio_client(*args, **kwargs):
        raise RuntimeError("MCP not available")

# Official CSPR.trade MCP Server — DEX data, swaps, liquidity (https://mcp.cspr.trade)
CSPR_TRADE_MCP_URL = "https://mcp.cspr.trade"
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Absolute path to the MCP server script
MCP_SERVER_PATH = str(
    pathlib.Path(__file__).parent.parent / "casper" / "mcp_server.py"
)

MAX_TOOL_ROUNDS = 6

# CSPR.trade DEX tool injected into Claude's tool list (HTTP MCP — no subprocess needed)
CSPR_TRADE_DEX_TOOL: dict = {
    "name": "cspr_trade_get_dex_rates",
    "description": (
        "Fetch live DEX token swap rates, liquidity pool APY, and trading volume "
        "from CSPR.trade (https://mcp.cspr.trade) — the primary Casper DEX. "
        "Use this for the 'aggressive' strategy data: LP pool yields are higher risk "
        "but potentially higher reward than validator staking. "
        "Compare against casper_get_yield_rates conservative/balanced to inform allocation."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "pair": {
                "type": "string",
                "description": "Token pair to query (e.g. 'CSPR/USDT'). Leave empty for top pools.",
                "default": "",
            }
        },
        "required": [],
    },
}


# ── Output schema ──────────────────────────────────────────────────────────────

class RebalanceDecision(BaseModel):
    action: str               # "HOLD" | "REBALANCE" | "ALERT"
    new_strategy: str | None  # "conservative" | "balanced" | "aggressive"
    conservative_pct: int
    balanced_pct: int
    aggressive_pct: int
    reasoning: str
    confidence: float         # 0.0 – 1.0
    risk_level: str           # "LOW" | "MEDIUM" | "HIGH"


# ── Prompts ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are CasperYield AI — an autonomous DeFi portfolio management agent
on the Casper blockchain. Your mission: maximize risk-adjusted yield for depositors while
integrating Real-World Asset (RWA) market signals into your decisions.

## Casper AI Toolkit Resources (https://www.casper.network/ai)
- CSPR.cloud APIs: https://docs.cspr.cloud — enterprise-grade blockchain middleware
- CSPR.trade MCP: https://mcp.cspr.trade — DEX trading and liquidity data
- Odra Framework: https://odra.dev/llms.txt — AI-discoverable smart contract docs
- x402 Protocol: payment proof in every API call header

You have access to live Casper blockchain tools AND a Real-World Asset oracle. Use them
to gather the data you need, then call rebalance_decision with your final analysis.

Decision rules:
- HOLD:      current allocation is near-optimal (Sharpe improvement < 10%)
- REBALANCE: a clearly better risk-adjusted allocation exists
- ALERT:     anomalous conditions (APY spike >50%, TVL drop >30%, risk surge)

RWA integration guidelines (call casper_get_rwa_prices for current data):
- PAXG (gold) rising >1% → flight-to-safety signal → favor conservative allocation
- US Treasury 10Y yield > 5.0% → demand DeFi yield premium of ≥3× Treasury rate
- US Treasury 10Y yield < 3.5% → DeFi yield attractive → balanced/aggressive acceptable
- WTI oil surging → inflation risk → raise risk threshold for aggressive positions

Always call casper_get_rwa_prices AND casper_get_yield_rates before deciding.
Be conservative — unnecessary rebalancing incurs gas costs.
Your reasoning will be stored on-chain for transparency."""

REBALANCE_TOOL: dict[str, Any] = {
    "name": "rebalance_decision",
    "description": (
        "Submit your final portfolio rebalancing decision after analyzing "
        "current yield rates and portfolio state via the Casper tools."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["HOLD", "REBALANCE", "ALERT"],
                "description": "Portfolio action to take",
            },
            "new_strategy": {
                "type": ["string", "null"],
                "enum": ["conservative", "balanced", "aggressive", None],
            },
            "conservative_pct": {"type": "integer", "minimum": 0, "maximum": 100},
            "balanced_pct":     {"type": "integer", "minimum": 0, "maximum": 100},
            "aggressive_pct":   {"type": "integer", "minimum": 0, "maximum": 100},
            "reasoning": {
                "type": "string",
                "description": "Clear explanation stored on-chain for transparency",
            },
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "risk_level": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH"]},
        },
        "required": [
            "action", "conservative_pct", "balanced_pct", "aggressive_pct",
            "reasoning", "confidence", "risk_level",
        ],
    },
}


# ── Engine ─────────────────────────────────────────────────────────────────────

class DecisionEngine:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6"):
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model  = model

    async def analyze(
        self,
        vault_contract_hash: str,
        agent_account_hash: str,
        rebalance_count_today: int,
        max_rebalances_per_day: int,
    ) -> RebalanceDecision:
        """
        Spawn Casper MCP server, give Claude blockchain tools,
        run agentic loop until Claude submits rebalance_decision.
        """
        if not MCP_AVAILABLE:
            logger.warning("MCP package not installed — running in demo fallback mode.")
            return self._demo_hold()

        server_params = StdioServerParameters(
            command=sys.executable,
            args=[MCP_SERVER_PATH],
            env={
                **os.environ,
                "VAULT_CONTRACT_HASH": vault_contract_hash,
                "AGENT_ACCOUNT_HASH":  agent_account_hash,
            },
        )

        try:
            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    return await self._agentic_loop(
                        session=session,
                        vault_contract_hash=vault_contract_hash,
                        agent_account_hash=agent_account_hash,
                        rebalance_count_today=rebalance_count_today,
                        max_rebalances_per_day=max_rebalances_per_day,
                    )
        except anthropic.AuthenticationError:
            logger.warning("Invalid ANTHROPIC_API_KEY — returning demo HOLD. Set a real key for live AI decisions.")
            return self._demo_hold()
        except Exception as exc:
            logger.warning("MCP/Claude error (%s: %s) — returning demo HOLD.", type(exc).__name__, exc)
            return self._demo_hold()

    async def _agentic_loop(
        self,
        session: ClientSession,
        vault_contract_hash: str,
        agent_account_hash: str,
        rebalance_count_today: int,
        max_rebalances_per_day: int,
    ) -> RebalanceDecision:
        # Discover tools from local Casper MCP server (stdio subprocess)
        mcp_tools_result = await session.list_tools()
        mcp_tools = [
            {
                "name":         t.name,
                "description":  t.description or "",
                "input_schema": t.inputSchema or {"type": "object", "properties": {}},
            }
            for t in mcp_tools_result.tools
        ]
        # Add CSPR.trade MCP tool (official Casper AI Toolkit DEX data)
        all_tools = mcp_tools + [CSPR_TRADE_DEX_TOOL, REBALANCE_TOOL]

        logger.info(
            "MCP session ready — %d Casper tools available: %s",
            len(mcp_tools),
            [t["name"] for t in mcp_tools],
        )

        # Initial user message — lean prompt, Claude gathers data autonomously
        user_message = (
            f"Analyze the current Casper YieldVault and decide if rebalancing is needed.\n\n"
            f"Vault contract: {vault_contract_hash}\n"
            f"Agent account:  {agent_account_hash}\n"
            f"Rebalances today: {rebalance_count_today} / {max_rebalances_per_day} remaining\n\n"
            f"Use your tools to query current portfolio state and yield rates, "
            f"then call rebalance_decision with your analysis."
        )

        messages: list[dict] = [{"role": "user", "content": user_message}]

        # Agentic loop — Claude calls tools until it calls rebalance_decision
        for round_num in range(MAX_TOOL_ROUNDS):
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                tools=all_tools,
                messages=messages,
            )

            logger.debug("Round %d — stop_reason: %s", round_num + 1, response.stop_reason)
            messages.append({"role": "assistant", "content": response.content})

            if response.stop_reason != "tool_use":
                # Claude finished without calling rebalance_decision
                break

            tool_results: list[dict] = []
            for block in response.content:
                if block.type != "tool_use":
                    continue

                # Claude submitting final decision
                if block.name == "rebalance_decision":
                    logger.info(
                        "Claude decision after %d MCP tool rounds: %s",
                        round_num + 1,
                        block.input.get("action"),
                    )
                    return RebalanceDecision(**block.input)

                # Claude calling a tool
                logger.info("Claude calling tool: %s(%s)", block.name, block.input)
                try:
                    if block.name == "cspr_trade_get_dex_rates":
                        # CSPR.trade MCP — official Casper DEX data (https://mcp.cspr.trade)
                        content = await self._call_cspr_trade(block.input or {})
                    else:
                        result = await session.call_tool(block.name, block.input or {})
                        content = result.content[0].text if result.content else "{}"
                except Exception as exc:
                    content = json.dumps({"error": str(exc)})
                    logger.warning("Tool %s failed: %s", block.name, exc)

                tool_results.append({
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     content,
                })

            if tool_results:
                messages.append({"role": "user", "content": tool_results})

        logger.warning("Agentic loop ended without rebalance_decision — returning HOLD")
        return self._demo_hold()

    @staticmethod
    async def _call_cspr_trade(arguments: dict) -> str:
        """
        Calls the official CSPR.trade MCP server (https://mcp.cspr.trade).
        Streamable HTTP MCP transport — no subprocess needed.
        Falls back to simulated DEX data if the server is unreachable.
        """
        import httpx, random as _r
        pair = arguments.get("pair", "")
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.post(
                    f"{CSPR_TRADE_MCP_URL}/mcp",
                    json={
                        "jsonrpc": "2.0", "id": 1,
                        "method": "tools/call",
                        "params": {
                            "name": "get_pool_rates",
                            "arguments": {"pair": pair} if pair else {},
                        },
                    },
                    headers={"Content-Type": "application/json"},
                )
                if resp.status_code == 200:
                    result = resp.json()
                    return json.dumps(result.get("result", result))
        except Exception as exc:
            logger.debug("CSPR.trade MCP unreachable: %s — using simulated DEX data", exc)

        # Simulated DEX data when CSPR.trade MCP is unreachable
        return json.dumps({
            "source": "CSPR.trade DEX (simulated — connect to https://mcp.cspr.trade for live data)",
            "pools": [
                {"pair": "CSPR/USDT", "apy_pct": round(12.5 + _r.uniform(-2, 4), 2),
                 "tvl_usd": 850_000, "volume_24h_usd": 120_000, "risk": "HIGH"},
                {"pair": "CSPR/WETH", "apy_pct": round(9.8 + _r.uniform(-1, 3), 2),
                 "tvl_usd": 420_000, "volume_24h_usd": 65_000, "risk": "HIGH"},
                {"pair": "CSPR/USDC", "apy_pct": round(7.2 + _r.uniform(-0.5, 1.5), 2),
                 "tvl_usd": 1_100_000, "volume_24h_usd": 200_000, "risk": "MEDIUM"},
            ],
            "note": "LP pools — impermanent loss risk; higher APY vs validator staking",
        })

    @staticmethod
    def _demo_hold() -> RebalanceDecision:
        return RebalanceDecision(
            action="HOLD",
            new_strategy=None,
            conservative_pct=30,
            balanced_pct=50,
            aggressive_pct=20,
            reasoning=(
                "Demo mode — set a valid ANTHROPIC_API_KEY for live Claude AI decisions "
                "with Casper MCP blockchain queries."
            ),
            confidence=0.0,
            risk_level="LOW",
        )
