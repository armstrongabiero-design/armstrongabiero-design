"""Operations models: Fuel, Expenditure, Inventory, Logbook"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid

from .enums import CurrencyEnum, CountryEnum, TransactionType


class FuelTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    driver_id: str
    date: datetime
    quantity_liters: float
    cost: float
    currency: CurrencyEnum
    cost_usd: float
    odometer_reading: float
    fuel_efficiency: Optional[float] = None
    location: str
    anomaly_detected: bool = False
    anomaly_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class FuelTransactionCreate(BaseModel):
    vehicle_id: str
    driver_id: str
    date: datetime
    quantity_liters: float
    cost: float
    currency: CurrencyEnum
    odometer_reading: float
    location: str


class Expenditure(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    country: CountryEnum
    category: str
    description: str
    amount: float
    currency: CurrencyEnum
    amount_usd: float
    date: datetime
    vehicle_id: Optional[str] = None
    driver_id: Optional[str] = None
    receipt_url: Optional[str] = None
    approved: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ExpenditureCreate(BaseModel):
    country: CountryEnum
    category: str
    description: str
    amount: float
    currency: CurrencyEnum
    date: datetime
    vehicle_id: Optional[str] = None
    driver_id: Optional[str] = None
    receipt_url: Optional[str] = None


class InventoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    sku: str
    category: str
    country: CountryEnum
    location: str
    quantity: int = 0
    reorder_level: int = 10
    unit_cost: float
    currency: CurrencyEnum
    unit_cost_usd: float
    lead_time_days: int = 7
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class InventoryItemCreate(BaseModel):
    name: str
    sku: str
    category: str
    country: CountryEnum
    location: str
    quantity: int = 0
    reorder_level: int = 10
    unit_cost: float
    currency: CurrencyEnum
    lead_time_days: int = 7


class InventoryTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_id: str
    transaction_type: TransactionType
    quantity: int
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class InventoryTransactionCreate(BaseModel):
    item_id: str
    transaction_type: TransactionType
    quantity: int
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class LogbookEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    vehicle_id: str
    country: Optional[str] = None
    date: datetime
    start_time: datetime
    end_time: Optional[datetime] = None
    start_location: str
    end_location: Optional[str] = None
    start_odometer: float
    end_odometer: Optional[float] = None
    distance_km: Optional[float] = None
    purpose: str
    fuel_used_liters: Optional[float] = None
    average_speed_kmh: Optional[float] = None
    max_speed_kmh: Optional[float] = None
    speed_limit_violations: int = 0
    harsh_braking_events: int = 0
    harsh_acceleration_events: int = 0
    idle_time_minutes: int = 0
    notes: Optional[str] = None
    synced: bool = True
    submitted_by_id: Optional[str] = None
    submitted_by_name: Optional[str] = None
    submitted_by_role: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LogbookEntryCreate(BaseModel):
    driver_id: str
    vehicle_id: str
    country: Optional[str] = None
    date: datetime
    start_time: datetime
    end_time: Optional[datetime] = None
    start_location: str
    end_location: Optional[str] = None
    start_odometer: float
    end_odometer: Optional[float] = None
    purpose: str
    fuel_used_liters: Optional[float] = None
    average_speed_kmh: Optional[float] = None
    max_speed_kmh: Optional[float] = None
    speed_limit_violations: int = 0
    harsh_braking_events: int = 0
    harsh_acceleration_events: int = 0
    idle_time_minutes: int = 0
    notes: Optional[str] = None
