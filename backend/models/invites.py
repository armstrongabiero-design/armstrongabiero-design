"""Driver login invite models (48-hour set-password invites)."""
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional
from datetime import datetime, timezone
import uuid

from auth_service import validate_password_strength


INVITE_TTL_HOURS = 48


class DriverInvite(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    user_id: str
    email: str
    token: str
    status: str = "PENDING"  # PENDING | ACCEPTED | REVOKED
    invited_by: Optional[str] = None
    invited_by_name: Optional[str] = None
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resent_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None


class AcceptDriverInviteRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        validate_password_strength(v)
        return v
