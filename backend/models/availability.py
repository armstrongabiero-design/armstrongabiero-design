"""Vehicle availability status change and daily snapshot models."""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, timezone, date
from enum import Enum
import uuid

from .enums import CountryCode, VehicleStatus


class AvailabilityReason(str, Enum):
    MAINTENANCE = "MAINTENANCE"
    ACCIDENT_DAMAGE = "ACCIDENT_DAMAGE"
    AWAITING_PARTS = "AWAITING_PARTS"
    DRIVER_UNAVAILABLE = "DRIVER_UNAVAILABLE"
    REGULATORY_HOLD = "REGULATORY_HOLD"
    SEASONAL_PARKED = "SEASONAL_PARKED"
    OTHER = "OTHER"


AVAILABILITY_REASON_LABELS = {
    AvailabilityReason.MAINTENANCE.value: "Maintenance / workshop",
    AvailabilityReason.ACCIDENT_DAMAGE.value: "Accident / damage",
    AvailabilityReason.AWAITING_PARTS.value: "Awaiting parts",
    AvailabilityReason.DRIVER_UNAVAILABLE.value: "Driver unavailable",
    AvailabilityReason.REGULATORY_HOLD.value: "Regulatory / compliance hold",
    AvailabilityReason.SEASONAL_PARKED.value: "Seasonal / parked",
    AvailabilityReason.OTHER.value: "Other",
}


class VehicleAvailabilityUpdate(BaseModel):
    status: VehicleStatus
    reason: Optional[AvailabilityReason] = None
    notes: Optional[str] = None


class VehicleAvailabilityEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    country: CountryCode
    previous_status: Optional[str] = None
    new_status: str
    reason: Optional[str] = None
    notes: Optional[str] = None
    changed_by: Optional[str] = None
    changed_by_email: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VehicleAvailabilitySnapshot(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    snapshot_date: str  # YYYY-MM-DD UTC
    country: Optional[str] = None  # None = fleet-wide rollup row; also store per-country
    total: int = 0
    active: int = 0
    inactive: int = 0
    maintenance: int = 0
    available: int = 0  # ACTIVE (= not-down)
    availability_pct: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
