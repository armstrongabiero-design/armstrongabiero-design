"""Vendor models"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid

from .enums import VendorCategory, CountryCode, CurrencyEnum


class Vendor(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: VendorCategory
    country: CountryCode
    address: str
    city: str
    contact_person: str
    phone: str
    email: Optional[str] = None
    tax_id: Optional[str] = None
    payment_terms: str = "NET30"
    is_preferred: bool = False
    is_active: bool = True
    rating: Optional[float] = None
    total_transactions: int = 0
    total_spent: float = 0
    currency: CurrencyEnum
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VendorCreate(BaseModel):
    name: str
    category: VendorCategory
    country: CountryCode
    address: str
    city: str
    contact_person: str
    phone: str
    email: Optional[str] = None
    tax_id: Optional[str] = None
    payment_terms: str = "NET30"
    is_preferred: bool = False
    currency: CurrencyEnum
    notes: Optional[str] = None


class VendorUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = None
    category: Optional[VendorCategory] = None
    country: Optional[CountryCode] = None
    address: Optional[str] = None
    city: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tax_id: Optional[str] = None
    payment_terms: Optional[str] = None
    is_preferred: Optional[bool] = None
    is_active: Optional[bool] = None
    rating: Optional[float] = None
    total_transactions: Optional[int] = None
    total_spent: Optional[float] = None
    currency: Optional[CurrencyEnum] = None
    notes: Optional[str] = None
