"""
CSPR.cloud REST client â€" Official Casper AI Toolkit middleware.
Docs: https://docs.cspr.cloud  |  Skill: https://cspr.cloud/skill.md
"""

import httpx
import random
import time
from typing import Optional
from pydantic import BaseModel


class YieldRate(BaseModel):
    strategy: str
    apy_bps: int       # basis points (100 = 1%)
    tvl_cspr: float
    risk_score: float  # 0.0 (low) to 1.0 (high)


class PortfolioState(BaseModel):
    total_value_motes: int
    conservative_pct: int
    balanced_pct: int
    aggressive_pct: int
    current_strategy: str
    last_rebalance_timestamp: int


class CasperClient:
    """
    Wraps CSPR.cloud REST API (https://api.testnet.cspr.cloud).
    Node RPC is proxied via CSPR.cloud (https://node.testnet.cspr.cloud).
    Auth: Authorization header with CSPR.cloud API key.
    """

    def __init__(self, node_url: str, cloud_api_key: str, cloud_base_url: str):
        self.node_url = node_url
        self.cloud_base_url = cloud_base_url.rstrip("/")
        self.headers = {
            "Authorization": cloud_api_key,   # CSPR.cloud uses bare token (no "Bearer" prefix)
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        self._mock_block = 3_000_000
        self._block_cache: Optional[tuple[int, Optional[int], float]] = None  # (height, era_id, ts)
        # TTL cache for CSPR.cloud REST reads (key -> (value, expiry)). The agent
        # polls every cycle but allocation/TVL/registration change only when a
        # deploy lands, so re-reading each cycle burns the monthly REST quota
        # (100k) for nothing — the 429 then corrupts every on-chain read.
        self._rest_cache: dict[str, tuple[object, float]] = {}

    def _cache_get(self, key: str):
        import time as _t
        hit = self._rest_cache.get(key)
        if hit and hit[1] > _t.time():
            return hit[0]
        return None

    def _cache_put(self, key: str, value, ttl: float) -> None:
        import time as _t
        self._rest_cache[key] = (value, _t.time() + ttl)

    def invalidate_package_cache(self, package_hash: str) -> None:
        """Drop cached reads for a package — used right after an action (e.g.
        register_agent) so the UI sees the new on-chain truth immediately
        instead of waiting out the TTL."""
        pkg = package_hash.replace("hash-", "").replace("package-", "")
        for key in (f"reg:{pkg}", f"pkgdeps:{pkg}"):
            self._rest_cache.pop(key, None)

    def _unwrap(self, resp_json: dict) -> dict:
        """CSPR.cloud wraps responses in a 'data' object per API spec."""
        return resp_json.get("data", resp_json)

    async def _get_latest_block_info(self) -> tuple[int, Optional[int]]:
        """Fetch (height, era_id) — cached 15s so multiple callers per cycle share one RPC call."""
        if self._block_cache and (time.monotonic() - self._block_cache[2]) < 15:
            return self._block_cache[0], self._block_cache[1]

        # Try CSPR.cloud REST /blocks first (no RPC quota cost)
        try:
            async with httpx.AsyncClient(headers=self.headers, timeout=10) as client:
                resp = await client.get(f"{self.cloud_base_url}/blocks", params={"limit": 1})
                if resp.status_code == 200:
                    items = resp.json().get("data", [])
                    if items:
                        blk = items[0]
                        height = int(blk.get("block_height") or blk.get("height") or 0)
                        era_id = blk.get("era_id")
                        self._block_cache = (height, era_id, time.monotonic())
                        return height, era_id
        except Exception:
            pass

        # Fallback: single JSON-RPC call
        try:
            async with httpx.AsyncClient(headers={"Authorization": self.headers["Authorization"]}) as client:
                resp = await client.post(
                    self.node_url,
                    json={"id": 1, "jsonrpc": "2.0", "method": "chain_get_block", "params": []},
                    timeout=10,
                )
                resp.raise_for_status()
                result = resp.json()["result"]
                raw = result.get("block_with_signatures", {}).get("block") or result.get("block") or {}
                if "Version2" in raw:
                    h = raw["Version2"]["header"]
                    height, era_id = int(h["height"]), h.get("era_id")
                elif "Version1" in raw:
                    h = raw["Version1"]["header"]
                    height, era_id = int(h["height"]), h.get("era_id")
                else:
                    h = raw.get("header", raw)
                    height, era_id = int(h["height"]), h.get("era_id")
                self._block_cache = (height, era_id, time.monotonic())
                return height, era_id
        except Exception:
            self._mock_block += 1
            return self._mock_block, None

    async def get_block_height(self) -> int:
        height, _ = await self._get_latest_block_info()
        return height

    async def get_account_balance(self, account_identifier: str) -> int:
        """
        GET /accounts/{account_identifier}
        account_identifier: public key or account hash
        Returns balance in motes.
        """
        url = f"{self.cloud_base_url}/accounts/{account_identifier}"
        try:
            async with httpx.AsyncClient(headers=self.headers) as client:
                resp = await client.get(url, timeout=10)
                resp.raise_for_status()
                obj = self._unwrap(resp.json())
                # balance is returned as a string of motes
                return int(obj.get("balance", "0"))
        except Exception:
            return 100_000_000_000_000  # 100,000 CSPR demo fallback

    async def get_deploy_status(self, deploy_hash: str) -> dict:
        """GET /deploys/{deploy_hash}"""
        url = f"{self.cloud_base_url}/deploys/{deploy_hash}"
        async with httpx.AsyncClient(headers=self.headers) as client:
            resp = await client.get(url, timeout=10)
            resp.raise_for_status()
            return self._unwrap(resp.json())

    async def get_contract_state(self, contract_hash: str, key: str) -> Optional[dict]:
        """Query named key from contract state via CSPR.cloud."""
        url = f"{self.cloud_base_url}/contracts/{contract_hash}/named-keys/{key}"
        try:
            async with httpx.AsyncClient(headers=self.headers) as client:
                resp = await client.get(url, timeout=15)
                if resp.status_code == 404:
                    return None
                resp.raise_for_status()
                return self._unwrap(resp.json())
        except Exception:
            return None


    @staticmethod
    def _extract_account_hash(parsed) -> Optional[str]:
        """Normalise a Key CLValue's `parsed` field to 'account-hash-<64hex>'."""
        import re
        if isinstance(parsed, dict):
            parsed = parsed.get("Account") or parsed.get("account") or next(iter(parsed.values()), "")
        s = str(parsed or "")
        m = re.search(r"[0-9a-fA-F]{64}", s)
        return f"account-hash-{m.group(0).lower()}" if m else None

    async def get_registered_agent(self, package_hash: str) -> Optional[dict]:
        """Return the currently registered agent read from the latest successful
        `register_agent` deploy on CSPR.cloud, as {"agent_hash", "tx_hash"}. ODRA
        keeps `agent` in internal storage, so we reconstruct it from the on-chain
        call args (same approach as allocation). None if never registered or the
        index is unreadable.
        """
        if self._is_placeholder(package_hash):
            return None
        pkg_hex = package_hash.replace("hash-", "").replace("package-", "")
        cached = self._cache_get(f"reg:{pkg_hex}")
        if cached is not None:
            return cached  # type: ignore[return-value]
        try:
            for item in await self._fetch_package_deploys(pkg_hex):   # newest first
                if item.get("error_message"):
                    continue
                args = item.get("args", {})
                # register_agent's only arg is `agent` (a Key); rebalance /
                # update_rwa_price use different args, so this is unambiguous.
                if "agent" not in args:
                    continue
                ah = self._extract_account_hash(args["agent"].get("parsed"))
                if ah:
                    result = {"agent_hash": ah,
                              "tx_hash": item.get("deploy_hash") or item.get("hash"),
                              # register_agent is only_owner, so its caller IS the
                              # vault owner — used by wallet-sign admin auth.
                              "owner_public_key": (item.get("caller_public_key") or "").lower()}
                    self._cache_put(f"reg:{pkg_hex}", result, 600)
                    return result
        except Exception:
            return None
        return None


    _STRATEGY_NAMES = {0: "Conservative", 1: "Balanced", 2: "Aggressive"}

    def _is_placeholder(self, value: str) -> bool:
        """True when the hash/account is still the default placeholder."""
        return "xxx" in value or value.endswith("-demo")

    async def _fetch_allocation_from_deploys(
        self, package_hash: str, agent_hash: str
    ) -> tuple[int, int, int, str, int]:
        """
        Read current allocation by querying the latest successful rebalance deploy
        from CSPR.cloud. ODRA stores state internally so we reconstruct from
        the most recent on-chain rebalance() call args.

        Returns (conservative_pct, balanced_pct, aggressive_pct, strategy_name, rebalance_count).
        """
        _log = __import__("logging").getLogger(__name__)
        pkg_hex = package_hash.replace("hash-", "").replace("package-", "")
        acct_hex = agent_hash.replace("account-hash-", "")
        cached = self._cache_get(f"alloc:{pkg_hex}:{acct_hex}")
        if cached is not None:
            return cached  # type: ignore[return-value]
        url = f"{self.cloud_base_url}/deploys"
        params = {
            "caller_hash": acct_hex,
            "contract_package_hash": pkg_hex,
            "limit": 20,
            "page": 1,
        }
        try:
            async with httpx.AsyncClient(headers=self.headers, timeout=12) as client:
                resp = await client.get(url, params=params)
                if resp.status_code != 200:
                    return 0, 0, 0, "HOLDING", 0
                items = resp.json().get("data", [])
                count = 0
                for item in items:
                    args = item.get("args", {})
                    if item.get("error_message"):
                        continue
                    if "conservative_pct" not in args:
                        continue
                    count += 1
                    con = int(args["conservative_pct"].get("parsed", 0))
                    bal = int(args["balanced_pct"].get("parsed", 0))
                    agg = int(args["aggressive_pct"].get("parsed", 0))
                    strategy_idx = int(args.get("new_strategy", {}).get("parsed", 1))
                    strategy = self._STRATEGY_NAMES.get(strategy_idx, "Balanced")
                    _log.info(
                        "Portfolio from on-chain deploy: con=%d%% bal=%d%% agg=%d%% strategy=%s",
                        con, bal, agg, strategy,
                    )
                    result = (con, bal, agg, strategy, count)
                    self._cache_put(f"alloc:{pkg_hex}:{acct_hex}", result, 300)
                    return result
        except Exception as exc:
            _log.debug("fetch_allocation_from_deploys error: %s", exc)
        return 0, 0, 0, "HOLDING", 0

    async def _fetch_package_deploys(self, pkg_hex: str, max_pages: int = 10) -> list[dict]:
        """All deploys on a contract package, newest first, paginated (up to
        max_pages × 100). The agent adds deploys hourly (RWA posts, rebalances),
        so page 1 alone quickly stops containing older deposits/registers — which
        made TVL shrink and registration 'disappear'. Cached 5 min and shared by
        TVL + registration reads to keep REST quota usage flat."""
        cached = self._cache_get(f"pkgdeps:{pkg_hex}")
        if cached is not None:
            return cached  # type: ignore[return-value]
        out: list[dict] = []
        try:
            async with httpx.AsyncClient(headers=self.headers, timeout=15) as client:
                for page in range(1, max_pages + 1):
                    resp = await client.get(
                        f"{self.cloud_base_url}/deploys",
                        params={"contract_package_hash": pkg_hex, "limit": 100, "page": page},
                    )
                    if resp.status_code != 200:
                        if page == 1:   # quota / outage — back off, don't hammer
                            self._cache_put(f"pkgdeps:{pkg_hex}", [], 120)
                            return []
                        break
                    j = resp.json()
                    data = j.get("data") or []
                    out.extend(data)
                    total = j.get("item_count") or 0
                    if not data or (total and len(out) >= total):
                        break
        except Exception:
            if not out:
                return []
        self._cache_put(f"pkgdeps:{pkg_hex}", out, 300)
        return out

    async def _fetch_tvl_from_deploys(self, package_hash: str) -> int:
        """Real vault TVL (motes) = CSPR actually custodied by the contract, summed
        from successful on-chain `deposit()` calls minus `withdraw()`s. The payable
        deposit routes through the Odra proxy, so `deposit` shows up as the
        `entry_point` arg with an `attached_value`; direct `withdraw(amount)` calls
        subtract. This reflects the contract purse, not the agent's wallet."""
        if self._is_placeholder(package_hash):
            return 0
        pkg_hex = package_hash.replace("hash-", "").replace("package-", "")
        total = 0
        for item in await self._fetch_package_deploys(pkg_hex):
            if item.get("error_message"):
                continue
            args = item.get("args", {})
            ep_arg = (args.get("entry_point") or {}).get("parsed")
            ep_top = item.get("entry_point") or item.get("name")
            if ep_arg == "deposit":
                av = (args.get("attached_value") or args.get("amount") or {}).get("parsed")
                if av:
                    total += int(av)
            elif ep_top == "withdraw":
                amt = (args.get("amount") or {}).get("parsed")
                if amt:
                    total -= int(amt)
        return max(0, total)

    async def get_vault_portfolio(self, contract_hash: str, agent_account_hash: str = "") -> PortfolioState:
        """
        Reads portfolio state from YieldVault contract.
        Allocation (con/bal/agg %) is reconstructed from the latest successful
        rebalance() deploy on CSPR.cloud — 100% on-chain data.
        TVL = sum of on-chain deposits held by the contract (real custody).
        """
        if self._is_placeholder(contract_hash):
            return PortfolioState(
                total_value_motes=0, conservative_pct=0, balanced_pct=0,
                aggressive_pct=0, current_strategy="N/A", last_rebalance_timestamp=0,
            )

        _log = __import__("logging").getLogger(__name__)

        # ── Allocation from latest on-chain rebalance deploy ─────────────────
        conservative_pct, balanced_pct, aggressive_pct, current_strategy, _ = (
            await self._fetch_allocation_from_deploys(contract_hash, agent_account_hash)
            if agent_account_hash and not self._is_placeholder(agent_account_hash)
            else (0, 0, 0, "HOLDING", 0)
        )

        # ── TVL = real CSPR custodied by the vault (sum of on-chain deposits) ──
        # The payable deposit() lands CSPR in the contract purse; we reconstruct the
        # custodied total from successful deposit deploys (the contract-purse RPC read
        # is unreliable on this node). This is the vault's real on-chain TVL — NOT the
        # agent's wallet balance.
        total_value = await self._fetch_tvl_from_deploys(contract_hash)

        return PortfolioState(
            total_value_motes=total_value,
            conservative_pct=conservative_pct,
            balanced_pct=balanced_pct,
            aggressive_pct=aggressive_pct,
            current_strategy=current_strategy,
            last_rebalance_timestamp=0,
        )

    async def fetch_yield_rates(self) -> list[YieldRate]:
        """
        Real Casper Network staking yield rates via CSPR.cloud validators API.
        Conservative = top 10 validators (low fee). Balanced = network average.
        Aggressive = CSPR.trade DEX LP estimate (12-15% APY).
        Casper Network gross staking APY ≈ 10%; delegators net after validator fee.
        """
        CASPER_GROSS_APY_PCT = 10.0

        try:
            # Get era_id from cached block info (no extra RPC call if get_block_height ran first)
            _, era_id = await self._get_latest_block_info()

            async with httpx.AsyncClient(headers=self.headers, timeout=12) as client:
                validators = []
                if era_id is not None:
                    vr = await client.get(
                        f"{self.cloud_base_url}/validators",
                        params={"era_id": era_id, "page_size": 100},
                    )
                    if vr.status_code == 200:
                        validators = vr.json().get("data", [])

                if validators:
                    validators.sort(
                        key=lambda v: float(v.get("network_share", 0)), reverse=True
                    )
                    top10 = validators[:10]

                    total_stake_motes = sum(
                        int(v.get("delegators_stake", 0)) + int(v.get("bid_amount", 0))
                        for v in validators
                    )
                    con_tvl = sum(
                        (int(v.get("delegators_stake", 0)) + int(v.get("bid_amount", 0))) / 1e9
                        for v in top10
                    )
                    avg_fee_top10 = sum(float(v.get("fee", 10)) for v in top10) / len(top10)
                    avg_fee_all   = sum(float(v.get("fee", 10)) for v in validators) / len(validators)

                    con_apy = CASPER_GROSS_APY_PCT * (1 - avg_fee_top10 / 100)
                    bal_apy = CASPER_GROSS_APY_PCT * (1 - avg_fee_all / 100)
                    agg_apy = 14.5  # CSPR.trade DEX LP weighted avg estimate

                    return [
                        YieldRate(strategy="conservative", apy_bps=int(con_apy * 100),
                                  tvl_cspr=round(con_tvl), risk_score=0.15),
                        YieldRate(strategy="balanced",     apy_bps=int(bal_apy * 100),
                                  tvl_cspr=round(total_stake_motes / 1e9 * 0.3), risk_score=0.40),
                        YieldRate(strategy="aggressive",   apy_bps=int(agg_apy * 100),
                                  tvl_cspr=1_200_000, risk_score=0.75),
                    ]
        except Exception as exc:
            __import__("logging").getLogger(__name__).warning(
                "Real yield rates fetch failed: %s", exc
            )

        return [
            YieldRate(strategy="conservative", apy_bps=810,  tvl_cspr=450_000, risk_score=0.15),
            YieldRate(strategy="balanced",     apy_bps=880,  tvl_cspr=900_000, risk_score=0.40),
            YieldRate(strategy="aggressive",   apy_bps=1450, tvl_cspr=300_000, risk_score=0.75),
        ]

