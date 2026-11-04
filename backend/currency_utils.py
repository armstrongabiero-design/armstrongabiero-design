"""Exchange rates. Requests read an in-memory table; only a background job calls the rate source."""
import asyncio
import logging
import math
import os
from datetime import datetime, timezone
from typing import Any, Dict, Mapping

import requests
from pymongo.errors import DuplicateKeyError

from models import CurrencyEnum
from models.assets import ExchangeRate

logger = logging.getLogger(__name__)

RATES_URL = os.environ.get("EXCHANGE_RATES_URL", "https://theratesapi.com/api/latest/")
RATES_TIMEOUT_SECONDS = 10
# Costs are stored in USD permanently, so a wild value from the source must not be accepted.
MAX_RATE_CHANGE = 0.5
TRACKED_CURRENCIES = (CurrencyEnum.GHS, CurrencyEnum.LRD, CurrencyEnum.STN)

# Units per 1 USD, checked November 2026. Used only until a live or saved rate is available.
FALLBACK_PER_USD = {
    CurrencyEnum.GHS: 11.64,
    CurrencyEnum.LRD: 170.4,
    CurrencyEnum.STN: 21.92,
    CurrencyEnum.USD: 1.0,
}


class CurrencyConverter:
    def __init__(self):
        self._per_usd = dict(FALLBACK_PER_USD)
        self._as_of: Dict[str, str] = {}

    def get_rate(self, from_currency: CurrencyEnum, to_currency: CurrencyEnum = CurrencyEnum.USD) -> float:
        if from_currency == to_currency:
            return 1.0
        return self._per_usd[to_currency] / self._per_usd[from_currency]

    def convert(self, amount: float, from_currency: CurrencyEnum, to_currency: CurrencyEnum = CurrencyEnum.USD) -> float:
        return round(amount * self.get_rate(from_currency, to_currency), 2)

    def apply_rates(self, per_usd: Mapping[str, Any], as_of: str) -> list:
        """Store valid rates and return the currencies accepted."""
        accepted = []
        for currency in TRACKED_CURRENCIES:
            value = per_usd.get(currency.value)
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value <= 0:
                logger.warning("Ignoring invalid %s exchange rate", currency.value)
                continue
            current = self._per_usd[currency]
            if abs(value - current) / current > MAX_RATE_CHANGE:
                logger.warning("Ignoring %s rate %s: too far from %s", currency.value, value, current)
                continue
            self._per_usd[currency] = float(value)
            self._as_of[currency.value] = as_of
            accepted.append(currency)
        return accepted

    def status(self) -> Dict[str, Dict[str, Any]]:
        return {
            c.value: {
                "source": "live" if c.value in self._as_of else "fallback",
                "as_of": self._as_of.get(c.value),
            }
            for c in TRACKED_CURRENCIES
        }


currency_converter = CurrencyConverter()


def _fetch_live_rates() -> Dict[str, Any]:
    response = requests.get(
        RATES_URL,
        params={"base": "USD", "symbols": ",".join(c.value for c in TRACKED_CURRENCIES)},
        timeout=RATES_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()["rates"]


async def load_saved_rates(db) -> None:
    """Start from the last live rates so a restart does not fall back to the fixed table."""
    for currency in TRACKED_CURRENCIES:
        saved = await db.exchange_rates.find_one(
            {"from_currency": currency.value, "source": "live"},
            {"_id": 0, "rate": 1, "date": 1},
            sort=[("date", -1)],
        )
        if saved and saved.get("rate"):
            currency_converter.apply_rates({currency.value: 1 / saved["rate"]}, saved.get("date"))


async def refresh_rates(db) -> None:
    """Fetch live rates and keep one history row per currency per day, shared across workers."""
    try:
        rates = await asyncio.wait_for(asyncio.to_thread(_fetch_live_rates), RATES_TIMEOUT_SECONDS + 5)
    except (requests.RequestException, asyncio.TimeoutError, ValueError, KeyError, TypeError) as exc:
        logger.warning("Could not refresh exchange rates, keeping current ones: %s", type(exc).__name__)
        return

    now = datetime.now(timezone.utc)
    for currency in currency_converter.apply_rates(rates, now.isoformat()):
        record = ExchangeRate(
            from_currency=currency,
            rate=currency_converter.get_rate(currency, CurrencyEnum.USD),
            date=now,
        ).model_dump()
        record.update(_id=f"{currency.value}:{now.date().isoformat()}", source="live", date=now.isoformat())
        try:
            await db.exchange_rates.insert_one(record)
        except DuplicateKeyError:
            pass
