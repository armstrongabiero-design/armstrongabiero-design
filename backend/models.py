from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from enum import Enum
import uuid


class CountryEnum(str, Enum):
    GHANA = "GHANA"
    LIBERIA = "LIBERIA"
    SAO_TOME = "SAO_TOME"


class CurrencyEnum(str, Enum):
    GHS = "GHS"
    LRD = "LRD"
    USD = "USD"
    STN = "STN"


class UserRole(str, Enum):
    GROUP_FLEET_MANAGER = "GROUP_FLEET_MANAGER"
    COUNTRY_FLEET_MANAGER = "COUNTRY_FLEET_MANAGER"
    DRIVER = "DRIVER"


class VehicleStatus(str, Enum):
    ACTIVE = "ACTIVE"
    MAINTENANCE = "MAINTENANCE"
    INACTIVE = "INACTIVE"
    DISPOSED = "DISPOSED"


class MaintenanceType(str, Enum):
    SCHEDULED = "SCHEDULED"
    UNSCHEDULED = "UNSCHEDULED"
    PREDICTIVE = "PREDICTIVE"


class WorkshopType(str, Enum):
    INTERNAL = "INTERNAL"
    EXTERNAL = "EXTERNAL"


class DocumentType(str, Enum):
    ROADWORTHY_CERT = "ROADWORTHY_CERT"
    INSURANCE = "INSURANCE"
    DRIVER_LICENSE = "DRIVER_LICENSE"
    VEHICLE_REGISTRATION = "VEHICLE_REGISTRATION"
    OTHER = "OTHER"


class TransactionType(str, Enum):
    PURCHASE = "PURCHASE"
    USAGE = "USAGE"
    TRANSFER = "TRANSFER"
    ADJUSTMENT = "ADJUSTMENT"


class TirePosition(str, Enum):
    FRONT_LEFT = "FRONT_LEFT"
    FRONT_RIGHT = "FRONT_RIGHT"
    REAR_LEFT = "REAR_LEFT"
    REAR_RIGHT = "REAR_RIGHT"
    SPARE = "SPARE"


class TireStatus(str, Enum):
    IN_USE = "IN_USE"
    SPARE = "SPARE"
    REPLACED = "REPLACED"
    DISPOSED = "DISPOSED"


class VendorCategory(str, Enum):
    FUEL = "FUEL"
    PARTS = "PARTS"
    TIRES = "TIRES"
    MAINTENANCE = "MAINTENANCE"
    INSURANCE = "INSURANCE"
    OTHER = "OTHER"


class ExpenseCategory(str, Enum):
    FUEL = "FUEL"
    MAINTENANCE = "MAINTENANCE"
    TIRES = "TIRES"
    INSURANCE = "INSURANCE"
    LICENSE_FEES = "LICENSE_FEES"
    TOLLS = "TOLLS"
    PARKING = "PARKING"
    FINES = "FINES"
    OTHER = "OTHER"


# ============= USER/AUTH MODELS =============
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    hashed_password: str
    full_name: str
    role: UserRole
    country: Optional[CountryEnum] = None  # None for Group Fleet Manager (sees all)
    is_active: bool = True
    is_approved: bool = False  # Must be approved by Group Fleet Manager
    driver_id: Optional[str] = None  # Link to driver profile if role is DRIVER
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: UserRole
    country: Optional[CountryEnum] = None
    driver_id: Optional[str] = None


class UserLogin(BaseModel):
    email: str
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_approved: Optional[bool] = None
    country: Optional[CountryEnum] = None


class Token(BaseModel):
    access_token: str
    token_type: str
    user: Dict[str, Any]


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class PasswordResetToken(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    token: str
    email: str
    expires_at: datetime
    used: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Country Model
class Country(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: CountryEnum
    currency: CurrencyEnum
    date_format: str = "DD/MM/YYYY"
    tax_id_label: str
    regulatory_body: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CountryCreate(BaseModel):
    name: CountryEnum
    currency: CurrencyEnum
    date_format: str = "DD/MM/YYYY"
    tax_id_label: str
    regulatory_body: str


# Vehicle Model
class Vehicle(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    country: CountryEnum
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
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class VehicleCreate(BaseModel):
    country: CountryEnum
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


class VehicleUpdate(BaseModel):
    registration_number: Optional[str] = None
    status: Optional[VehicleStatus] = None
    odometer_reading: Optional[float] = None
    country_specific_fields: Optional[Dict[str, Any]] = None


# Driver Model
class Driver(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    country: CountryEnum
    first_name: str
    last_name: str
    license_number: str
    license_expiry: datetime
    phone: str
    email: Optional[str] = None
    safety_score: float = 100.0
    total_incidents: int = 0
    status: str = "ACTIVE"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class DriverCreate(BaseModel):
    country: CountryEnum
    first_name: str
    last_name: str
    license_number: str
    license_expiry: datetime
    phone: str
    email: Optional[str] = None


class DriverUpdate(BaseModel):
    license_expiry: Optional[datetime] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    safety_score: Optional[float] = None
    status: Optional[str] = None


# Maintenance Record Model
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


# Workshop Job Model
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


# Inventory Item Model
class InventoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    sku: str
    category: str
    country: CountryEnum
    location: str
    quantity: int = 0
    reorder_level: int = 10
    unit_cost: float
    currency: CurrencyEnum
    unit_cost_usd: float
    lead_time_days: int = 7
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class InventoryItemCreate(BaseModel):
    name: str
    sku: str
    category: str
    country: CountryEnum
    location: str
    quantity: int = 0
    reorder_level: int = 10
    unit_cost: float
    currency: CurrencyEnum
    lead_time_days: int = 7


# Inventory Transaction Model
class InventoryTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    item_id: str
    transaction_type: TransactionType
    quantity: int
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class InventoryTransactionCreate(BaseModel):
    item_id: str
    transaction_type: TransactionType
    quantity: int
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


# Fuel Transaction Model
class FuelTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    driver_id: str
    date: datetime
    quantity_liters: float
    cost: float
    currency: CurrencyEnum
    cost_usd: float
    odometer_reading: float
    fuel_efficiency: Optional[float] = None
    location: str
    anomaly_detected: bool = False
    anomaly_reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class FuelTransactionCreate(BaseModel):
    vehicle_id: str
    driver_id: str
    date: datetime
    quantity_liters: float
    cost: float
    currency: CurrencyEnum
    odometer_reading: float
    location: str


# Expenditure Model
class Expenditure(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    country: CountryEnum
    category: str
    description: str
    amount: float
    currency: CurrencyEnum
    amount_usd: float
    date: datetime
    vehicle_id: Optional[str] = None
    driver_id: Optional[str] = None
    receipt_url: Optional[str] = None
    approved: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ExpenditureCreate(BaseModel):
    country: CountryEnum
    category: str
    description: str
    amount: float
    currency: CurrencyEnum
    date: datetime
    vehicle_id: Optional[str] = None
    driver_id: Optional[str] = None
    receipt_url: Optional[str] = None


# Document Model
class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    country: CountryEnum
    document_type: DocumentType
    entity_id: str
    entity_type: str
    document_number: str
    issue_date: datetime
    expiry_date: datetime
    file_url: str
    ocr_processed: bool = False
    ocr_data: Optional[Dict[str, Any]] = None
    validated: bool = False
    validation_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DocumentCreate(BaseModel):
    country: CountryEnum
    document_type: DocumentType
    entity_id: str
    entity_type: str
    document_number: str
    issue_date: datetime
    expiry_date: datetime
    file_url: str


# Asset Model
class Asset(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    acquisition_date: datetime
    acquisition_cost: float
    currency: CurrencyEnum
    acquisition_cost_usd: float
    current_value: float
    current_value_usd: float
    depreciation_rate: float = 0.15
    disposal_date: Optional[datetime] = None
    disposal_value: Optional[float] = None
    predicted_resale_value: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AssetCreate(BaseModel):
    vehicle_id: str
    acquisition_date: datetime
    acquisition_cost: float
    currency: CurrencyEnum
    depreciation_rate: float = 0.15


# Safety Incident Model
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


# Exchange Rate Model
class ExchangeRate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_currency: CurrencyEnum
    to_currency: CurrencyEnum = CurrencyEnum.USD
    rate: float
    date: datetime = Field(default_factory=datetime.utcnow)


class ExchangeRateCreate(BaseModel):
    from_currency: CurrencyEnum
    to_currency: CurrencyEnum = CurrencyEnum.USD
    rate: float


# AI Prediction Model
class AIPrediction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    prediction_type: str
    entity_id: str
    entity_type: str
    prediction_data: Dict[str, Any]
    confidence_score: float
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AIPredictionCreate(BaseModel):
    prediction_type: str
    entity_id: str
    entity_type: str
    prediction_data: Dict[str, Any]
    confidence_score: float


# Maintenance Request Status
class RequestStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    COMPLETED = "COMPLETED"


class RequestPriority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# Maintenance Request Model (Driver/Fleet Officer → Manager Authorization)
class MaintenanceRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    driver_id: str
    request_type: str  # e.g., "Oil Change", "Brake Repair", "Tire Replacement"
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


class MaintenanceRequestApproval(BaseModel):
    manager_id: str
    approved: bool
    rejection_reason: Optional[str] = None


# Pre-Trip Checklist Models
class ChecklistItemStatus(str, Enum):
    OK = "OK"
    NEEDS_ATTENTION = "NEEDS_ATTENTION"
    FAILED = "FAILED"


class ChecklistItem(BaseModel):
    item_name: str
    status: ChecklistItemStatus
    notes: Optional[str] = None


class PreTripChecklist(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    vehicle_id: str
    date: datetime  # Date of checklist (one per day per driver/vehicle)
    checklist_items: List[ChecklistItem] = Field(default_factory=list)
    damage_photos: List[str] = Field(default_factory=list)  # URLs to uploaded photos
    overall_status: str = "PENDING"  # PENDING, PASSED, FAILED
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


# Fleet Manager Model
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


# ============= TIRE MANAGEMENT MODELS =============
class Tire(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    serial_number: str
    brand: str
    model: str
    size: str  # e.g., "265/70R17"
    vehicle_id: Optional[str] = None
    position: Optional[TirePosition] = None
    status: TireStatus = TireStatus.SPARE
    country: CountryEnum
    purchase_date: datetime
    purchase_cost: float
    currency: CurrencyEnum
    mileage_at_install: Optional[float] = None
    current_mileage: Optional[float] = None
    max_mileage: float = 80000  # Expected tire life in km
    tread_depth_mm: Optional[float] = None  # Current tread depth
    min_tread_depth: float = 1.6  # Minimum legal tread depth
    last_rotation_date: Optional[datetime] = None
    next_rotation_due: Optional[datetime] = None
    rotation_interval_km: float = 10000
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TireCreate(BaseModel):
    serial_number: str
    brand: str
    model: str
    size: str
    vehicle_id: Optional[str] = None
    position: Optional[TirePosition] = None
    country: CountryEnum
    purchase_date: datetime
    purchase_cost: float
    currency: CurrencyEnum
    mileage_at_install: Optional[float] = None
    tread_depth_mm: Optional[float] = None
    notes: Optional[str] = None


class TireRotation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str
    rotation_date: datetime
    odometer_reading: float
    rotations: List[Dict[str, str]]  # [{"tire_id": "xxx", "from_position": "FL", "to_position": "RR"}]
    performed_by: str
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TireRotationCreate(BaseModel):
    vehicle_id: str
    rotation_date: datetime
    odometer_reading: float
    rotations: List[Dict[str, str]]
    performed_by: str
    notes: Optional[str] = None


# ============= DRIVER LOGBOOK MODELS =============
class LogbookEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    driver_id: str
    vehicle_id: str
    country: CountryEnum
    date: datetime
    start_time: datetime
    end_time: Optional[datetime] = None
    start_location: str
    end_location: Optional[str] = None
    start_odometer: float
    end_odometer: Optional[float] = None
    distance_km: Optional[float] = None
    purpose: str
    fuel_used_liters: Optional[float] = None
    average_speed_kmh: Optional[float] = None
    max_speed_kmh: Optional[float] = None
    speed_limit_violations: int = 0
    harsh_braking_events: int = 0
    harsh_acceleration_events: int = 0
    idle_time_minutes: int = 0
    notes: Optional[str] = None
    synced: bool = True  # For offline mode
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LogbookEntryCreate(BaseModel):
    driver_id: str
    vehicle_id: str
    country: CountryEnum
    date: datetime
    start_time: datetime
    end_time: Optional[datetime] = None
    start_location: str
    end_location: Optional[str] = None
    start_odometer: float
    end_odometer: Optional[float] = None
    purpose: str
    fuel_used_liters: Optional[float] = None
    average_speed_kmh: Optional[float] = None
    max_speed_kmh: Optional[float] = None
    speed_limit_violations: int = 0
    harsh_braking_events: int = 0
    harsh_acceleration_events: int = 0
    idle_time_minutes: int = 0
    notes: Optional[str] = None


# ============= VENDOR MANAGEMENT MODELS =============
class Vendor(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: VendorCategory
    country: CountryEnum
    address: str
    city: str
    contact_person: str
    phone: str
    email: Optional[str] = None
    tax_id: Optional[str] = None
    payment_terms: str = "NET30"  # e.g., "NET30", "COD", "NET60"
    is_preferred: bool = False
    is_active: bool = True
    rating: Optional[float] = None  # 1-5 stars
    total_transactions: int = 0
    total_spent: float = 0
    currency: CurrencyEnum
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VendorCreate(BaseModel):
    name: str
    category: VendorCategory
    country: CountryEnum
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


# ============= VEHICLE LOCATION MODELS =============
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
    heading: Optional[float] = None  # Direction in degrees
    source: str = "GPS"  # "GPS" or "MANUAL"
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


# ============= ALERT/NOTIFICATION MODELS =============
class AlertType(str, Enum):
    DOCUMENT_EXPIRY = "DOCUMENT_EXPIRY"
    MAINTENANCE_DUE = "MAINTENANCE_DUE"
    TIRE_ROTATION_DUE = "TIRE_ROTATION_DUE"
    TIRE_REPLACEMENT_DUE = "TIRE_REPLACEMENT_DUE"
    LOW_STOCK = "LOW_STOCK"
    FUEL_ANOMALY = "FUEL_ANOMALY"
    SPEEDING = "SPEEDING"
    COMPLIANCE_WARNING = "COMPLIANCE_WARNING"
    INSPECTION_DUE = "INSPECTION_DUE"


class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class Alert(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    alert_type: AlertType
    severity: AlertSeverity
    title: str
    message: str
    entity_type: str  # "vehicle", "driver", "document", "tire", etc.
    entity_id: str
    country: CountryEnum
    is_read: bool = False
    is_resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============= TCO (Total Cost of Ownership) MODELS =============
class TCORecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    vehicle_id: str
    period_start: datetime
    period_end: datetime
    
    # Costs
    fuel_cost: float = 0
    maintenance_cost: float = 0
    tire_cost: float = 0
    insurance_cost: float = 0
    license_fees: float = 0
    depreciation: float = 0
    other_costs: float = 0
    total_cost: float = 0
    
    # Utilization
    total_distance_km: float = 0
    total_trips: int = 0
    total_hours: float = 0
    utilization_rate: float = 0  # % of time vehicle was in use
    
    # Calculated metrics
    cost_per_km: float = 0
    cost_per_trip: float = 0
    
    currency: CurrencyEnum
    country: CountryEnum


# ============= COMPLIANCE MODELS =============
class ComplianceStatus(str, Enum):
    COMPLIANT = "COMPLIANT"
    WARNING = "WARNING"  # Near expiry (within 30 days)
    NON_COMPLIANT = "NON_COMPLIANT"  # Expired or missing


class ComplianceCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_type: str  # "vehicle" or "driver"
    entity_id: str
    country: CountryEnum
    check_type: str  # "roadworthy", "insurance", "license", etc.
    status: ComplianceStatus
    expiry_date: Optional[datetime] = None
    days_until_expiry: Optional[int] = None
    document_id: Optional[str] = None
    notes: Optional[str] = None
    last_checked: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

