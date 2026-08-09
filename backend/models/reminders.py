"""Driver daily reminder settings and in-app notifications."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
import uuid

from pydantic import BaseModel, ConfigDict, Field


# ISO country → default IANA timezone (GMT / Accra for Ghana)
COUNTRY_TIMEZONES = {
    "GH": "Africa/Accra",
    "LR": "Africa/Monrovia",
    "ST": "Africa/Sao_Tome",
}


class DriverReminderCountrySettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    country: str
    enabled: bool = True
    timezone: str = "Africa/Accra"
    reminder_hour: int = 7
    reminder_minute: int = 0
    # Pre-trip: first at reminder time, then every N minutes up to max_count
    pretrip_repeat_minutes: int = 15
    pretrip_max_reminders: int = 4
    # Logbook: single reminder at start time only
    logbook_once: bool = True
    # Legacy field kept for UI compatibility; ignored by engine when pretrip slots used
    hourly_repeat_enabled: bool = False
    skip_non_working_days: bool = True
    # Monday=0 … Sunday=6
    working_days: List[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])


class DriverReminderSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    countries: List[DriverReminderCountrySettings] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_by: Optional[str] = None


class DriverReminderSettingsUpdate(BaseModel):
    countries: List[DriverReminderCountrySettings]


class DriverNotification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    user_id: Optional[str] = None
    country: Optional[str] = None
    title: str
    message: str
    notification_type: str = "DAILY_COMPLIANCE"
    is_read: bool = False
    local_date: str  # YYYY-MM-DD in country TZ
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def default_country_settings(country: str) -> DriverReminderCountrySettings:
    code = (country or "").upper()
    return DriverReminderCountrySettings(
        country=code,
        timezone=COUNTRY_TIMEZONES.get(code, "UTC"),
    )
