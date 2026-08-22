"""Maintenance models"""
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from .enums import (
    MaintenanceType, WorkshopType, CurrencyEnum, CountryCode,
    RequestStatus, RequestPriority, ChecklistItemStatus, WorkStatus,
)


def _require_etc_datetime(work_status: Optional[WorkStatus], etc_datetime: Optional[datetime]) -> None:
    if work_status == WorkStatus.ETC and etc_datetime is None:
        raise ValueError("ETC datetime is required when Work Status is Estimated Time of Completion (ETC)")


class MaintenanceRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    maintenance_type: MaintenanceType
    description: str
    scheduled_date: datetime
    completed_date: Optional[datetime] = None
    next_due_date: Optional[datetime] = None
    next_service_odometer: Optional[float] = None
    odometer_at_maintenance: float
    cost: float
    currency: CurrencyEnum
    cost_usd: float
    workshop_id: Optional[str] = None
    parts_used: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    work_status: WorkStatus = WorkStatus.WORK_IN_PROGRESS
    etc_datetime: Optional[datetime] = None
    ai_predicted: bool = False
    harshness_score: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MaintenanceRecordCreate(BaseModel):
    vehicle_id: str
    maintenance_type: MaintenanceType
    description: str
    scheduled_date: datetime
    next_due_date: Optional[datetime] = None
    next_service_odometer: Optional[float] = None
    odometer_at_maintenance: float
    cost: float
    currency: CurrencyEnum
    workshop_id: Optional[str] = None
    notes: Optional[str] = None
    work_status: WorkStatus = WorkStatus.WORK_IN_PROGRESS
    etc_datetime: Optional[datetime] = None

    @model_validator(mode="after")
    def validate_etc(self):
        _require_etc_datetime(self.work_status, self.etc_datetime)
        return self


class MaintenanceRecordUpdate(BaseModel):
    vehicle_id: Optional[str] = None
    maintenance_type: Optional[MaintenanceType] = None
    description: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    completed_date: Optional[datetime] = None
    next_due_date: Optional[datetime] = None
    next_service_odometer: Optional[float] = None
    odometer_at_maintenance: Optional[float] = None
    cost: Optional[float] = None
    currency: Optional[CurrencyEnum] = None
    workshop_id: Optional[str] = None
    notes: Optional[str] = None
    work_status: Optional[WorkStatus] = None
    etc_datetime: Optional[datetime] = None


class WorkshopMaster(BaseModel):
    """Master Data workshop / garage."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    workshop_type: WorkshopType = WorkshopType.INTERNAL
    country: CountryCode
    address: Optional[str] = None
    phone: Optional[str] = None
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkshopMasterCreate(BaseModel):
    name: str
    workshop_type: WorkshopType = WorkshopType.INTERNAL
    country: CountryCode
    address: Optional[str] = None
    phone: Optional[str] = None
    active: bool = True


class WorkshopMasterUpdate(BaseModel):
    name: Optional[str] = None
    workshop_type: Optional[WorkshopType] = None
    country: Optional[CountryCode] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    active: Optional[bool] = None


class WorkshopJob(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    workshop_type: WorkshopType
    workshop_name: str
    workshop_id: Optional[str] = None
    maintenance_record_id: Optional[str] = None
    description: str
    start_date: datetime
    estimated_completion: datetime
    actual_completion: Optional[datetime] = None
    cost: float
    currency: CurrencyEnum
    cost_usd: float
    work_status: WorkStatus = WorkStatus.WORK_IN_PROGRESS
    etc_datetime: Optional[datetime] = None
    status: str = "IN_PROGRESS"  # legacy mirror of work_status for old clients
    created_at: datetime = Field(default_factory=datetime.utcnow)


class WorkshopJobCreate(BaseModel):
    vehicle_id: str
    workshop_type: WorkshopType
    workshop_name: str
    workshop_id: Optional[str] = None
    maintenance_record_id: Optional[str] = None
    description: str
    start_date: datetime
    estimated_completion: datetime
    cost: float
    currency: CurrencyEnum
    work_status: WorkStatus = WorkStatus.WORK_IN_PROGRESS
    etc_datetime: Optional[datetime] = None

    @model_validator(mode="after")
    def validate_etc(self):
        _require_etc_datetime(self.work_status, self.etc_datetime)
        return self


class WorkshopJobUpdate(BaseModel):
    vehicle_id: Optional[str] = None
    workshop_type: Optional[WorkshopType] = None
    workshop_name: Optional[str] = None
    workshop_id: Optional[str] = None
    maintenance_record_id: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    estimated_completion: Optional[datetime] = None
    actual_completion: Optional[datetime] = None
    cost: Optional[float] = None
    currency: Optional[CurrencyEnum] = None
    work_status: Optional[WorkStatus] = None
    etc_datetime: Optional[datetime] = None


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
    work_status: WorkStatus = WorkStatus.WORK_IN_PROGRESS
    etc_datetime: Optional[datetime] = None
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
    work_status: WorkStatus = WorkStatus.WORK_IN_PROGRESS
    etc_datetime: Optional[datetime] = None

    @model_validator(mode="after")
    def validate_etc(self):
        _require_etc_datetime(self.work_status, self.etc_datetime)
        return self


class MaintenanceRequestUpdate(BaseModel):
    vehicle_id: Optional[str] = None
    driver_id: Optional[str] = None
    request_type: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[RequestPriority] = None
    estimated_cost: Optional[float] = None
    currency: Optional[CurrencyEnum] = None
    country: Optional[str] = None
    work_status: Optional[WorkStatus] = None
    etc_datetime: Optional[datetime] = None


class MaintenanceRequestApproval(BaseModel):
    manager_id: str
    approved: bool
    rejection_reason: Optional[str] = None


class ChecklistItem(BaseModel):
    item_name: str
    status: ChecklistItemStatus
    notes: Optional[str] = None
    resolution_status: Optional[str] = None  # OPEN | IN_PROGRESS | RESOLVED


class PreTripIssueResolutionUpdate(BaseModel):
    item_name: str
    resolution_status: str  # OPEN | IN_PROGRESS | RESOLVED


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
    driver_name: Optional[str] = None  # enriched on read
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


class PreTripChecklistUpdate(BaseModel):
    driver_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    engine_oil: Optional[ChecklistItemStatus] = None
    engine_oil_notes: Optional[str] = None
    tires: Optional[ChecklistItemStatus] = None
    tires_notes: Optional[str] = None
    brakes: Optional[ChecklistItemStatus] = None
    brakes_notes: Optional[str] = None
    lights: Optional[ChecklistItemStatus] = None
    lights_notes: Optional[str] = None
    fuel_level: Optional[ChecklistItemStatus] = None
    fuel_level_notes: Optional[str] = None
    mirrors_wipers: Optional[ChecklistItemStatus] = None
    mirrors_wipers_notes: Optional[str] = None
    cleanliness_damage: Optional[ChecklistItemStatus] = None
    cleanliness_damage_notes: Optional[str] = None
    damage_photos: Optional[List[str]] = None
    additional_notes: Optional[str] = None


class FleetManager(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str
    phone: str
    country: CountryCode
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FleetManagerCreate(BaseModel):
    name: str
    email: str
    phone: str
    country: CountryCode
