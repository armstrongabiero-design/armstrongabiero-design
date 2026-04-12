"""Asset, ExchangeRate, AIPrediction, TCO models"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime
import uuid

from .enums import CurrencyEnum, CountryEnum


class Asset(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    acquisition_date: datetime
    acquisition_cost: float
    currency: CurrencyEnum
    acquisition_cost_usd: float
    current_value: float
    current_value_usd: float
    depreciation_rate: float = 0.15
    disposal_date: Optional[datetime] = None
    disposal_value: Optional[float] = None
    predicted_resale_value: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AssetCreate(BaseModel):
    vehicle_id: str
    acquisition_date: datetime
    acquisition_cost: float
    currency: CurrencyEnum
    depreciation_rate: float = 0.15


class ExchangeRate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_currency: CurrencyEnum
    to_currency: CurrencyEnum = CurrencyEnum.USD
    rate: float
    date: datetime = Field(default_factory=datetime.utcnow)


class ExchangeRateCreate(BaseModel):
    from_currency: CurrencyEnum
    to_currency: CurrencyEnum = CurrencyEnum.USD
    rate: float


class AIPrediction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    prediction_type: str
    entity_id: str
    entity_type: str
    prediction_data: Dict[str, Any]
    confidence_score: float
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AIPredictionCreate(BaseModel):
    prediction_type: str
    entity_id: str
    entity_type: str
    prediction_data: Dict[str, Any]
    confidence_score: float


class TCORecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    vehicle_id: str
    period_start: datetime
    period_end: datetime
    fuel_cost: float = 0
    maintenance_cost: float = 0
    tire_cost: float = 0
    insurance_cost: float = 0
    license_fees: float = 0
    depreciation: float = 0
    other_costs: float = 0
    total_cost: float = 0
    total_distance_km: float = 0
    total_trips: int = 0
    total_hours: float = 0
    utilization_rate: float = 0
    cost_per_km: float = 0
    cost_per_trip: float = 0
    currency: CurrencyEnum
    country: CountryEnum
