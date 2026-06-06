"""
Minimal deploy submission proxy — runs on port 8001.
Submits signed Casper deploys to node.testnet.cspr.cloud with API key.
"""
import os
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

NODE    = os.getenv("CASPER_NODE_URL", "https://node.testnet.cspr.cloud/rpc")
API_KEY = os.getenv("CSPR_CLOUD_API_KEY", "")

@app.post("/deploy")
async def submit(request: Request):
    body = await request.json()
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["Authorization"] = API_KEY
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            resp = await client.post(NODE, json=body, headers=headers)
            if resp.status_code == 200:
                return resp.json()
            raise HTTPException(resp.status_code, resp.text[:300])
        except httpx.RequestError as e:
            raise HTTPException(502, str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
