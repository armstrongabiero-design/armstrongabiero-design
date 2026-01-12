from forex_python.converter import CurrencyRates
from datetime import datetime
import os
from models import CurrencyEnum


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
            
            rate = self.converter.get_rate(from_currency.value, to_currency.value)
            return rate
        except Exception as e:
            print(f"Error fetching exchange rate: {e}")
            # Fallback rates if API fails
            fallback_rates = {
                CurrencyEnum.GHS: 15.5,  # GHS to USD
                CurrencyEnum.LRD: 190.0,  # LRD to USD
                CurrencyEnum.STN: 24.5,   # STN to USD
                CurrencyEnum.USD: 1.0,
            }
            return 1.0 / fallback_rates.get(from_currency, 1.0)
    
    def convert(self, amount: float, from_currency: CurrencyEnum, to_currency: CurrencyEnum = CurrencyEnum.USD) -> float:
        """
        Convert amount from one currency to another
        """
        rate = self.get_rate(from_currency, to_currency)
        return round(amount * rate, 2)


currency_converter = CurrencyConverter()
