"""Vehicle location models"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid

from .enums import CountryEnum


class VehicleLocation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    latitude: float
    longitude: float
    address: Optional[str] = None
    city: Optional[str] = None
    country: CountryEnum
    speed_kmh: Optional[float] = None
    heading: Optional[float] = None
    source: str = "GPS"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    driver_id: Optional[str] = None


class VehicleLocationCreate(BaseModel):
    vehicle_id: str
    latitude: float
    longitude: float
    address: Optional[str] = None
    city: Optional[str] = None
    country: CountryEnum
    speed_kmh: Optional[float] = None
    heading: Optional[float] = None
    source: str = "MANUAL"
    driver_id: Optional[str] = None
