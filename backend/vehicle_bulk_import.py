"""Excel template and parsing for bulk vehicle import (Master Data aligned)."""
from __future__ import annotations

import io
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from models.enums import CurrencyEnum
from models.fleet import VehicleCreate
from models.vehicle_master import VEHICLE_MASTER_COLUMNS

# Operational columns appended after the Master Data template
_OPS_COLUMNS = [
    ("odometer_reading", "Odometer Reading (km)"),
    ("acquisition_cost", "Acquisition Cost"),
    ("acquisition_currency", "Currency"),
]

BULK_HEADERS = [label for _, label in VEHICLE_MASTER_COLUMNS] + [label for _, label in _OPS_COLUMNS]

_HEADER_ALIASES: Dict[str, str] = {}
for key, label in VEHICLE_MASTER_COLUMNS:
    _HEADER_ALIASES[label.lower()] = key
    # Common shorthand aliases
_HEADER_ALIASES.update({
    "year": "year_of_manufacture",
    "vin": "chassis_vin",
    "chassis / vin": "chassis_vin",
    "chassis/vin": "chassis_vin",
    "odometer reading (km)": "odometer_reading",
    "odometer reading": "odometer_reading",
    "acquisition cost": "acquisition_cost",
    "currency": "acquisition_currency",
})

_NUMERIC_MASTER_KEYS = {
    "year_of_manufacture", "quantity", "seating_capacity", "max_speed",
    "number_of_wheels", "engine_capacity_cc", "power_value", "cylinders", "book_value",
}

_CORE_FROM_MASTER = {
    "registration_number", "make", "model", "year_of_manufacture",
    "chassis_vin", "acquisition_date",
}

SAMPLE_ROW = [
    "SN-001",  # serial_no
    "Toyota",  # manufacturer
    "Pickup",  # vehicle_category
    "Double cab utility",  # description
    "2022-06-15",  # acquisition_date
    "Toyota",  # make
    "Hilux",  # model
    "Japan",  # country_of_origin
    2022,  # year_of_manufacture
    1,  # quantity
    "JTFRB502200123456",  # chassis_vin
    "Commercial",  # use_type
    "Automatic",  # transmission
    "GR-1234-20",  # registration_number
    "265/65R17",  # tyre_size_front
    "265/65R17",  # tyre_size_rear
    "265/65R17",  # tyre_size_spare
    "kg",  # weight_unit
    5,  # seating_capacity
    170,  # max_speed
    "km/h",  # speed_unit
    4,  # number_of_wheels
    "4x4",  # axle_config
    2393,  # engine_capacity_cc
    110,  # power_value
    "kW",  # power_unit
    4,  # cylinders
    "Diesel",  # engine_type
    "Diesel",  # fuel_type
    185000,  # book_value
    "8.5 L/100km",  # fuel_consumption
    "Y",  # active_flag
    45000,  # odometer
    185000,  # acquisition_cost
    "GHS",  # currency
]


def build_template_workbook() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Vehicles"

    header_fill = PatternFill("solid", fgColor="1E3A5F")
    header_font = Font(bold=True, color="FFFFFF")

    for col, title in enumerate(BULK_HEADERS, start=1):
        cell = ws.cell(row=1, column=col, value=title)
        cell.fill = header_fill
        cell.font = header_font

    for col, value in enumerate(SAMPLE_ROW, start=1):
        ws.cell(row=2, column=col, value=value)

    for col in range(1, len(BULK_HEADERS) + 1):
        ws.column_dimensions[get_column_letter(col)].width = max(14, min(28, len(BULK_HEADERS[col - 1]) + 2))

    guide = wb.create_sheet("Instructions")
    guide["A1"] = "Vehicle bulk upload — Master Data template"
    guide["A1"].font = Font(bold=True)
    guide["A3"] = "1. Headers match Vehicle Master Data (plus Odometer, Acquisition Cost, Currency)."
    guide["A4"] = "2. Keep row 1 unchanged. Add one vehicle per row starting at row 3."
    guide["A5"] = "3. Required: Registration Number, Make, Model, Chassis / VIN, Year of Manufacture, Acquisition Date, Acquisition Cost, Currency."
    guide["A6"] = "4. Acquisition Date format: YYYY-MM-DD (e.g. 2022-06-15)."
    guide["A7"] = "5. Currency: GHS, LRD, USD, or STN."
    guide["A8"] = "6. Delete the sample row (row 2) before uploading your data."
    guide["A9"] = "7. Select the fleet country in the upload screen (applies to all rows)."
    guide["A10"] = "8. Master fields are stored on the vehicle and synced to Vehicle Master."
    guide.column_dimensions["A"].width = 90

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _normalize_header(value: Any) -> Optional[str]:
    if value is None:
        return None
    key = str(value).strip().lower().replace("/", " ").replace("  ", " ")
    return _HEADER_ALIASES.get(key) or _HEADER_ALIASES.get(str(value).strip().lower())


def _parse_date(value: Any) -> datetime:
    if value is None or (isinstance(value, str) and not value.strip()):
        raise ValueError("Acquisition Date is required")
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text[:10] if len(text) >= 10 and text[4] == "-" else text, fmt)
        except ValueError:
            continue
    raise ValueError(f"Invalid Acquisition Date: {value}")


def _parse_number(value: Any, label: str, *, required: bool = True) -> float:
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise ValueError(f"{label} is required")
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid {label}: {value}") from exc


def _parse_int(value: Any, label: str) -> int:
    if value is None or (isinstance(value, str) and not value.strip()):
        raise ValueError(f"{label} is required")
    try:
        return int(float(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid {label}: {value}") from exc


def _parse_currency(value: Any) -> CurrencyEnum:
    if value is None or (isinstance(value, str) and not str(value).strip()):
        raise ValueError("Currency is required")
    code = str(value).strip().upper()
    try:
        return CurrencyEnum(code)
    except ValueError as exc:
        raise ValueError(f"Invalid Currency: {value}. Use GHS, LRD, USD, or STN.") from exc


def _should_skip_row(row: tuple, column_map: Dict[int, str]) -> bool:
    for col_idx in column_map:
        val = row[col_idx] if col_idx < len(row) else None
        if val is not None and str(val).strip() != "":
            return False
    return True


def parse_bulk_upload(
    file_bytes: bytes,
    *,
    country: str,
) -> Tuple[List[VehicleCreate], List[Dict[str, Any]]]:
    """Return (valid rows, errors with row numbers)."""
    wb = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb["Vehicles"] if "Vehicles" in wb.sheetnames else wb.active

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        raise ValueError("The spreadsheet is empty")

    header_row = rows[0]
    column_map: Dict[int, str] = {}
    for idx, header in enumerate(header_row):
        field = _normalize_header(header)
        if field:
            column_map[idx] = field

    present = set(column_map.values())
    required_fields = {
        "registration_number",
        "make",
        "model",
        "year_of_manufacture",
        "chassis_vin",
        "acquisition_date",
        "acquisition_cost",
        "acquisition_currency",
    }
    missing = sorted(required_fields - present)
    if missing:
        label_by_key = {k: l for k, l in VEHICLE_MASTER_COLUMNS}
        label_by_key.update({k: l for k, l in _OPS_COLUMNS})
        missing_labels = [label_by_key.get(k, k) for k in missing]
        raise ValueError(f"Missing required columns: {', '.join(missing_labels)}")

    creates: List[VehicleCreate] = []
    errors: List[Dict[str, Any]] = []
    seen_registrations: set[str] = set()

    for row_idx, row in enumerate(rows[1:], start=2):
        if _should_skip_row(row, column_map):
            continue

        data: Dict[str, Any] = {}
        try:
            for col_idx, field in column_map.items():
                val = row[col_idx] if col_idx < len(row) else None
                if val is not None and isinstance(val, str):
                    val = val.strip()
                data[field] = val

            reg = str(data.get("registration_number") or "").strip()
            if not reg:
                raise ValueError("Registration Number is required")

            reg_key = reg.upper()
            if reg_key in seen_registrations:
                raise ValueError(f"Duplicate registration in file: {reg}")
            seen_registrations.add(reg_key)

            make = str(data.get("make") or "").strip()
            model = str(data.get("model") or "").strip()
            vin = str(data.get("chassis_vin") or "").strip()
            if not make:
                raise ValueError("Make is required")
            if not model:
                raise ValueError("Model is required")
            if not vin:
                raise ValueError("Chassis / VIN is required")

            year = _parse_int(data.get("year_of_manufacture"), "Year of Manufacture")
            acquisition_date = _parse_date(data.get("acquisition_date"))
            odometer = _parse_number(data.get("odometer_reading"), "Odometer Reading (km)", required=False)
            cost = _parse_number(data.get("acquisition_cost"), "Acquisition Cost")
            currency = _parse_currency(data.get("acquisition_currency"))

            master_fields: Dict[str, Any] = {}
            for key, _ in VEHICLE_MASTER_COLUMNS:
                if key in _CORE_FROM_MASTER:
                    continue
                raw = data.get(key)
                if raw is None or raw == "":
                    continue
                if key in _NUMERIC_MASTER_KEYS:
                    try:
                        master_fields[key] = int(float(raw)) if key == "year_of_manufacture" else float(raw)
                    except (TypeError, ValueError):
                        master_fields[key] = raw
                else:
                    master_fields[key] = raw

            vehicle_input = VehicleCreate(
                country=country,
                registration_number=reg,
                make=make,
                model=model,
                year=year,
                vin=vin,
                acquisition_date=acquisition_date,
                odometer_reading=odometer,
                acquisition_cost=cost,
                acquisition_currency=currency,
                master_fields=master_fields,
            )
            creates.append(vehicle_input)
        except ValueError as exc:
            errors.append({
                "row": row_idx,
                "registration_number": str(data.get("registration_number") or ""),
                "message": str(exc),
            })

    wb.close()
    return creates, errors
