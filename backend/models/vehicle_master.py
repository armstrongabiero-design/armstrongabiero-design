"""Vehicle master-data fields aligned to Fleet Department template."""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid

from .enums import CountryCode


# Column order matches the provided master-data template row
VEHICLE_MASTER_COLUMNS = [
    ("serial_no", "Serial No"),
    ("manufacturer", "Manufacturer"),
    ("vehicle_category", "Vehicle Category"),
    ("description", "Description"),
    ("acquisition_date", "Acquisition Date"),
    ("make", "Make"),
    ("model", "Model"),
    ("country_of_origin", "Country of Origin"),
    ("year_of_manufacture", "Year of Manufacture"),
    ("quantity", "Quantity"),
    ("chassis_vin", "Chassis / VIN"),
    ("use_type", "Use Type"),
    ("transmission", "Transmission"),
    ("registration_number", "Registration Number"),
    ("tyre_size_front", "Tyre Size (Front)"),
    ("tyre_size_rear", "Tyre Size (Rear)"),
    ("tyre_size_spare", "Tyre Size (Spare)"),
    ("weight_unit", "Weight Unit"),
    ("seating_capacity", "Seating Capacity"),
    ("max_speed", "Max Speed"),
    ("speed_unit", "Speed Unit"),
    ("number_of_wheels", "Number of Wheels"),
    ("axle_config", "Axle Config"),
    ("engine_capacity_cc", "Engine Capacity (cc)"),
    ("power_value", "Power Value"),
    ("power_unit", "Power Unit"),
    ("cylinders", "Cylinders"),
    ("engine_type", "Engine Type"),
    ("fuel_type", "Fuel Type"),
    ("book_value", "Book Value"),
    ("fuel_consumption", "Fuel Consumption"),
    ("active_flag", "Active Flag"),
]


class VehicleMaster(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    country: Optional[CountryCode] = None
    linked_vehicle_id: Optional[str] = None  # optional link to operational vehicles collection
    serial_no: Optional[str] = None
    manufacturer: Optional[str] = None
    vehicle_category: Optional[str] = None
    description: Optional[str] = None
    acquisition_date: Optional[str] = None  # YYYY-MM-DD or as provided
    make: Optional[str] = None
    model: Optional[str] = None
    country_of_origin: Optional[str] = None
    year_of_manufacture: Optional[int] = None
    quantity: Optional[float] = None
    chassis_vin: Optional[str] = None
    use_type: Optional[str] = None
    transmission: Optional[str] = None
    registration_number: Optional[str] = None
    tyre_size_front: Optional[str] = None
    tyre_size_rear: Optional[str] = None
    tyre_size_spare: Optional[str] = None
    weight_unit: Optional[str] = None
    seating_capacity: Optional[float] = None
    max_speed: Optional[float] = None
    speed_unit: Optional[str] = None
    number_of_wheels: Optional[float] = None
    axle_config: Optional[str] = None
    engine_capacity_cc: Optional[float] = None
    power_value: Optional[float] = None
    power_unit: Optional[str] = None
    cylinders: Optional[float] = None
    engine_type: Optional[str] = None
    fuel_type: Optional[str] = None
    book_value: Optional[float] = None
    fuel_consumption: Optional[str] = None
    active_flag: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VehicleMasterCreate(BaseModel):
    country: Optional[CountryCode] = None
    linked_vehicle_id: Optional[str] = None
    serial_no: Optional[str] = None
    manufacturer: Optional[str] = None
    vehicle_category: Optional[str] = None
    description: Optional[str] = None
    acquisition_date: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    country_of_origin: Optional[str] = None
    year_of_manufacture: Optional[int] = None
    quantity: Optional[float] = None
    chassis_vin: Optional[str] = None
    use_type: Optional[str] = None
    transmission: Optional[str] = None
    registration_number: Optional[str] = None
    tyre_size_front: Optional[str] = None
    tyre_size_rear: Optional[str] = None
    tyre_size_spare: Optional[str] = None
    weight_unit: Optional[str] = None
    seating_capacity: Optional[float] = None
    max_speed: Optional[float] = None
    speed_unit: Optional[str] = None
    number_of_wheels: Optional[float] = None
    axle_config: Optional[str] = None
    engine_capacity_cc: Optional[float] = None
    power_value: Optional[float] = None
    power_unit: Optional[str] = None
    cylinders: Optional[float] = None
    engine_type: Optional[str] = None
    fuel_type: Optional[str] = None
    book_value: Optional[float] = None
    fuel_consumption: Optional[str] = None
    active_flag: Optional[str] = None


class VehicleMasterUpdate(VehicleMasterCreate):
    pass
