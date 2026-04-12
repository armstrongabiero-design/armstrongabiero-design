"""Models package - re-exports all models for backward compatibility"""
# Enums
from .enums import (
    CountryEnum, CurrencyEnum, UserRole, VehicleStatus,
    MaintenanceType, WorkshopType, DocumentType, TransactionType,
    TirePosition, TireStatus, VendorCategory, ExpenseCategory,
    RequestStatus, RequestPriority, ChecklistItemStatus,
    AlertType, AlertSeverity, ComplianceStatus,
)

# Auth models
from .auth import (
    User, UserCreate, UserLogin, UserUpdate, Token,
    ForgotPasswordRequest, ResetPasswordRequest, PasswordResetToken,
)

# Fleet models
from .fleet import (
    Country, CountryCreate, Vehicle, VehicleCreate, VehicleUpdate,
    Driver, DriverCreate, DriverUpdate,
)

# Maintenance models
from .maintenance import (
    MaintenanceRecord, MaintenanceRecordCreate,
    WorkshopJob, WorkshopJobCreate,
    MaintenanceRequest, MaintenanceRequestCreate, MaintenanceRequestApproval,
    ChecklistItem, PreTripChecklist, PreTripChecklistCreate,
    FleetManager, FleetManagerCreate,
)

# Operations models
from .operations import (
    FuelTransaction, FuelTransactionCreate,
    Expenditure, ExpenditureCreate,
    InventoryItem, InventoryItemCreate,
    InventoryTransaction, InventoryTransactionCreate,
    LogbookEntry, LogbookEntryCreate,
)

# Compliance models
from .compliance import (
    Document, DocumentCreate,
    SafetyIncident, SafetyIncidentCreate,
    Alert, ComplianceCheck,
)

# Asset models
from .assets import (
    Asset, AssetCreate,
    ExchangeRate, ExchangeRateCreate,
    AIPrediction, AIPredictionCreate,
    TCORecord,
)

# Tire models
from .tires import Tire, TireCreate, TireRotation, TireRotationCreate

# Vendor models
from .vendors import Vendor, VendorCreate

# Location models
from .locations import VehicleLocation, VehicleLocationCreate
