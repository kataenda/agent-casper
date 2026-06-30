"""
Agent Casper — FastAPI server
Provides REST API + WebSocket for real-time agent monitoring.
"""

import asyncio
import base64
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

# Ensure we always load .env from the backend/ directory regardless of cwd
os.chdir(Path(__file__).parent)

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from casper.client import CasperClient
from casper.deployer import CasperDeployer
from casper.rwa_oracle import RWAOracle
from casper.x402 import X402Handler, CHAIN_TESTNET, CHAIN_MAINNET
from casper.cspr_trade import CsprTradeMCP, CsprTradeError
from casper import swap_log
from agent.decision_engine import DecisionEngine
from agent.yield_agent import YieldAgent, AgentCycleResult

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)


# ── Settings ──────────────────────────────────────────────────────────────────

class Settings(BaseSettings):
    anthropic_api_key: str = "demo-key"
    casper_node_url: str = "https://rpc.testnet.casperlabs.io/rpc"
    cspr_cloud_api_key: str = ""
    cspr_cloud_base_url: str = "https://event-store-api-clarity-testnet.make.services"
    vault_contract_hash: str = "hash-demo"
    vault_contract_version_hash: str = ""
    agent_account_hash: str = "account-hash-demo"
    # Shared secret protecting state-mutating endpoints (pause/resume/rebalance/
    # swap/deploy/admin-setup). When empty, those endpoints stay open (backward
    # compatible); set ADMIN_TOKEN in the environment to require the X-Admin-Token
    # header on every privileged call. Read-only endpoints are never gated.
    admin_token: str = ""
    agent_secret_key_path: str = "./agent_secret_key.pem"
    # If set, the PEM content is written to a temp file (for cloud deployments like Railway)
    agent_secret_key_content: str = ""
    agent_poll_interval_seconds: int = 60
    max_rebalances_per_day: int = 5
    rwa_onchain_enabled: bool = True
    rwa_post_interval_seconds: int = 3600
    x402_enabled: bool = False
    x402_payment_amount: int = 1_000_000   # token base units (see X402_TOKEN_DECIMALS)
    x402_facilitator_url: str = "https://x402-facilitator.cspr.cloud"
    x402_pay_to: str = ""  # recipient account-hash address ('00'+hash); defaults to the agent
    x402_settle_interval_seconds: int = 3600  # rate-limit on-chain settlement
    # CEP-18 token for the official `exact` scheme (facilitator settles a
    # transfer_with_authorization of this token). Asset = 64-hex contract package hash;
    # name/version form the EIP-712 domain; decimals/symbol are display metadata.
    x402_asset: str = ""
    x402_token_name: str = ""
    x402_token_version: str = "1"
    x402_token_decimals: int = 6
    x402_token_symbol: str = ""
    # Mainnet provider endpoints — other agents PAY this agent for premium data
    # (amounts in token base units).
    x402_decision_price: int = 5_000_000   # AI rebalance recommendation
    x402_rwa_feed_price: int = 2_500_000   # on-chain-verified RWA feed
    # Real DeFi via CSPR.trade MCP (Casper mainnet, non-custodial) — safety caps.
    cspr_trade_max_amount_cspr: float = 25.0
    cspr_trade_max_price_impact_pct: float = 2.0
    # Close the loop: when the AI decides REBALANCE, also execute a small REAL swap
    # on mainnet (decision → on-chain execution). OFF by default — spends real CSPR.
    defi_execute_on_rebalance: bool = False
    defi_swap_amount_cspr: float = 5.0
    defi_swap_token_in: str = "CSPR"
    defi_swap_token_out: str = "sCSPR"
    defi_max_swaps_per_day: int = 1
    # Economic discipline — only swap when the reallocation is materially worth it.
    # Drift gate: current allocation must be off the AI's target by at least this
    # many percentage points. Net-gain gate: estimated annualized portfolio APY
    # uplift must clear this many bps. Prevents churn on marginal/noise decisions.
    # (HIGH-risk de-risk moves bypass the net-gain gate — capital preservation.)
    defi_min_drift_pct: float = 10.0
    defi_min_net_gain_bps: int = 50
    # Mainnet node used to broadcast swap deploys (they're too large for the MCP).
    # cspr.cloud convention: mainnet is the BARE domain (testnet has the .testnet. prefix).
    cspr_mainnet_node_url: str = "https://node.cspr.cloud/rpc"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    debug: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()


# ── Admin auth ────────────────────────────────────────────────────────────────
# Gate state-mutating endpoints behind a shared secret. When ADMIN_TOKEN is unset
# the gate is a no-op (open) so existing deployments keep working until the owner
# opts in by setting it. Read-only endpoints are never gated.
def require_admin(x_admin_token: str = Header(default="")):
    expected = settings.admin_token
    if not expected:
        return  # auth disabled — no token configured
    if x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Admin token required or invalid")


# If PEM content provided via env var, write to temp file
if settings.agent_secret_key_content:
    import tempfile
    _pem_file = tempfile.NamedTemporaryFile(mode="w", suffix=".pem", delete=False)
    _pem_file.write(settings.agent_secret_key_content.replace("\\n", "\n"))
    _pem_file.close()
    settings.agent_secret_key_path = _pem_file.name
    logger.info("PEM key loaded from env var → %s", _pem_file.name)

# Propagate settings to os.environ so MCP subprocess and deployer get them
os.environ.setdefault("CASPER_NODE_URL", settings.casper_node_url)
os.environ.setdefault("CSPR_CLOUD_API_KEY", settings.cspr_cloud_api_key)
os.environ.setdefault("CSPR_CLOUD_BASE_URL", settings.cspr_cloud_base_url)
os.environ.setdefault("ANTHROPIC_API_KEY", settings.anthropic_api_key)

_key = settings.anthropic_api_key
if not _key.startswith("sk-ant-") or _key in ("sk-ant-api03-...",):
    logger.warning(
        "⚠  ANTHROPIC_API_KEY is not set or uses a placeholder value (%r). "
        "Claude AI will be disabled — agent runs on rule-based fallback only. "
        "Fix: add ANTHROPIC_API_KEY=sk-ant-... to your .env file or Vercel environment variables.",
        _key[:16] + "..." if len(_key) > 16 else _key,
    )

# ── Startup connectivity check ────────────────────────────────────────────────

def _check_anthropic_connectivity() -> None:
    """Raw TCP + urllib test so we know exactly where connectivity breaks."""
    import socket, urllib.request, json as _json

    host, port = "api.anthropic.com", 443

    # 1. Raw TCP
    try:
        s = socket.create_connection((host, port), timeout=5)
        s.close()
        logger.info("✓ TCP connectivity to %s:%d OK", host, port)
    except Exception as exc:
        logger.error(
            "✗ TCP connectivity to %s:%d FAILED: %s — "
            "Railway may be blocking outbound connections to Anthropic. "
            "Fix: change Railway region (Settings → Region) or migrate to Render/Fly.io.",
            host, port, exc,
        )
        return

    # 2. HTTPS via stdlib urllib (independent of httpx)
    try:
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/models",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger.info("✓ HTTPS to api.anthropic.com OK (status %d)", resp.status)
    except urllib.error.HTTPError as exc:
        # HTTP error means the connection works, just auth/endpoint issue
        logger.info("✓ HTTPS to api.anthropic.com reachable (HTTP %d — API key or endpoint check)", exc.code)
    except Exception as exc:
        logger.error("✗ HTTPS to api.anthropic.com FAILED via urllib: %s", exc)


_check_anthropic_connectivity()

# ── Global state ──────────────────────────────────────────────────────────────

agent: Optional[YieldAgent] = None
# Mainnet x402 provider — serves the paid /x402/decision and /x402/rwa-feed
# resources where OTHER agents pay this agent (closes the x402 loop: provider, not
# just consumer). Verification is chain-agnostic; settlement is on Casper mainnet
# via the official facilitator.
x402_provider: Optional[X402Handler] = None
ws_connections: list[WebSocket] = []


async def broadcast(message: dict):
    dead = []
    for ws in ws_connections:
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_connections.remove(ws)


# ── App lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent, x402_provider

    casper_client = CasperClient(
        node_url=settings.casper_node_url,
        cloud_api_key=settings.cspr_cloud_api_key,
        cloud_base_url=settings.cspr_cloud_base_url,
    )
    deployer    = CasperDeployer(
        node_url=settings.casper_node_url,
        chain_name="casper-test",
        cloud_api_key=settings.cspr_cloud_api_key,
        resolved_contract_hash=settings.vault_contract_version_hash or None,
    )
    rwa_oracle  = RWAOracle()
    decision_engine = DecisionEngine(api_key=settings.anthropic_api_key)
    x402 = X402Handler(
        agent_account=settings.agent_account_hash,
        key_path=settings.agent_secret_key_path,
        node_url=settings.casper_node_url,
        cloud_api_key=settings.cspr_cloud_api_key,
        payment_amount_motes=settings.x402_payment_amount,
        enabled=settings.x402_enabled,
        facilitator_url=settings.x402_facilitator_url,
        chain=CHAIN_TESTNET,
        pay_to=settings.x402_pay_to,
        min_settle_interval_seconds=settings.x402_settle_interval_seconds,
        asset=settings.x402_asset,
        token_name=settings.x402_token_name,
        token_version=settings.x402_token_version,
        token_decimals=settings.x402_token_decimals,
        token_symbol=settings.x402_token_symbol,
    )

    # Mainnet provider handler: payTo is left empty so it resolves to THIS agent's
    # own account-hash address (the agent receives payment), chain is Casper mainnet.
    x402_provider = X402Handler(
        agent_account=settings.agent_account_hash,
        key_path=settings.agent_secret_key_path,
        node_url=settings.casper_node_url,
        cloud_api_key=settings.cspr_cloud_api_key,
        enabled=settings.x402_enabled,
        facilitator_url=settings.x402_facilitator_url,
        chain=CHAIN_MAINNET,
        pay_to="",  # → agent's own account-hash address via _ensure_pay_to
        settle_node_url=settings.cspr_mainnet_node_url,
        asset=settings.x402_asset,
        token_name=settings.x402_token_name,
        token_version=settings.x402_token_version,
        token_decimals=settings.x402_token_decimals,
        token_symbol=settings.x402_token_symbol,
    )

    async def on_cycle(result: AgentCycleResult):
        await broadcast({"event": "cycle", "data": result.model_dump()})

    # CSPR.trade MCP client signed by the agent's own key — used to execute a real
    # mainnet swap when the AI rebalances (only if defi_execute_on_rebalance is on).
    agent_cspr_trade = CsprTradeMCP(
        agent_key_path=settings.agent_secret_key_path,
        agent_public_key=x402.public_key_hex,
        max_price_impact_pct=settings.cspr_trade_max_price_impact_pct,
        max_amount_cspr=settings.cspr_trade_max_amount_cspr,
        node_rpc=settings.cspr_mainnet_node_url,
        node_auth=settings.cspr_cloud_api_key,
    )

    agent = YieldAgent(
        casper_client=casper_client,
        decision_engine=decision_engine,
        x402_handler=x402,
        deployer=deployer,
        rwa_oracle=rwa_oracle,
        vault_contract_hash=settings.vault_contract_hash,
        agent_account_hash=settings.agent_account_hash,
        agent_secret_key_path=settings.agent_secret_key_path,
        poll_interval_seconds=settings.agent_poll_interval_seconds,
        max_rebalances_per_day=settings.max_rebalances_per_day,
        rwa_onchain_enabled=settings.rwa_onchain_enabled,
        rwa_post_interval_seconds=settings.rwa_post_interval_seconds,
        cspr_trade=agent_cspr_trade,
        defi_execute_on_rebalance=settings.defi_execute_on_rebalance,
        defi_swap_amount_cspr=settings.defi_swap_amount_cspr,
        defi_swap_token_in=settings.defi_swap_token_in,
        defi_swap_token_out=settings.defi_swap_token_out,
        defi_max_swaps_per_day=settings.defi_max_swaps_per_day,
        defi_min_drift_pct=settings.defi_min_drift_pct,
        defi_min_net_gain_bps=settings.defi_min_net_gain_bps,
        on_cycle_complete=on_cycle,
    )

    task = asyncio.create_task(agent.start())
    logger.info("Agent Casper agent started")

    yield

    agent.stop()
    task.cancel()
    logger.info("Agent Casper agent stopped")


app = FastAPI(
    title="Agent Casper AI",
    description="Autonomous DeFi Yield Optimization Agent on Casper Network",
    version="1.0.0",
    lifespan=lifespan,
    swagger_favicon_url="https://agent-casper-git-master-soeclaw.vercel.app/agent_casper.png",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

class CORSErrorMiddleware(BaseHTTPMiddleware):
    """Ensure CORS headers are present even on unhandled 500 errors."""
    async def dispatch(self, request, call_next):
        origin = request.headers.get("origin", "*")
        try:
            response = await call_next(request)
        except Exception as exc:
            return JSONResponse(
                status_code=500,
                content={"detail": str(exc)},
                headers={"Access-Control-Allow-Origin": origin},
            )
        response.headers.setdefault("Access-Control-Allow-Origin", origin)
        return response

app.add_middleware(CORSErrorMiddleware)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "*")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": origin},
    )


# ── REST Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"name": "Agent Casper", "version": "1.0.0", "status": "running"}


@app.get("/agent/status")
async def agent_status():
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    return agent.get_stats()


@app.get("/agent/history")
async def agent_history(limit: int = 20):
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    return [c.model_dump() for c in agent.get_history(limit)]


@app.get("/portfolio")
async def get_portfolio():
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    history = agent.get_history(1)
    if history:
        return history[0].portfolio
    return {"error": "No data yet — agent is warming up"}


@app.get("/yields")
async def get_yields():
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    history = agent.get_history(1)
    if history:
        return history[0].yield_rates
    return []


@app.get("/decisions")
async def get_decisions(limit: int = 10):
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    history = agent.get_history(limit)
    return [
        {
            "timestamp": c.timestamp,
            "block_height": c.block_height,
            "decision": c.decision,
            "tx_hash": c.tx_hash,
        }
        for c in history
    ]


# ── x402 Micropayment endpoints ────────────────────────────────────────────────

@app.get("/x402/info")
async def x402_info():
    """x402 configuration + the agent's payer public key + facilitator support."""
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    x402 = agent.x402
    supported = await x402.get_supported_schemes()
    prov = x402_provider
    return {
        "enabled": x402.enabled,
        "scheme": "exact",
        "network": x402.chain,
        "payer_public_key": x402.public_key_hex,
        "payer_address": x402.address,
        "pay_to": x402.pay_to or x402.address,
        "asset": x402.asset,
        "token": {"name": x402.token_name, "version": x402.token_version,
                  "decimals": x402.token_decimals, "symbol": x402.token_symbol},
        "amount": x402.payment_amount,
        "facilitator_url": x402.facilitator_url,
        "facilitator_supported": supported,
        "protected_resources": ["/premium/yield-forecast"],
        "proof": "ed25519 signature over EIP-712 TransferWithAuthorization digest",
        # The agent is a SERVICE PROVIDER too — other agents pay it for premium data.
        "roles": ["consumer", "provider"],
        "provider": {
            "network": CHAIN_MAINNET,
            "receives_to": (prov.address if prov else x402.address),
            "services": [
                {
                    "resource": "/x402/decision",
                    "amount": settings.x402_decision_price,
                    "description": "On-demand Claude AI rebalance recommendation (RWA-aware)",
                },
                {
                    "resource": "/x402/rwa-feed",
                    "amount": settings.x402_rwa_feed_price,
                    "description": "Aggregated RWA prices (PAXG, UST10Y, WTI) verified on-chain",
                },
            ],
        },
    }


@app.get("/x402/supported")
async def x402_supported():
    """Proxy the official CSPR.cloud facilitator /supported schemes."""
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    supported = await agent.x402.get_supported_schemes()
    if supported is None:
        raise HTTPException(502, "Facilitator unreachable")
    return supported


@app.api_route("/premium/yield-forecast", methods=["GET", "POST"])
async def premium_yield_forecast(request: Request):
    """
    x402-protected premium resource. Without a valid X-PAYMENT header this
    returns HTTP 402 + PaymentRequirements; with a cryptographically valid
    payment it verifies the ed25519 proof, settles the micropayment on-chain
    (unless ?settle=false), and returns the premium forecast.
    """
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    x402 = agent.x402
    resource_url = str(request.url).split("?")[0]
    resource_obj = x402.resource_object(resource_url, "Agent Casper premium yield forecast")
    await x402._ensure_pay_to()

    header = request.headers.get("X-PAYMENT")
    if not header:
        return JSONResponse(
            status_code=402,
            content={
                "x402Version": 2,
                "error": "X-PAYMENT header required",
                "resource": resource_obj,
                "accepts": [x402.requirements(resource_url)],
            },
            headers={"Access-Control-Expose-Headers": "X-PAYMENT"},
        )

    auth = x402.verify_payment(header)
    if not auth:
        return JSONResponse(
            status_code=402,
            content={
                "x402Version": 2,
                "error": "Payment proof invalid, expired, or replayed",
                "resource": resource_obj,
                "accepts": [x402.requirements(resource_url)],
            },
        )

    # Proof verified — settle the CEP-18 transfer_with_authorization via the facilitator.
    settle = request.query_params.get("settle", "true").lower() != "false"
    settlement = {}
    if settle:
        payload = json.loads(base64.b64decode(header))
        settlement = await x402.settle_as_provider(payload, payload.get("accepted") or x402.requirements(resource_url))

    history = agent.get_history(1)
    latest = history[0] if history else None
    forecast = {
        "block_height": latest.block_height if latest else 0,
        "current_strategy": latest.portfolio.get("current_strategy") if latest else "N/A",
        "yield_rates": latest.yield_rates if latest else [],
        "next_decision": latest.decision if latest else {},
        "note": "Premium analytics unlocked via x402 micropayment",
    }
    return {
        "resource": resource_url,
        "paid": True,
        "payer": auth["from"],
        "amount": int(auth["value"]),
        "settlement": settlement.get("settlement", "skipped"),
        "settlement_tx": settlement.get("tx_hash"),
        "explorer_url": settlement.get("explorer_url"),
        "premium_data": forecast,
    }


# ── x402 mainnet PROVIDER endpoints (other agents pay THIS agent) ──────────────

def _provider_challenge(resource: str, amount: int, description: str) -> JSONResponse:
    """Build the HTTP 402 PaymentRequirements challenge for a provider resource."""
    return JSONResponse(
        status_code=402,
        content={
            "x402Version": 2,
            "error": "X-PAYMENT header required",
            "resource": x402_provider.resource_object(resource, description),
            "accepts": [x402_provider.requirements(resource, amount=amount, description=description)],
        },
        headers={"Access-Control-Expose-Headers": "X-PAYMENT"},
    )


async def _provider_verify(request: Request, resource: str, amount: int, description: str):
    """
    Shared provider-side x402 gate. Returns either a JSONResponse (402 challenge or
    rejection) to short-circuit, or a tuple (auth, settlement) when payment is valid.
    """
    if not x402_provider or not x402_provider.enabled:
        raise HTTPException(503, "x402 provider not enabled")

    header = request.headers.get("X-PAYMENT")
    if not header:
        return _provider_challenge(resource, amount, description), None

    auth = x402_provider.verify_payment(header)
    if not auth:
        return JSONResponse(
            status_code=402,
            content={
                "x402Version": 2,
                "error": "Payment proof invalid, expired, or replayed",
                "resource": x402_provider.resource_object(resource, description),
                "accepts": [x402_provider.requirements(resource, amount=amount, description=description)],
            },
        ), None

    # Proof verified — settle on mainnet via the facilitator (payer → this agent).
    requirements = x402_provider.requirements(resource, amount=amount, description=description)
    payload = json.loads(base64.b64decode(header))
    settlement = await x402_provider.settle_as_provider(payload, requirements)
    return auth, settlement


@app.api_route("/x402/decision", methods=["GET", "POST"])
async def x402_decision(request: Request):
    """
    PAID (mainnet x402): another agent pays this agent for a fresh, on-demand
    Claude AI rebalance recommendation that factors in live RWA market signals.
    Without X-PAYMENT → HTTP 402 + PaymentRequirements.
    """
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    resource = "/x402/decision"
    price = settings.x402_decision_price
    desc = "On-demand Claude AI rebalance recommendation (RWA-aware)"

    gate, settlement = await _provider_verify(request, resource, price, desc)
    if settlement is None:          # gate is a 402/rejection response
        return gate
    auth = gate                     # gate is the verified authorization dict

    history = agent.get_history(1)
    latest = history[0] if history else None
    rec = await agent.engine.recommend(
        yield_rates=(latest.yield_rates if latest else []),
        portfolio=(latest.portfolio if latest else {}),
        rwa_prices=(latest.rwa_prices if latest else []),
        block_height=(latest.block_height if latest else 0),
        vault_contract_hash=agent.vault_contract_hash,
        agent_account_hash=agent.agent_account,
        rebalance_count_today=agent.get_stats().get("rebalances_today", 0),
        max_rebalances_per_day=agent.max_rebalances,
    )

    return {
        "resource": resource,
        "paid": True,
        "network": CHAIN_MAINNET,
        "payer": auth["from"],
        "amount_motes": int(auth["value"]),
        "settlement": settlement,
        "recommendation": rec.model_dump(),
        "generated_by": "Claude AI (Agent Casper) — RWA-aware yield routing",
        "block_height": latest.block_height if latest else 0,
    }


@app.api_route("/x402/rwa-feed", methods=["GET", "POST"])
async def x402_rwa_feed(request: Request):
    """
    PAID (mainnet x402): another agent pays this agent for the aggregated RWA
    price feed (PAXG, UST10Y, WTI), bundled with the on-chain proof — the Casper
    deploy hashes where these prices were posted to the YieldVault oracle.
    Without X-PAYMENT → HTTP 402 + PaymentRequirements.
    """
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    resource = "/x402/rwa-feed"
    price = settings.x402_rwa_feed_price
    desc = "Aggregated RWA prices (PAXG, UST10Y, WTI) verified on-chain"

    gate, settlement = await _provider_verify(request, resource, price, desc)
    if settlement is None:
        return gate
    auth = gate

    rwa_prices = await agent.rwa.fetch_rwa_prices()

    # On-chain proof: most recent deploy hashes where PAXG/UST10Y were posted to the
    # YieldVault oracle on Casper testnet (the contract lives on testnet).
    onchain_proof: dict = {}
    for cycle in agent.get_history(20):
        for asset_id, tx in (cycle.rwa_tx_hashes or {}).items():
            if asset_id not in onchain_proof and tx:
                onchain_proof[asset_id] = {
                    "tx_hash": tx,
                    "explorer_url": f"https://testnet.cspr.live/deploy/{tx}",
                }
        if len(onchain_proof) >= len(YieldAgent.RWA_ASSETS_TO_POST):
            break

    return {
        "resource": resource,
        "paid": True,
        "network": CHAIN_MAINNET,
        "payer": auth["from"],
        "amount_motes": int(auth["value"]),
        "settlement": settlement,
        "rwa_prices": rwa_prices,
        "onchain_proof": onchain_proof,
        "onchain_proof_note": (
            "tx_hash entries are Casper deploys where this agent posted the RWA price "
            "to the YieldVault oracle contract via update_rwa_price() — verifiable on-chain."
        ),
    }


# ── Real DeFi via CSPR.trade MCP (Casper mainnet, non-custodial) ───────────────

def _cspr_trade() -> CsprTradeMCP:
    """Build a CSPR.trade MCP client signed by the agent's own key."""
    pub = agent.x402.public_key_hex if agent else ""
    return CsprTradeMCP(
        agent_key_path=settings.agent_secret_key_path,
        agent_public_key=pub,
        max_price_impact_pct=settings.cspr_trade_max_price_impact_pct,
        max_amount_cspr=settings.cspr_trade_max_amount_cspr,
        node_rpc=settings.cspr_mainnet_node_url,
        node_auth=settings.cspr_cloud_api_key,
    )


@app.get("/defi/quote")
async def defi_quote(token_in: str = "CSPR", token_out: str = "sCSPR", amount: str = "10"):
    """Live CSPR.trade mainnet swap quote (read-only, no wallet, no risk)."""
    try:
        return await _cspr_trade().get_quote(token_in, token_out, amount)
    except CsprTradeError as exc:
        raise HTTPException(502, str(exc))


@app.get("/defi/markets")
async def defi_markets():
    """Live CSPR.trade mainnet trading pairs."""
    try:
        pairs = await _cspr_trade().get_pairs()
        return {"network": "casper:casper", "source": "CSPR.trade MCP", "pairs": pairs}
    except CsprTradeError as exc:
        raise HTTPException(502, str(exc))


class SwapRequest(BaseModel):
    token_in: str = "CSPR"
    token_out: str = "sCSPR"
    amount: str = "10"
    slippage_bps: int = 300
    execute: bool = False   # MUST be explicitly true to spend real CSPR on mainnet


@app.post("/defi/swap", dependencies=[Depends(require_admin)])
async def defi_swap(req: SwapRequest):
    """
    Build (and, only with execute=true, broadcast) a REAL non-custodial swap on
    CSPR.trade mainnet via MCP. The agent signs the unsigned deploy with its own
    key; funds never leave the agent's account. Guardrailed by amount + price impact.
    Default execute=false returns the real quote + signed deploy without broadcasting.
    """
    try:
        result = await _cspr_trade().swap(
            token_in=req.token_in, token_out=req.token_out, amount=req.amount,
            slippage_bps=req.slippage_bps, execute=req.execute,
        )
        # Persist executed swaps so the dashboard proof becomes a real history.
        swap_log.record_swap(result, triggered_by="manual")
        return result
    except CsprTradeError as exc:
        raise HTTPException(400, str(exc))


@app.get("/defi/history")
async def defi_history(limit: int = 50):
    """Persistent history of real, non-custodial swaps executed on Casper mainnet."""
    return {"swaps": swap_log.load_swaps(limit)}


class SetupContractRequest(BaseModel):
    vault_contract_hash: str
    agent_account_hash: str


@app.get("/admin/agent-address")
async def get_agent_address():
    """Return the agent's account hash + public key so the frontend can register it and fund it."""
    public_key = None
    try:
        import pathlib, pycspr
        kp = pycspr.parse_private_key(pathlib.Path(settings.agent_secret_key_path))
        public_key = kp.account_key.hex()
    except Exception as exc:
        logger.debug("Could not derive agent public key via pycspr: %s", exc)

    # Prefer live agent value (updated via /admin/setup) over static settings
    contract_hash = (agent.vault_contract_hash if agent else None) or settings.vault_contract_hash
    is_deployed = bool(contract_hash and not contract_hash.startswith("hash-demo"))
    return {
        "agent_account_hash": settings.agent_account_hash,
        "agent_public_key": public_key,
        "agent_secret_key_path": settings.agent_secret_key_path,
        "faucet_url": "https://testnet.cspr.live/tools/faucet",
        "vault_contract_hash": contract_hash if is_deployed else None,
        "contract_deployed": is_deployed,
    }


@app.get("/admin/contract-info")
async def get_contract_info():
    """Return deployed contract hash — separate endpoint for frontend contract status check."""
    contract_hash = (agent.vault_contract_hash if agent else None) or settings.vault_contract_hash
    is_deployed = bool(contract_hash and not contract_hash.startswith("hash-demo"))
    return {
        "vault_contract_hash": contract_hash if is_deployed else None,
        "contract_deployed": is_deployed,
        "explorer_url": f"https://testnet.cspr.live/contract-package/{contract_hash.replace('hash-', '')}" if is_deployed else None,
    }


@app.post("/admin/setup", dependencies=[Depends(require_admin)])
async def setup_contract(req: SetupContractRequest):
    """
    Called by the frontend after deploying the contract via connected wallet.
    Updates agent config without requiring a server restart.
    """
    global agent
    if not (req.vault_contract_hash.startswith("hash-") or req.vault_contract_hash.startswith("package-")):
        raise HTTPException(400, "vault_contract_hash must start with 'hash-' or 'package-'")
    if not req.agent_account_hash.startswith("account-hash-"):
        raise HTTPException(400, "agent_account_hash must start with 'account-hash-'")

    # Persist to .env
    env_path = ".env"
    try:
        lines = open(env_path).readlines() if __import__("os").path.exists(env_path) else []
        updated = {
            "VAULT_CONTRACT_HASH": req.vault_contract_hash,
            "AGENT_ACCOUNT_HASH":  req.agent_account_hash,
        }
        new_lines, seen = [], set()
        for line in lines:
            key = line.split("=")[0].strip()
            if key in updated:
                new_lines.append(f"{key}={updated[key]}\n")
                seen.add(key)
            else:
                new_lines.append(line)
        for k, v in updated.items():
            if k not in seen:
                new_lines.append(f"{k}={v}\n")
        open(env_path, "w").writelines(new_lines)
    except Exception as e:
        logger.warning("Could not write .env: %s", e)

    # Hot-reload agent config
    if agent:
        agent.vault_contract_hash = req.vault_contract_hash
        agent.agent_account_hash  = req.agent_account_hash
        logger.info("Contract config updated live: %s", req.vault_contract_hash[:24])

    return {
        "status": "ok",
        "vault_contract_hash": req.vault_contract_hash,
        "agent_account_hash":  req.agent_account_hash,
        "message": "Agent config updated — no restart needed",
    }


@app.get("/admin/setup/wasm")
async def get_wasm():
    """Serve the compiled WASM for browser-side deploy signing."""
    import os
    from fastapi.responses import Response
    wasm_paths = [
        "../contracts/wasm/yield_vault.wasm",
        "contracts/wasm/yield_vault.wasm",
    ]
    for path in wasm_paths:
        if os.path.isfile(path):
            return Response(
                content=open(path, "rb").read(),
                media_type="application/wasm",
                headers={"Content-Disposition": "attachment; filename=yield_vault.wasm"},
            )
    raise HTTPException(404, "WASM not built yet — run GitHub Actions workflow first")


class ManualRebalanceRequest(BaseModel):
    conservative_pct: int
    balanced_pct: int
    aggressive_pct: int
    reasoning: str = "Manual override by operator"


@app.post("/rebalance/manual", dependencies=[Depends(require_admin)])
async def manual_rebalance(req: ManualRebalanceRequest):
    """Operator-triggered manual rebalance (bypasses AI decision)."""
    if req.conservative_pct + req.balanced_pct + req.aggressive_pct != 100:
        raise HTTPException(400, "Percentages must sum to 100")

    # In production: submit tx directly
    return {
        "status": "submitted",
        "message": "Manual rebalance queued",
        "allocation": {
            "conservative_pct": req.conservative_pct,
            "balanced_pct": req.balanced_pct,
            "aggressive_pct": req.aggressive_pct,
        },
    }


@app.post("/rpc")
async def rpc_proxy(request: Request):
    """
    Proxy Casper node RPC calls to avoid browser CORS restrictions.

    CSPR.cloud rate-limits aggressively; a raw 429 here breaks user actions like
    Register Agent (whose deploy submission goes through this proxy). So we retry
    with backoff on 429/5xx and try BOTH authenticated and anonymous requests —
    they hit different rate buckets, so one often succeeds when the other is
    throttled. Only genuinely-bad requests (4xx other than 429) fail fast.
    """
    import httpx
    body = await request.json()
    node_url = settings.casper_node_url

    # CSPR.cloud REQUIRES the API key — always send it (an anonymous call returns
    # 401). Retry with backoff only on transient throttling/5xx; other 4xx (e.g. a
    # genuinely bad deploy) fail fast.
    headers = {"Content-Type": "application/json"}
    if settings.cspr_cloud_api_key:
        headers["Authorization"] = settings.cspr_cloud_api_key

    last_detail, last_status = "no attempt made", 502
    async with httpx.AsyncClient(timeout=30) as client:
        for attempt in range(4):
            retry_after = 0.0
            try:
                resp = await client.post(node_url, json=body, headers=headers)
            except Exception as exc:
                last_detail, last_status = f"connection error: {exc}", 502
            else:
                if resp.status_code == 200:
                    try:
                        return resp.json()
                    except Exception:
                        raise HTTPException(502, "Upstream returned non-JSON response")
                last_detail, last_status = resp.text[:300], resp.status_code
                if resp.status_code not in (429, 500, 502, 503, 529):
                    raise HTTPException(resp.status_code, resp.text[:500])
                try:
                    retry_after = float(resp.headers.get("retry-after", "0"))
                except Exception:
                    retry_after = 0.0
            if attempt < 3:
                await asyncio.sleep(min(max(retry_after, 0.6 * (2 ** attempt)), 5.0))

    logger.warning("RPC proxy exhausted retries (last %s): %s", last_status, last_detail[:120])
    raise HTTPException(last_status, f"Casper node busy (rate-limited). Try again. — {last_detail}")


@app.post("/deploy", dependencies=[Depends(require_admin)])
async def submit_deploy(request: Request):
    """Submit deploy — tries anonymous then authenticated CSPR.cloud node."""
    body = await request.json()
    node_url = settings.casper_node_url  # e.g. https://node.testnet.cspr.cloud/rpc
    attempts = [
        # Anonymous first — no org rate-limit applies
        {"url": node_url, "headers": {"Content-Type": "application/json"}},
        # Auth fallback
        {"url": node_url, "headers": {"Content-Type": "application/json", "Authorization": settings.cspr_cloud_api_key}},
    ]
    last_err = None
    async with __import__("httpx").AsyncClient(timeout=60) as client:
        for attempt in attempts:
            try:
                resp = await client.post(attempt["url"], json=body, headers=attempt["headers"])
                logger.info("Deploy submit → %s ← %s", attempt["url"], resp.status_code)
                if resp.status_code == 200:
                    return resp.json()
                last_err = f"HTTP {resp.status_code}: {resp.text[:300]}"
                logger.warning("Deploy attempt failed: %s", last_err)
            except Exception as exc:
                last_err = str(exc)
                logger.warning("Deploy attempt exception: %s", exc)
    raise HTTPException(502, f"All nodes failed: {last_err}")


@app.get("/deploys/{deploy_hash}")
async def get_deploy(deploy_hash: str):
    """Proxy deploy status from CSPR.cloud to avoid browser CORS."""
    url = f"{settings.cspr_cloud_base_url}/deploys/{deploy_hash}"
    async with __import__("httpx").AsyncClient(
        headers={"Authorization": settings.cspr_cloud_api_key},
        timeout=10,
    ) as client:
        resp = await client.get(url)
    return resp.json()


@app.get("/accounts/{account_id}")
async def get_account(account_id: str):
    """Proxy account info from CSPR.cloud to avoid browser CORS."""
    url = f"{settings.cspr_cloud_base_url}/accounts/{account_id}"
    async with __import__("httpx").AsyncClient(
        headers={"Authorization": settings.cspr_cloud_api_key},
        timeout=10,
    ) as client:
        resp = await client.get(url)
    return resp.json()


@app.get("/named-keys/{account_hash}")
async def get_named_keys(account_hash: str):
    """Proxy account named-keys from CSPR.cloud — used to find contract package hash after Casper 2.x deploy."""
    url = f"{settings.cspr_cloud_base_url}/accounts/{account_hash}/named-keys"
    async with __import__("httpx").AsyncClient(
        headers={"Authorization": settings.cspr_cloud_api_key},
        timeout=10,
    ) as client:
        resp = await client.get(url)
    return resp.json()


@app.post("/agent/pause", dependencies=[Depends(require_admin)])
async def pause_agent():
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    agent.stop()
    return {"status": "paused"}


@app.post("/agent/resume", dependencies=[Depends(require_admin)])
async def resume_agent():
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    if not agent._running:
        asyncio.create_task(agent.start())
    return {"status": "running", "running": True}


class ChatRequest(BaseModel):
    message: str


def _parse_strategy(text: str) -> Optional[str]:
    """Extract strategy name from message text."""
    t = text.lower()
    if any(w in t for w in ["conservative", "konservatif", "aman", "safe"]):
        return "conservative"
    if any(w in t for w in ["aggressive", "agresif", "berani", "high"]):
        return "aggressive"
    if any(w in t for w in ["balanced", "seimbang", "tengah", "medium"]):
        return "balanced"
    return None


async def _handle_command(text: str) -> Optional[str]:
    """
    Detect and execute agent commands from chat input.
    Returns a response string, or None if the message is not a command.
    """
    if not agent:
        return None

    t = text.lower().strip()

    # ── PAUSE / STOP ──────────────────────────────────────────────────────────
    if any(w in t for w in ["pause", "berhenti", "stop agent", "hentikan", "tidurkan"]):
        agent.stop()
        return (
            "Agent di-STOP. Loop autonomous dihentikan. "
            "Ketik 'resume' atau 'start' untuk menjalankan kembali."
        )

    # ── RESUME / START ────────────────────────────────────────────────────────
    if any(w in t for w in [
        "resume", "lanjutkan", "aktifkan", "mulai lagi", "unpause",
        "start", "mulai", "running", "jalankan", "hidupkan", "run",
    ]):
        if not agent._running:
            asyncio.create_task(agent.start())
            return (
                f"Agent di-START. Loop autonomous berjalan kembali. "
                f"Cycle pertama dalam ~{agent.poll_interval}s."
            )
        return "Agent sudah running. Tidak perlu di-start lagi."

    # ── STATUS ────────────────────────────────────────────────────────────────
    if any(w in t for w in ["status", "laporan", "info", "state", "kondisi"]):
        stats = agent.get_stats()
        history = agent.get_history(1)
        latest = history[0] if history else None
        lines = [
            f"STATUS AGENT:",
            f"• Running: {'Ya' if stats['running'] else 'Tidak (ketik start untuk menjalankan)'}",
            f"• Rebalances hari ini: {stats['rebalances_today']}/{settings.max_rebalances_per_day}",
            f"• Total cycles: {stats['total_cycles']}",
        ]
        if latest:
            port = latest.portfolio
            lines += [
                f"• Block: #{latest.block_height:,}",
                f"• TVL: {port.get('total_value_motes', 0) / 1e9:.1f} CSPR",
                f"• Alokasi: CON={port.get('conservative_pct', 0)}% BAL={port.get('balanced_pct', 0)}% AGG={port.get('aggressive_pct', 0)}%",
                f"• Strategi: {port.get('current_strategy', 'N/A')}",
                f"• Keputusan terakhir: {latest.decision.get('action')} ({latest.decision.get('confidence', 0)*100:.0f}% confidence)",
            ]
            if latest.tx_hash:
                lines.append(f"• TX terakhir: {latest.tx_hash[:14]}...")
        return "\n".join(lines)

    # ── FORCE REBALANCE ───────────────────────────────────────────────────────
    is_rebalance_cmd = any(w in t for w in [
        "rebalance", "rebalans", "seimbangkan", "alokasi ulang",
        "execute", "eksekusi", "jalankan", "trigger",
    ])
    if is_rebalance_cmd:
        strategy = _parse_strategy(t) or "balanced"
        _ALLOC_LABEL = {
            "conservative": "CON=70% BAL=20% AGG=10%",
            "balanced":     "CON=20% BAL=60% AGG=20%",
            "aggressive":   "CON=10% BAL=20% AGG=70%",
        }
        try:
            tx_hash = await agent.force_rebalance(strategy)
            if tx_hash:
                return (
                    f"REBALANCE DIEKSEKUSI!\n"
                    f"• Strategi: {strategy.capitalize()} ({_ALLOC_LABEL[strategy]})\n"
                    f"• TX Hash: {tx_hash}\n"
                    f"• Cek: https://testnet.cspr.live/deploy/{tx_hash}"
                )
            return f"Rebalance gagal — lihat log backend untuk detail."
        except Exception as exc:
            return f"Error saat rebalance: {exc}"

    return None  # not a command


@app.post("/chat")
async def chat(req: ChatRequest):
    """Direct chat with the Claude AI agent. Supports commands and free-form Q&A."""
    # Try command first
    cmd_reply = await _handle_command(req.message)
    if cmd_reply:
        return {"reply": cmd_reply}

    # Free-form Q&A via Claude Haiku
    import anthropic as _anthropic
    client = _anthropic.Anthropic(api_key=settings.anthropic_api_key)

    history = agent.get_history(3) if agent else []
    context = ""
    if history:
        latest = history[0]
        port = latest.portfolio
        context = (
            f"TVL: {port.get('total_value_motes', 0) / 1e9:.0f} CSPR. "
            f"Allocation: CON={port.get('conservative_pct', 0)}% BAL={port.get('balanced_pct', 0)}% AGG={port.get('aggressive_pct', 0)}%. "
            f"Strategy: {port.get('current_strategy', 'N/A')}. "
            f"Last decision: {latest.decision.get('action')} "
            f"(confidence {latest.decision.get('confidence', 0)*100:.0f}%). "
            f"Block: #{latest.block_height:,}. "
            f"Agent paused: {agent.paused}."
        )

    system = (
        "You are Agent Casper, an autonomous DeFi yield-routing agent on Casper Network testnet. "
        "ALWAYS respond in English regardless of what language the user uses. "
        "Be concise — 2-4 sentences max. "
        "Available commands the user can type: 'rebalance [conservative/balanced/aggressive]', "
        "'pause', 'resume', 'status'. "
        + (f"Current state: {context}" if context else "No portfolio data yet.")
    )

    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=system,
        messages=[{"role": "user", "content": req.message}],
    )
    return {"reply": resp.content[0].text}


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    ws_connections.append(websocket)
    logger.info("WebSocket client connected — total: %d", len(ws_connections))

    # Send current state immediately on connect
    if agent:
        history = agent.get_history(1)
        if history:
            await websocket.send_text(json.dumps({
                "event": "init",
                "data": history[0].model_dump(),
            }))

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_connections.remove(websocket)
        logger.info("WebSocket client disconnected — total: %d", len(ws_connections))


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.debug,
    )
