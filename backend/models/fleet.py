"""Fleet models: Country, Vehicle, Driver"""
import re

from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, Dict, Any
from datetime import datetime
import uuid

from .enums import CountryCode, CurrencyEnum, VehicleStatus

LABEL_MAX_LENGTH = 60


def clean_label(value: Optional[str], *, upper: bool = False) -> Optional[str]:
    """Tidy a short free-text label such as a department or licence class.

    Blank input becomes "" so an update can clear the field; None stays None.
    """
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()[:LABEL_MAX_LENGTH]
    return text.upper() if upper else text


class _LabelFields(BaseModel):
    @field_validator("department", check_fields=False)
    @classmethod
    def _clean_department(cls, value):
        return clean_label(value)

    @field_validator("license_class", check_fields=False)
    @classmethod
    def _clean_license_class(cls, value):
        return clean_label(value, upper=True)


class Country(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: CountryCode
    currency: CurrencyEnum
    date_format: str = "DD/MM/YYYY"
    tax_id_label: str
    regulatory_body: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CountryCreate(BaseModel):
    name: CountryCode
    currency: CurrencyEnum
    date_format: str = "DD/MM/YYYY"
    tax_id_label: str
    regulatory_body: str


class Vehicle(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    country: CountryCode
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
    # Extended Fleet Master Data fields (aligned with Vehicle Master template)
    master_fields: Dict[str, Any] = Field(default_factory=dict)
    department: Optional[str] = None
    availability_reason: Optional[str] = None
    availability_notes: Optional[str] = None
    availability_changed_at: Optional[datetime] = None
    availability_changed_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class VehicleCreate(_LabelFields):
    country: CountryCode
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
    master_fields: Dict[str, Any] = Field(default_factory=dict)
    department: Optional[str] = None


class VehicleUpdate(_LabelFields):
    country: Optional[CountryCode] = None
    registration_number: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    vin: Optional[str] = None
    status: Optional[VehicleStatus] = None
    odometer_reading: Optional[float] = None
    acquisition_date: Optional[datetime] = None
    acquisition_cost: Optional[float] = None
    acquisition_currency: Optional[CurrencyEnum] = None
    country_specific_fields: Optional[Dict[str, Any]] = None
    master_fields: Optional[Dict[str, Any]] = None
    department: Optional[str] = None


class Driver(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    country: CountryCode
    first_name: str
    last_name: str
    license_number: str
    license_expiry: datetime
    phone: str
    email: Optional[str] = None
    license_class: Optional[str] = None
    department: Optional[str] = None
    safety_score: float = 100.0
    total_incidents: int = 0
    status: str = "ACTIVE"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class DriverCreate(_LabelFields):
    country: CountryCode
    first_name: str
    last_name: str
    license_number: str
    license_expiry: datetime
    phone: str
    email: Optional[str] = None
    license_class: Optional[str] = None
    department: Optional[str] = None


class DriverUpdate(_LabelFields):
    country: Optional[CountryCode] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    license_number: Optional[str] = None
    license_expiry: Optional[datetime] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    license_class: Optional[str] = None
    department: Optional[str] = None
    safety_score: Optional[float] = None
    status: Optional[str] = None
