"""Authentication and User models"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator, model_validator
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import uuid

from auth_service import validate_password_strength

from .enums import UserRole


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    hashed_password: str
    full_name: str
    role: UserRole
    country: Optional[str] = None
    is_active: bool = True
    is_approved: bool = False
    approved_by: Optional[str] = None
    driver_id: Optional[str] = None
    token_version: int = Field(
        default=0,
        description="Incremented on password change to invalidate outstanding JWTs.",
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None


class UserCreate(BaseModel):
    """Admin / internal creation (any role). Prefer bootstrap or admin flows for privileged roles."""
    email: str
    password: str = Field(..., min_length=8)
    full_name: str
    role: UserRole
    country: Optional[str] = None
    driver_id: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class UserSelfRegister(BaseModel):
    """Public self-registration: USER, DRIVER, FLEET_MANAGER, or FLEET_OFFICER; awaits approval."""
    email: str
    password: str = Field(..., min_length=8)
    full_name: str
    country: Optional[str] = None
    driver_id: Optional[str] = None
    role: UserRole = UserRole.USER

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        validate_password_strength(v)
        return v

    @field_validator("role")
    @classmethod
    def self_register_roles_only(cls, v: UserRole) -> UserRole:
        allowed = (
            UserRole.USER,
            UserRole.DRIVER,
            UserRole.FLEET_MANAGER,
            UserRole.FLEET_OFFICER,
        )
        if v not in allowed:
            raise ValueError(
                "Self-registration is only allowed for User, Driver, Fleet Manager, or Fleet Officer roles"
            )
        return v

    @model_validator(mode="after")
    def staff_roles_require_country(self):
        if self.role in (UserRole.FLEET_MANAGER, UserRole.FLEET_OFFICER):
            if not self.country or not str(self.country).strip():
                raise ValueError(
                    "Country is required for Fleet Manager and Fleet Officer registration"
                )
        return self


class BootstrapGroupFleetManagerRequest(BaseModel):
    """First Group Fleet Manager when no GFM exists (requires BOOTSTRAP_TOKEN)."""
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class UserLogin(BaseModel):
    email: str
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_approved: Optional[bool] = None
    country: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str
    user: Dict[str, Any]


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        validate_password_strength(v)
        return v


class PasswordResetToken(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    token: str
    email: str
    expires_at: datetime
    used: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
