"""
RWA Oracle — fetches Real-World Asset prices for the CasperYield AI agent.

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

COINGECKO_URL = "https://api.coingecko.com/api/v3/simple/price"
METALS_LIVE_URL = "https://api.metals.live/v1/spot/gold"

# Realistic 2026 baseline values used when external APIs are unreachable
_BASELINE_GOLD_USD    = 2_080.00
_BASELINE_TREASURY_10Y = 4.22


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
        gold_price = await self._fetch_gold_price()
        treasury   = _BASELINE_TREASURY_10Y + round(random.uniform(-0.08, 0.08), 2)
        oil        = round(78.4 + random.uniform(-2, 2), 2)

        assets = [
            RWAPrice(
                asset_id   = "PAXG",
                name       = "PAX Gold",
                category   = "Commodity",
                price_usd  = gold_price,
                yield_pct  = None,
                unit       = "USD / troy oz",
                change_pct = round(random.uniform(-0.8, 0.8), 2),
                source     = "CoinGecko",
                on_chain   = True,
                note       = "Tokenized gold — 1 PAXG = 1 troy oz of physical gold",
            ),
            RWAPrice(
                asset_id   = "UST10Y",
                name       = "US Treasury 10Y",
                category   = "Fixed Income",
                price_usd  = None,
                yield_pct  = treasury,
                unit       = "% per annum",
                change_pct = round(random.uniform(-0.05, 0.05), 3),
                source     = "Simulated (production: FRED API)",
                on_chain   = False,
                note       = "Risk-free rate baseline — DeFi must yield above this to justify risk",
            ),
            RWAPrice(
                asset_id   = "WTI",
                name       = "WTI Crude Oil",
                category   = "Energy",
                price_usd  = oil,
                yield_pct  = None,
                unit       = "USD / barrel",
                change_pct = round(random.uniform(-1.5, 1.5), 2),
                source     = "Simulated (production: EIA API)",
                on_chain   = False,
                note       = "Energy commodity — proxy for inflation pressure on DeFi yields",
            ),
        ]

        return [a.to_dict() for a in assets]

    async def _fetch_gold_price(self) -> float:
        # 1. Try CoinGecko for PAXG (tokenized gold — the actual on-chain RWA)
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(
                    COINGECKO_URL,
                    params={"ids": "pax-gold", "vs_currencies": "usd"},
                    headers={"Accept": "application/json"},
                )
                resp.raise_for_status()
                price = resp.json().get("pax-gold", {}).get("usd")
                if price:
                    logger.info("PAXG/USD from CoinGecko: $%.2f", price)
                    return float(price)
        except Exception as exc:
            logger.debug("CoinGecko PAXG fetch failed: %s", exc)

        # 2. Fallback: metals.live XAU spot
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(METALS_LIVE_URL)
                resp.raise_for_status()
                data = resp.json()
                price = data[0].get("gold") if isinstance(data, list) and data else None
                if price:
                    logger.info("XAU spot from metals.live: $%.2f", price)
                    return float(price)
        except Exception as exc:
            logger.debug("metals.live XAU fetch failed: %s", exc)

        # 3. Simulated baseline with small jitter
        simulated = round(_BASELINE_GOLD_USD + random.uniform(-40, 40), 2)
        logger.info("Using simulated gold price: $%.2f", simulated)
        return simulated
