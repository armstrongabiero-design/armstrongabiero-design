from forex_python.converter import CurrencyRates
from datetime import datetime
import os
from models import CurrencyEnum


# Fallback rates (updated December 2025)
FALLBACK_RATES_TO_USD = {
    CurrencyEnum.GHS: 0.0645,  # 1 GHS = 0.0645 USD (15.5 GHS = 1 USD)
    CurrencyEnum.LRD: 0.0053,  # 1 LRD = 0.0053 USD (190 LRD = 1 USD)
    CurrencyEnum.STN: 0.0408,  # 1 STN = 0.0408 USD (24.5 STN = 1 USD)
    CurrencyEnum.USD: 1.0,
}

FALLBACK_RATES_FROM_USD = {
    CurrencyEnum.GHS: 15.5,   # 1 USD = 15.5 GHS
    CurrencyEnum.LRD: 190.0,  # 1 USD = 190 LRD
    CurrencyEnum.STN: 24.5,   # 1 USD = 24.5 STN
    CurrencyEnum.USD: 1.0,
}


class CurrencyConverter:
    def __init__(self):
        self.converter = CurrencyRates()
    
    def get_rate(self, from_currency: CurrencyEnum, to_currency: CurrencyEnum = CurrencyEnum.USD) -> float:
        """
        Get exchange rate from one currency to another
        """
        try:
            if from_currency == to_currency:
                return 1.0
            
            # Try to get live rate
            rate = self.converter.get_rate(from_currency.value, to_currency.value)
            return rate
        except Exception as e:
            print(f"Currency Rates Source Not Ready: {e}")
            # Fallback rates if API fails
            if to_currency == CurrencyEnum.USD:
                return FALLBACK_RATES_TO_USD.get(from_currency, 1.0)
            elif from_currency == CurrencyEnum.USD:
                return FALLBACK_RATES_FROM_USD.get(to_currency, 1.0)
            else:
                # Convert via USD
                to_usd = FALLBACK_RATES_TO_USD.get(from_currency, 1.0)
                from_usd = FALLBACK_RATES_FROM_USD.get(to_currency, 1.0)
                return to_usd * from_usd
    
    def convert(self, amount: float, from_currency: CurrencyEnum, to_currency: CurrencyEnum = CurrencyEnum.USD) -> float:
        """
        Convert amount from one currency to another
        """
        rate = self.get_rate(from_currency, to_currency)
        return round(amount * rate, 2)


currency_converter = CurrencyConverter()
