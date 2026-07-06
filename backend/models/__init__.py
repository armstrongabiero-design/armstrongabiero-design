"""Models package - re-exports all models for backward compatibility"""
# Enums
from .enums import (
    CountryEnum, CountryCode, CurrencyEnum, UserRole, VehicleStatus,
    MaintenanceType, WorkshopType, DocumentType, TransactionType,
    TirePosition, TireStatus, VendorCategory, ExpenseCategory,
    RequestStatus, RequestPriority, ChecklistItemStatus,
    AlertType, AlertSeverity, ComplianceStatus,
)

# Auth models
from .auth import (
    User, UserCreate, UserSelfRegister, UserLogin, UserUpdate, Token,
    BootstrapGroupFleetManagerRequest,
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
    MaintenanceRequest, MaintenanceRequestCreate, MaintenanceRequestUpdate, MaintenanceRequestApproval,
    ChecklistItem, PreTripChecklist, PreTripChecklistCreate, PreTripChecklistUpdate,
    FleetManager, FleetManagerCreate,
)

# Operations models
from .operations import (
    FuelTransaction, FuelTransactionCreate, FuelTransactionUpdate,
    Expenditure, ExpenditureCreate, ExpenditureUpdate,
    InventoryItem, InventoryItemCreate, InventoryItemUpdate,
    InventoryTransaction, InventoryTransactionCreate,
    LogbookEntry, LogbookEntryCreate, LogbookEntryUpdate,
)

# Compliance models
from .compliance import (
    Document, DocumentCreate, DocumentUpdate,
    SafetyIncident, SafetyIncidentCreate, SafetyIncidentUpdate,
    Alert, ComplianceCheck,
)

# Asset models
from .assets import (
    Asset, AssetCreate, AssetUpdate,
    ExchangeRate, ExchangeRateCreate,
    AIPrediction, AIPredictionCreate,
    TCORecord,
)

# Tire models
from .tires import Tire, TireCreate, TireUpdate, TireRotation, TireRotationCreate

# Vendor models
from .vendors import Vendor, VendorCreate, VendorUpdate

# Location models
from .locations import VehicleLocation, VehicleLocationCreate
