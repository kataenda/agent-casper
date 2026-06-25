"""
CSPR.trade MCP client — real, non-custodial DeFi on Casper mainnet.

This is the execution counterpart to the read-only DEX data the decision engine
already consults. It speaks the official CSPR.trade MCP server (Streamable HTTP,
https://mcp.cspr.trade/mcp, no API key) and drives the non-custodial swap flow:

    build_swap (remote)  →  sign locally with the agent key  →  submit_transaction (remote)

Non-custodial means the MCP never holds funds: `build_swap` returns an *unsigned*
Casper deploy; the agent signs it with its own ed25519 key (the same key used for
x402 proofs and on-chain rebalances) and submits it. The signature is produced over
the deploy hash and attached as a standard Casper approval — no fragile re-parsing
of the deploy body required.

Guardrails (price-impact cap, amount cap, explicit execute flag) keep autonomous
fund movement bounded. `execute=False` (the default) returns the real quote + the
signed deploy without broadcasting it.

Spec/tools: https://mcp.cspr.trade/SKILL.md  ·  repo: make-software/cspr-trade-mcp
"""

import json
import logging
import pathlib
import re
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

CSPR_TRADE_MCP_URL = "https://mcp.cspr.trade/mcp"
MCP_PROTOCOL = "2025-06-18"
# Public Casper mainnet RPC — used to broadcast the signed deploy directly. Swap
# deploys are large (~100KB) and exceed the MCP submit_transaction body limit
# (HTTP 413), so we put the deploy straight to a node and only fall back to MCP.
MAINNET_NODE_RPC = "https://rpc.mainnet.casperlabs.io/rpc"

# Safety defaults for autonomous execution.
DEFAULT_MAX_PRICE_IMPACT_PCT = 2.0     # abort a swap whose price impact exceeds this
DEFAULT_MAX_AMOUNT_CSPR = 25.0         # hard cap on input size per swap
DEFAULT_SLIPPAGE_BPS = 300             # 3%


class CsprTradeError(RuntimeError):
    pass


class CsprTradeMCP:
    """Minimal async MCP (Streamable HTTP) client for CSPR.trade + a guarded swap()."""

    def __init__(
        self,
        agent_key_path: str = "",
        agent_public_key: str = "",
        mcp_url: str = CSPR_TRADE_MCP_URL,
        max_price_impact_pct: float = DEFAULT_MAX_PRICE_IMPACT_PCT,
        max_amount_cspr: float = DEFAULT_MAX_AMOUNT_CSPR,
        node_rpc: str = MAINNET_NODE_RPC,
        node_auth: str = "",
    ):
        self.mcp_url = mcp_url
        self.agent_key_path = agent_key_path
        self.agent_public_key = agent_public_key
        self.max_price_impact_pct = max_price_impact_pct
        self.max_amount_cspr = max_amount_cspr
        self.node_rpc = node_rpc
        self.node_auth = node_auth

    # ── MCP transport ────────────────────────────────────────────────────────

    @staticmethod
    def _parse_sse(text: str) -> dict:
        """A tools/call response is a single SSE `data:` line of JSON-RPC."""
        for line in text.splitlines():
            if line.startswith("data:"):
                return json.loads(line[5:].strip())
        return json.loads(text)

    async def _open_session(self, client: httpx.AsyncClient) -> dict:
        """initialize + notifications/initialized → returns headers carrying the session id."""
        headers = {"Content-Type": "application/json",
                   "Accept": "application/json, text/event-stream"}
        r = await client.post(self.mcp_url, headers=headers, json={
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": MCP_PROTOCOL, "capabilities": {},
                       "clientInfo": {"name": "agent-casper", "version": "1.0"}},
        })
        if r.status_code != 200:
            raise CsprTradeError(f"MCP initialize HTTP {r.status_code}: {r.text[:120]}")
        sid = r.headers.get("mcp-session-id")
        if not sid:
            raise CsprTradeError("CSPR.trade MCP did not return a session id")
        headers["mcp-session-id"] = sid
        await client.post(self.mcp_url, headers=headers,
                          json={"jsonrpc": "2.0", "method": "notifications/initialized"})
        return headers

    async def _call(self, tool: str, args: dict) -> list:
        """Call one MCP tool; returns the list of result content blocks (parsed JSON or text)."""
        async with httpx.AsyncClient(timeout=40) as client:
            headers = await self._open_session(client)
            r = await client.post(self.mcp_url, headers=headers, json={
                "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {"name": tool, "arguments": args},
            })
            if r.status_code != 200:
                raise CsprTradeError(f"{tool}: MCP HTTP {r.status_code} {r.text[:120]}")
            try:
                data = self._parse_sse(r.text)
            except Exception as exc:
                raise CsprTradeError(f"{tool}: bad MCP response: {exc}")
            if "error" in data:
                raise CsprTradeError(f"{tool}: {data['error'].get('message', data['error'])}")
            res = data.get("result", {})
            out = []
            for blk in res.get("content", []):
                t = blk.get("text", "")
                try:
                    out.append(json.loads(t))
                except Exception:
                    out.append(t)
            if res.get("isError"):
                raise CsprTradeError(f"{tool}: {out[0] if out else 'tool error'}")
            return out

    # ── Read-only tools (no wallet, no risk) ──────────────────────────────────

    async def get_quote(self, token_in: str, token_out: str, amount: str,
                        type_: str = "exact_in") -> dict:
        out = await self._call("get_quote", {
            "token_in": token_in, "token_out": token_out,
            "amount": amount, "type": type_,
        })
        first = out[0] if out else {}
        return first if isinstance(first, dict) else {"summary": str(first)}

    async def get_pairs(self) -> list:
        out = await self._call("get_pairs", {})
        d = out[0] if out else {}
        return d.get("data", d) if isinstance(d, dict) else d

    async def get_native_cspr_balance(self, public_key: str) -> dict:
        out = await self._call("get_native_cspr_balance", {"account_public_key": public_key})
        return out[0] if out else {}

    # ── Swap building summary parsing ─────────────────────────────────────────

    @staticmethod
    def _extract_deploy(build_text: str) -> dict:
        """build_swap returns a human summary followed by the raw deploy JSON."""
        # The deploy JSON is the last {...} blob in the text.
        start = build_text.find('{"hash"')
        if start == -1:
            start = build_text.find("{")
        if start == -1:
            raise CsprTradeError("no deploy JSON found in build_swap output")
        # The deploy JSON may be followed by extra text — decode just the first object.
        deploy, _ = json.JSONDecoder().raw_decode(build_text[start:])
        if "hash" not in deploy:
            raise CsprTradeError("build_swap deploy JSON missing 'hash'")
        return deploy

    @staticmethod
    def _parse_summary(text: str) -> dict:
        """Pull the human-readable numbers out of the build_swap summary."""
        def grab(pat):
            m = re.search(pat, text)
            return m.group(1) if m else None
        return {
            "out_estimate": grab(r"for\s*~?([\d.]+)\s"),
            "price_impact_pct": float(grab(r"[Pp]rice impact:\s*([\d.]+)%") or 0.0),
            "max_slippage_pct": float(grab(r"[Mm]ax slippage:\s*([\d.]+)%") or 0.0),
            "estimated_gas_cspr": float(grab(r"[Ee]stimated gas:\s*([\d.]+)") or 0.0),
        }

    # ── Local signing (non-custodial) ─────────────────────────────────────────

    def _sign_deploy(self, deploy: dict) -> dict:
        """Sign the deploy hash with the agent's ed25519 key and attach a Casper approval."""
        import pycspr
        kp = pycspr.parse_private_key(pathlib.Path(self.agent_key_path))
        sig = kp.get_signature(bytes.fromhex(deploy["hash"]))  # raw 64-byte ed25519
        approval = {"signer": kp.account_key.hex(),            # already 01-tagged
                    "signature": "01" + sig.hex()}             # 01 = ed25519 algo tag
        signed = dict(deploy)
        signed["approvals"] = [approval]
        return signed

    async def _submit_via_node(self, signed_deploy: dict) -> str:
        """Broadcast the signed deploy straight to a Casper mainnet node (account_put_deploy)."""
        headers = {"Content-Type": "application/json"}
        if self.node_auth:
            headers["Authorization"] = self.node_auth
        async with httpx.AsyncClient(timeout=40) as client:
            resp = await client.post(self.node_rpc, headers=headers,
                                     json={"id": 1, "jsonrpc": "2.0", "method": "account_put_deploy",
                                           "params": {"deploy": signed_deploy}})
            if resp.status_code != 200:
                raise CsprTradeError(f"node HTTP {resp.status_code}: {resp.text[:160]}")
            data = resp.json()
            if "error" in data:
                raise CsprTradeError(f"node: {data['error'].get('message', data['error'])}")
            h = data.get("result", {}).get("deploy_hash")
            if not h:
                raise CsprTradeError(f"node: no deploy_hash ({str(data)[:140]})")
            return h

    async def submit_transaction(self, signed_deploy: dict) -> dict:
        """Broadcast: direct mainnet node first (handles ~100KB swap deploys that
        413 on the MCP), MCP submit_transaction as fallback."""
        try:
            return {"deploy_hash": await self._submit_via_node(signed_deploy), "via": "node"}
        except Exception as node_exc:
            node_err = str(node_exc)[:200]
            logger.info("direct-node submit failed (%s) — trying MCP", node_err)
        try:
            out = await self._call("submit_transaction",
                                   {"signed_deploy_json": json.dumps(signed_deploy)})
            res = out[0] if out else {}
            if isinstance(res, dict):
                res.setdefault("via", "mcp")
                return res
            return {"result": str(res), "via": "mcp"}
        except Exception as mcp_exc:
            # Surface BOTH failures so the real cause (usually the node) is visible.
            raise CsprTradeError(f"node submit failed [{node_err}]; MCP fallback failed "
                                 f"[{str(mcp_exc)[:120]}]")

    # ── High-level guarded swap ────────────────────────────────────────────────

    async def swap(
        self,
        token_in: str,
        token_out: str,
        amount: str,
        slippage_bps: int = DEFAULT_SLIPPAGE_BPS,
        execute: bool = False,
    ) -> dict:
        """
        Build (and optionally execute) a real non-custodial swap on CSPR.trade mainnet.

        execute=False  → returns the real quote + signed deploy, WITHOUT broadcasting.
        execute=True   → also submits the signed deploy on-chain (spends real CSPR).

        Guardrails: input amount ≤ max_amount_cspr, price impact ≤ max_price_impact_pct.
        """
        record: dict = {
            "network": "casper:casper",
            "token_in": token_in, "token_out": token_out, "amount": amount,
            "executed": False, "tx_hash": None, "settlement": "built_only",
        }

        # Guardrail 1: amount cap (only enforced for CSPR-denominated input)
        try:
            amt = float(amount)
        except ValueError:
            raise CsprTradeError(f"invalid amount: {amount!r}")
        if token_in.upper() == "CSPR" and amt > self.max_amount_cspr:
            raise CsprTradeError(
                f"amount {amt} CSPR exceeds safety cap {self.max_amount_cspr} CSPR")

        # Build the real unsigned deploy
        build_out = await self._call("build_swap", {
            "token_in": token_in, "token_out": token_out, "amount": amount,
            "type": "exact_in", "slippage_bps": slippage_bps,
            "sender_public_key": self.agent_public_key,
        })
        build_text = next((b for b in build_out if isinstance(b, str)), None)
        if not build_text:
            # some servers return structured content
            build_text = json.dumps(build_out[0]) if build_out else ""
        summary = self._parse_summary(build_text)
        deploy = self._extract_deploy(build_text)
        record.update(summary=summary, deploy_hash=deploy.get("hash"))

        # Guardrail 2: price-impact cap
        if summary["price_impact_pct"] > self.max_price_impact_pct:
            record["settlement"] = "rejected_price_impact"
            record["note"] = (f"price impact {summary['price_impact_pct']}% exceeds cap "
                              f"{self.max_price_impact_pct}% — not executed")
            return record

        # Sign locally (non-custodial)
        if not pathlib.Path(self.agent_key_path).is_file():
            record["note"] = "agent key not available — built + quoted only"
            return record
        try:
            signed = self._sign_deploy(deploy)
        except Exception as exc:
            record.update(settlement="sign_failed", note=f"signing failed: {exc}")
            return record
        record["signed"] = True

        if not execute:
            record["note"] = "dry run — signed deploy built but not broadcast (execute=false)"
            return record

        # Broadcast (spends real CSPR on mainnet). Never raise — report the reason.
        try:
            sub = await self.submit_transaction(signed)
            tx = (sub.get("deploy_hash") or sub.get("transaction_hash")
                  or sub.get("hash") or deploy.get("hash"))
            record.update(executed=True, tx_hash=tx, settlement="submitted",
                          explorer_url=f"https://cspr.live/deploy/{tx}" if tx else None,
                          submit_result=sub)
        except Exception as exc:
            record.update(settlement="submit_failed", note=str(exc)[:300])
        return record
