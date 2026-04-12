"""Enums for Fleet Management System"""
from enum import Enum


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
    FLEET_MANAGER = "FLEET_MANAGER"
    FLEET_OFFICER = "FLEET_OFFICER"
    DRIVER = "DRIVER"
    USER = "USER"


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


class ChecklistItemStatus(str, Enum):
    OK = "OK"
    NEEDS_ATTENTION = "NEEDS_ATTENTION"
    FAILED = "FAILED"


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


class ComplianceStatus(str, Enum):
    COMPLIANT = "COMPLIANT"
    WARNING = "WARNING"
    NON_COMPLIANT = "NON_COMPLIANT"
