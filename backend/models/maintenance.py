"""Maintenance models"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from .enums import (
    MaintenanceType, WorkshopType, CurrencyEnum, CountryEnum,
    RequestStatus, RequestPriority, ChecklistItemStatus,
)


class MaintenanceRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    maintenance_type: MaintenanceType
    description: str
    scheduled_date: datetime
    completed_date: Optional[datetime] = None
    odometer_at_maintenance: float
    cost: float
    currency: CurrencyEnum
    cost_usd: float
    workshop_id: Optional[str] = None
    parts_used: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    ai_predicted: bool = False
    harshness_score: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MaintenanceRecordCreate(BaseModel):
    vehicle_id: str
    maintenance_type: MaintenanceType
    description: str
    scheduled_date: datetime
    odometer_at_maintenance: float
    cost: float
    currency: CurrencyEnum
    workshop_id: Optional[str] = None
    notes: Optional[str] = None


class WorkshopJob(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    workshop_type: WorkshopType
    workshop_name: str
    description: str
    start_date: datetime
    estimated_completion: datetime
    actual_completion: Optional[datetime] = None
    cost: float
    currency: CurrencyEnum
    cost_usd: float
    status: str = "IN_PROGRESS"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class WorkshopJobCreate(BaseModel):
    vehicle_id: str
    workshop_type: WorkshopType
    workshop_name: str
    description: str
    start_date: datetime
    estimated_completion: datetime
    cost: float
    currency: CurrencyEnum


class MaintenanceRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    driver_id: str
    request_type: str
    description: str
    priority: RequestPriority = RequestPriority.MEDIUM
    estimated_cost: Optional[float] = None
    currency: CurrencyEnum = CurrencyEnum.GHS
    status: RequestStatus = RequestStatus.PENDING
    manager_id: Optional[str] = None
    rejection_reason: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    submitted_by_id: Optional[str] = None
    submitted_by_name: Optional[str] = None
    submitted_by_role: Optional[str] = None
    approved_by_id: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_by_role: Optional[str] = None
    rejected_by_id: Optional[str] = None
    rejected_by_name: Optional[str] = None
    rejected_by_role: Optional[str] = None
    country: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MaintenanceRequestCreate(BaseModel):
    vehicle_id: str
    driver_id: str
    request_type: str
    description: str
    priority: RequestPriority = RequestPriority.MEDIUM
    estimated_cost: Optional[float] = None
    currency: CurrencyEnum = CurrencyEnum.GHS
    country: Optional[str] = None


class MaintenanceRequestApproval(BaseModel):
    manager_id: str
    approved: bool
    rejection_reason: Optional[str] = None


class ChecklistItem(BaseModel):
    item_name: str
    status: ChecklistItemStatus
    notes: Optional[str] = None


class PreTripChecklist(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    vehicle_id: str
    date: datetime
    checklist_items: List[ChecklistItem] = Field(default_factory=list)
    damage_photos: List[str] = Field(default_factory=list)
    overall_status: str = "PENDING"
    completed: bool = False
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PreTripChecklistCreate(BaseModel):
    driver_id: str
    vehicle_id: str
    engine_oil: ChecklistItemStatus
    engine_oil_notes: Optional[str] = None
    tires: ChecklistItemStatus
    tires_notes: Optional[str] = None
    brakes: ChecklistItemStatus
    brakes_notes: Optional[str] = None
    lights: ChecklistItemStatus
    lights_notes: Optional[str] = None
    fuel_level: ChecklistItemStatus
    fuel_level_notes: Optional[str] = None
    mirrors_wipers: ChecklistItemStatus
    mirrors_wipers_notes: Optional[str] = None
    cleanliness_damage: ChecklistItemStatus
    cleanliness_damage_notes: Optional[str] = None
    damage_photos: List[str] = Field(default_factory=list)
    additional_notes: Optional[str] = None


class FleetManager(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    phone: str
    country: CountryEnum
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FleetManagerCreate(BaseModel):
    name: str
    email: str
    phone: str
    country: CountryEnum
