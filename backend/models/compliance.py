"""Compliance, Document, Safety, and Alert models"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime, timezone
import uuid

from .enums import CountryCode, CurrencyEnum, DocumentType, ComplianceStatus


class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    country: CountryCode
    document_type: DocumentType
    entity_id: str
    entity_type: str
    document_number: str
    issue_date: datetime
    expiry_date: datetime
    file_url: str = ""
    s3_key: Optional[str] = None
    original_filename: Optional[str] = None
    content_type: Optional[str] = None
    ocr_processed: bool = False
    ocr_data: Optional[Dict[str, Any]] = None
    validated: bool = False
    validation_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DocumentCreate(BaseModel):
    country: CountryCode
    document_type: DocumentType
    entity_id: str
    entity_type: str
    document_number: str
    issue_date: datetime
    expiry_date: datetime
    file_url: str = ""


class DocumentUpdate(BaseModel):
    country: Optional[CountryCode] = None
    document_type: Optional[DocumentType] = None
    entity_id: Optional[str] = None
    entity_type: Optional[str] = None
    document_number: Optional[str] = None
    issue_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    file_url: Optional[str] = None


class SafetyIncident(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    vehicle_id: str
    incident_date: datetime
    incident_type: str
    severity: str
    description: str
    location: str
    cost: Optional[float] = None
    currency: Optional[CurrencyEnum] = None
    cost_usd: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SafetyIncidentCreate(BaseModel):
    driver_id: str
    vehicle_id: str
    incident_date: datetime
    incident_type: str
    severity: str
    description: str
    location: str
    cost: Optional[float] = None
    currency: Optional[CurrencyEnum] = None


class SafetyIncidentUpdate(BaseModel):
    driver_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    incident_date: Optional[datetime] = None
    incident_type: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    cost: Optional[float] = None
    currency: Optional[CurrencyEnum] = None


class Alert(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    alert_type: str
    severity: str
    title: str
    message: str
    entity_type: str
    entity_id: str
    country: CountryCode
    is_read: bool = False
    is_resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ComplianceCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_type: str
    entity_id: str
    country: CountryCode
    check_type: str
    status: ComplianceStatus
    expiry_date: Optional[datetime] = None
    days_until_expiry: Optional[int] = None
    document_id: Optional[str] = None
    notes: Optional[str] = None
    last_checked: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
