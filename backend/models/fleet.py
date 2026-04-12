"""Fleet models: Country, Vehicle, Driver"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime
import uuid

from .enums import CountryEnum, CurrencyEnum, VehicleStatus


class Country(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: CountryEnum
    currency: CurrencyEnum
    date_format: str = "DD/MM/YYYY"
    tax_id_label: str
    regulatory_body: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CountryCreate(BaseModel):
    name: CountryEnum
    currency: CurrencyEnum
    date_format: str = "DD/MM/YYYY"
    tax_id_label: str
    regulatory_body: str


class Vehicle(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    country: CountryEnum
    registration_number: str
    make: str
    model: str
    year: int
    vin: str
    status: VehicleStatus = VehicleStatus.ACTIVE
    odometer_reading: float = 0.0
    acquisition_date: datetime
    acquisition_cost: float
    acquisition_currency: CurrencyEnum
    acquisition_cost_usd: float
    country_specific_fields: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class VehicleCreate(BaseModel):
    country: CountryEnum
    registration_number: str
    make: str
    model: str
    year: int
    vin: str
    status: VehicleStatus = VehicleStatus.ACTIVE
    odometer_reading: float = 0.0
    acquisition_date: datetime
    acquisition_cost: float
    acquisition_currency: CurrencyEnum
    country_specific_fields: Dict[str, Any] = Field(default_factory=dict)


class VehicleUpdate(BaseModel):
    registration_number: Optional[str] = None
    status: Optional[VehicleStatus] = None
    odometer_reading: Optional[float] = None
    country_specific_fields: Optional[Dict[str, Any]] = None


class Driver(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    country: CountryEnum
    first_name: str
    last_name: str
    license_number: str
    license_expiry: datetime
    phone: str
    email: Optional[str] = None
    safety_score: float = 100.0
    total_incidents: int = 0
    status: str = "ACTIVE"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class DriverCreate(BaseModel):
    country: CountryEnum
    first_name: str
    last_name: str
    license_number: str
    license_expiry: datetime
    phone: str
    email: Optional[str] = None


class DriverUpdate(BaseModel):
    license_expiry: Optional[datetime] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    safety_score: Optional[float] = None
    status: Optional[str] = None
