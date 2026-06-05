"""
CasperYield AI — FastAPI server
Provides REST API + WebSocket for real-time agent monitoring.
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

# Ensure we always load .env from the backend/ directory regardless of cwd
os.chdir(Path(__file__).parent)

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from casper.client import CasperClient
from casper.deployer import CasperDeployer
from casper.rwa_oracle import RWAOracle
from casper.x402 import X402Handler
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
    agent_account_hash: str = "account-hash-demo"
    agent_secret_key_path: str = "./agent_secret_key.pem"
    agent_poll_interval_seconds: int = 60
    max_rebalances_per_day: int = 5
    x402_enabled: bool = False
    x402_payment_amount: int = 1_000_000
    x402_facilitator_url: str = "https://x402-facilitator.cspr.cloud"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    debug: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

# ── Global state ──────────────────────────────────────────────────────────────

agent: Optional[YieldAgent] = None
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
    global agent

    casper_client = CasperClient(
        node_url=settings.casper_node_url,
        cloud_api_key=settings.cspr_cloud_api_key,
        cloud_base_url=settings.cspr_cloud_base_url,
    )
    deployer    = CasperDeployer(node_url=settings.casper_node_url, chain_name="casper-test")
    rwa_oracle  = RWAOracle()
    decision_engine = DecisionEngine(api_key=settings.anthropic_api_key)
    x402 = X402Handler(
        agent_account=settings.agent_account_hash,
        payment_amount_motes=settings.x402_payment_amount,
        enabled=settings.x402_enabled,
        facilitator_url=settings.x402_facilitator_url,
    )

    async def on_cycle(result: AgentCycleResult):
        await broadcast({"event": "cycle", "data": result.model_dump()})

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
        on_cycle_complete=on_cycle,
    )

    task = asyncio.create_task(agent.start())
    logger.info("CasperYield AI agent started")

    yield

    agent.stop()
    task.cancel()
    logger.info("CasperYield AI agent stopped")


app = FastAPI(
    title="CasperYield AI",
    description="Autonomous DeFi Yield Optimization Agent on Casper Network",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

class CORSErrorMiddleware(BaseHTTPMiddleware):
    """Ensure CORS headers are present even on unhandled 500 errors."""
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        origin = request.headers.get("origin", "*")
        response.headers.setdefault("Access-Control-Allow-Origin", origin)
        response.headers.setdefault("Access-Control-Allow-Credentials", "true")
        return response

app.add_middleware(CORSErrorMiddleware)


# ── REST Endpoints ────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"name": "CasperYield AI", "version": "1.0.0", "status": "running"}


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


class SetupContractRequest(BaseModel):
    vault_contract_hash: str
    agent_account_hash: str


@app.get("/admin/agent-address")
async def get_agent_address():
    """Return the agent's account hash (from PEM key file) so the frontend can use it."""
    return {
        "agent_account_hash": settings.agent_account_hash,
        "agent_secret_key_path": settings.agent_secret_key_path,
    }


@app.post("/admin/setup")
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


@app.post("/rebalance/manual")
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
    """Proxy Casper node RPC calls to avoid browser CORS restrictions."""
    body = await request.json()
    headers = {"Content-Type": "application/json"}
    if settings.cspr_cloud_api_key:
        headers["Authorization"] = settings.cspr_cloud_api_key
    logger.info("RPC proxy → %s (api_key set: %s)", settings.casper_node_url, bool(settings.cspr_cloud_api_key))
    async with __import__("httpx").AsyncClient(timeout=30) as client:
        resp = await client.post(settings.casper_node_url, json=body, headers=headers)
    logger.info("RPC proxy ← %s %s", resp.status_code, resp.text[:200])
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text[:500])
    try:
        return resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Upstream returned non-JSON response")


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


@app.post("/agent/pause")
async def pause_agent():
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    agent.stop()
    return {"status": "paused"}


@app.post("/agent/resume")
async def resume_agent():
    if not agent:
        raise HTTPException(503, "Agent not initialized")
    if not agent._running:
        asyncio.create_task(agent.start())
    return {"status": "running"}


class ChatRequest(BaseModel):
    message: str


@app.post("/chat")
async def chat(req: ChatRequest):
    """Direct chat with the Claude AI agent about the portfolio."""
    import anthropic as _anthropic
    client = _anthropic.Anthropic(api_key=settings.anthropic_api_key)

    history = agent.get_history(3) if agent else []
    context = ""
    if history:
        latest = history[0]
        context = (
            f"Portfolio: {latest.portfolio.get('total_value_motes', 0) / 1e9:.0f} CSPR, "
            f"strategy: {latest.portfolio.get('current_strategy', 'N/A')}. "
            f"Last decision: {latest.decision.get('action')} "
            f"(confidence {latest.decision.get('confidence', 0)*100:.0f}%). "
            f"Block: #{latest.block_height:,}."
        )

    system = (
        "You are CasperYield AI, an autonomous DeFi agent on Casper Network. "
        "Answer questions about the portfolio, yield strategies, and market conditions. "
        "Be concise (2-3 sentences max). "
        + (f"Current state: {context}" if context else "No portfolio data yet.")
    )

    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
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
