"""Tire management models"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict
from datetime import datetime, timezone
import uuid

from .enums import TirePosition, TireStatus, CountryCode, CurrencyEnum


class Tire(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    serial_number: str
    brand: str
    model: str
    size: str
    vehicle_id: Optional[str] = None
    position: Optional[TirePosition] = None
    status: TireStatus = TireStatus.SPARE
    country: CountryCode
    purchase_date: datetime
    purchase_cost: float
    currency: CurrencyEnum
    mileage_at_install: Optional[float] = None
    current_mileage: Optional[float] = None
    max_mileage: float = 80000
    tread_depth_mm: Optional[float] = None
    min_tread_depth: float = 1.6
    last_rotation_date: Optional[datetime] = None
    next_rotation_due: Optional[datetime] = None
    rotation_interval_km: float = 10000
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TireCreate(BaseModel):
    serial_number: str
    brand: str
    model: str
    size: str
    vehicle_id: Optional[str] = None
    position: Optional[TirePosition] = None
    country: CountryCode
    purchase_date: datetime
    purchase_cost: float
    currency: CurrencyEnum
    mileage_at_install: Optional[float] = None
    tread_depth_mm: Optional[float] = None
    notes: Optional[str] = None


class TireUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    serial_number: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    size: Optional[str] = None
    vehicle_id: Optional[str] = None
    position: Optional[TirePosition] = None
    status: Optional[TireStatus] = None
    country: Optional[CountryCode] = None
    purchase_date: Optional[datetime] = None
    purchase_cost: Optional[float] = None
    currency: Optional[CurrencyEnum] = None
    mileage_at_install: Optional[float] = None
    current_mileage: Optional[float] = None
    max_mileage: Optional[float] = None
    tread_depth_mm: Optional[float] = None
    min_tread_depth: Optional[float] = None
    last_rotation_date: Optional[datetime] = None
    next_rotation_due: Optional[datetime] = None
    rotation_interval_km: Optional[float] = None
    notes: Optional[str] = None


class TireRotation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    rotation_date: datetime
    odometer_reading: float
    rotations: List[Dict[str, str]]
    performed_by: str
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TireRotationCreate(BaseModel):
    vehicle_id: str
    rotation_date: datetime
    odometer_reading: float
    rotations: List[Dict[str, str]]
    performed_by: str
    notes: Optional[str] = None
