"""
RWA Oracle — fetches Real-World Asset prices for the Agent Casper agent.

Assets tracked:
  PAXG   — PAX Gold, an ERC-20 tokenized gold RWA (1 token = 1 troy oz of gold)
  XAU    — Gold spot price in USD (fallback via metals.live)
  UST10Y — US Treasury 10-year yield as the risk-free rate baseline
  OIL    — WTI crude oil (simulated, representative commodity RWA)

Why RWA matters for yield decisions:
  - Gold (PAXG) rising → flight-to-safety signal → prefer conservative allocation
  - Treasury yield > 5% → DeFi premium must be substantial to justify risk
  - Commodity inflation → real-yield erosion → consider rebalancing toward higher APY
"""

import logging
import random
from dataclasses import dataclass, asdict
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

COINGECKO_URL    = "https://api.coingecko.com/api/v3/simple/price"
METALS_LIVE_URL  = "https://api.metals.live/v1/spot/gold"
YAHOO_CHART_URL  = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
YAHOO_CHART_URL2 = "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
_YF_HEADERS      = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

# Fallback values used only when all APIs are unreachable (updated June 2026)
_BASELINE_GOLD_USD     = 4_300.00
_BASELINE_TREASURY_10Y = 4.50
_BASELINE_WTI          = 90.00


@dataclass
class RWAPrice:
    asset_id:   str
    name:       str
    category:   str           # "Commodity" | "Fixed Income" | "Energy"
    price_usd:  Optional[float]
    yield_pct:  Optional[float]
    unit:       str
    change_pct: Optional[float]
    source:     str
    on_chain:   bool          # whether a tokenized version exists on-chain
    note:       str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class RWAOracle:
    """
    Lightweight RWA price oracle.
    Primary: CoinGecko (PAXG tokenized gold)
    Fallback: metals.live XAU spot
    Simulated: Treasury yield + Oil
    """

    async def fetch_rwa_prices(self) -> list[dict]:
        gold_price, gold_change, gold_src = await self._fetch_gold_price()
        treasury_yld, treasury_chg, treasury_src = await self._fetch_treasury_10y()
        wti_price, wti_change, wti_src = await self._fetch_wti()

        assets = [
            RWAPrice(
                asset_id   = "PAXG",
                name       = "PAX Gold",
                category   = "Commodity",
                price_usd  = gold_price,
                yield_pct  = None,
                unit       = "USD / troy oz",
                change_pct = gold_change,
                source     = gold_src,
                on_chain   = True,
                note       = "Tokenized gold — 1 PAXG = 1 troy oz of physical gold",
            ),
            RWAPrice(
                asset_id   = "UST10Y",
                name       = "US Treasury 10Y",
                category   = "Fixed Income",
                price_usd  = None,
                yield_pct  = treasury_yld,
                unit       = "% per annum",
                change_pct = treasury_chg,
                source     = treasury_src,
                on_chain   = False,
                note       = "Risk-free rate baseline — DeFi must yield above this to justify risk",
            ),
            RWAPrice(
                asset_id   = "WTI",
                name       = "WTI Crude Oil",
                category   = "Energy",
                price_usd  = wti_price,
                yield_pct  = None,
                unit       = "USD / barrel",
                change_pct = wti_change,
                source     = wti_src,
                on_chain   = False,
                note       = "Energy commodity — proxy for inflation pressure on DeFi yields",
            ),
        ]

        return [a.to_dict() for a in assets]

    async def _fetch_gold_price(self) -> tuple[float, float, str]:
        """Returns (price_usd, change_pct, source)."""
        # 1. CoinGecko for PAXG
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(
                    COINGECKO_URL,
                    params={"ids": "pax-gold", "vs_currencies": "usd", "include_24hr_change": "true"},
                    headers={"Accept": "application/json"},
                )
                resp.raise_for_status()
                d = resp.json().get("pax-gold", {})
                price = d.get("usd")
                chg = round(d.get("usd_24h_change", 0.0), 2)
                if price:
                    logger.info("PAXG/USD from CoinGecko: $%.2f", price)
                    return float(price), chg, "CoinGecko"
        except Exception as exc:
            logger.debug("CoinGecko PAXG fetch failed: %s", exc)

        # 2. Yahoo Finance for gold futures (GC=F)
        try:
            async with httpx.AsyncClient(timeout=8, headers=_YF_HEADERS) as client:
                resp = await client.get(YAHOO_CHART_URL.format(symbol="GC%3DF") + "?range=2d&interval=1d")
                resp.raise_for_status()
                meta = resp.json()["chart"]["result"][0]["meta"]
                price = meta["regularMarketPrice"]
                prev  = meta.get("chartPreviousClose", price)
                chg   = round((price - prev) / prev * 100, 2) if prev else 0.0
                logger.info("XAU from Yahoo Finance: $%.2f", price)
                return float(price), chg, "Yahoo Finance (GC=F)"
        except Exception as exc:
            logger.debug("Yahoo Finance gold fetch failed: %s", exc)

        # 3. metals.live
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(METALS_LIVE_URL)
                resp.raise_for_status()
                data = resp.json()
                price = data[0].get("gold") if isinstance(data, list) and data else None
                if price:
                    logger.info("XAU spot from metals.live: $%.2f", price)
                    return float(price), 0.0, "metals.live"
        except Exception as exc:
            logger.debug("metals.live XAU fetch failed: %s", exc)

        # Last resort: use Yahoo Finance v8 direct
        try:
            async with httpx.AsyncClient(timeout=6, headers=_YF_HEADERS, follow_redirects=True) as client:
                resp = await client.get("https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?range=1d&interval=1d")
                if resp.status_code == 200:
                    meta = resp.json()["chart"]["result"][0]["meta"]
                    price = float(meta["regularMarketPrice"])
                    logger.info("XAU from Yahoo v8 fallback: $%.2f", price)
                    return price, 0.0, "Yahoo Finance (GC=F)"
        except Exception:
            pass

        simulated = round(_BASELINE_GOLD_USD + random.uniform(-40, 40), 2)
        logger.info("Using simulated gold price: $%.2f", simulated)
        return simulated, 0.0, "Simulated fallback"

    async def _fetch_treasury_10y(self) -> tuple[float, float, str]:
        """Returns (yield_pct, change_pct, source). Uses Yahoo Finance ^TNX with fallbacks."""
        for base_url in [YAHOO_CHART_URL, YAHOO_CHART_URL2]:
            try:
                url = base_url.format(symbol="%5ETNX") + "?range=2d&interval=1d"
                async with httpx.AsyncClient(timeout=10, headers=_YF_HEADERS, follow_redirects=True) as client:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        meta = resp.json()["chart"]["result"][0]["meta"]
                        yld  = round(float(meta["regularMarketPrice"]), 3)
                        prev = meta.get("chartPreviousClose", yld)
                        chg  = round(yld - prev, 3) if prev else 0.0
                        logger.info("UST10Y from Yahoo Finance: %.3f%%", yld)
                        return yld, chg, "Yahoo Finance (^TNX)"
            except Exception as exc:
                logger.debug("Yahoo Finance UST10Y fetch failed (%s): %s", base_url, exc)

        fallback = round(_BASELINE_TREASURY_10Y + random.uniform(-0.08, 0.08), 3)
        return fallback, 0.0, "Simulated fallback"

    async def _fetch_wti(self) -> tuple[float, float, str]:
        """Returns (price_usd, change_pct, source). Uses Yahoo Finance CL=F with fallbacks."""
        for base_url in [YAHOO_CHART_URL, YAHOO_CHART_URL2]:
            try:
                url = base_url.format(symbol="CL%3DF") + "?range=2d&interval=1d"
                async with httpx.AsyncClient(timeout=10, headers=_YF_HEADERS, follow_redirects=True) as client:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        meta = resp.json()["chart"]["result"][0]["meta"]
                        price = round(float(meta["regularMarketPrice"]), 2)
                        prev  = meta.get("chartPreviousClose", price)
                        chg   = round((price - prev) / prev * 100, 2) if prev else 0.0
                        logger.info("WTI from Yahoo Finance: $%.2f", price)
                        return price, chg, "Yahoo Finance (CL=F)"
            except Exception as exc:
                logger.debug("Yahoo Finance WTI fetch failed (%s): %s", base_url, exc)

        fallback = round(_BASELINE_WTI + random.uniform(-2, 2), 2)
        return fallback, 0.0, "Simulated fallback"
