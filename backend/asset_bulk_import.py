"""Excel/CSV template and parsing for bulk asset import.

An asset is the financial record of one vehicle, so rows are matched to vehicles by registration.
"""
from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from upload_safety import SAMPLE_ROW_MESSAGE, is_sample_row, safe_load_workbook
from models.enums import CurrencyEnum

BULK_HEADERS = [
    "Vehicle Registration",
    "Acquisition Date",
    "Acquisition Cost",
    "Currency",
    "Depreciation Rate (%)",
    "Current Value",
]

REQUIRED_FIELDS = ("registration_number", "acquisition_date", "acquisition_cost", "currency")

_HEADER_ALIASES = {
    "vehicle registration": "registration_number",
    "registration number": "registration_number",
    "registration": "registration_number",
    "vehicle": "registration_number",
    "acquisition date": "acquisition_date",
    "purchase date": "acquisition_date",
    "acquisition cost": "acquisition_cost",
    "purchase cost": "acquisition_cost",
    "cost": "acquisition_cost",
    "currency": "currency",
    "depreciation rate (%)": "depreciation_rate",
    "depreciation rate": "depreciation_rate",
    "depreciation": "depreciation_rate",
    "current value": "current_value",
}

_LABELS = {field: label for label, field in (
    ("Vehicle Registration", "registration_number"),
    ("Acquisition Date", "acquisition_date"),
    ("Acquisition Cost", "acquisition_cost"),
    ("Currency", "currency"),
)}

SAMPLE_ROW = ["GR-1234-20", "2022-06-15", 185000, "GHS", 15, ""]

DEFAULT_DEPRECIATION = 0.15
MAX_ROWS = 5000


def build_asset_template_workbook() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Assets"

    header_fill = PatternFill("solid", fgColor="1E3A5F")
    header_font = Font(bold=True, color="FFFFFF")
    for col, title in enumerate(BULK_HEADERS, start=1):
        cell = ws.cell(row=1, column=col, value=title)
        cell.fill = header_fill
        cell.font = header_font
    for col, value in enumerate(SAMPLE_ROW, start=1):
        ws.cell(row=2, column=col, value=value)
    for col in range(1, len(BULK_HEADERS) + 1):
        ws.column_dimensions[get_column_letter(col)].width = 22

    guide = wb.create_sheet("Instructions")
    guide["A1"] = "Asset bulk upload — how to use"
    guide["A1"].font = Font(bold=True)
    lines = [
        "1. Keep row 1 headers unchanged. Add one asset per row from row 3.",
        "2. Vehicle Registration must match a vehicle already in the system. Each vehicle has one asset record.",
        "3. Rows for vehicles that already have an asset, or repeated in the file, are skipped and listed.",
        "4. Acquisition Date: YYYY-MM-DD or DD/MM/YYYY. Currency: GHS, LRD, USD, or STN.",
        "5. Depreciation Rate is a yearly percentage (15 means 15%). Blank means 15%.",
        "6. Current Value is optional. Blank means the acquisition cost.",
        "7. You can also save this sheet as CSV (UTF-8) and upload that.",
        "8. Delete the sample row (row 2) before uploading.",
    ]
    for offset, line in enumerate(lines, start=3):
        guide[f"A{offset}"] = line
    guide.column_dimensions["A"].width = 96

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _normalize_header(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value).replace("﻿", "")).strip().lower()
    return _HEADER_ALIASES.get(text) or _HEADER_ALIASES.get(text.rstrip(" *"))


def _blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _parse_date(value: Any) -> datetime:
    if _blank(value):
        raise ValueError("Acquisition Date is required")
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(text[:10], fmt)
        except ValueError:
            continue
    raise ValueError(f"Invalid Acquisition Date: {value}. Use YYYY-MM-DD.")


def _parse_amount(value: Any, label: str, *, required: bool) -> Optional[float]:
    if _blank(value):
        if required:
            raise ValueError(f"{label} is required")
        return None
    text = str(value).strip().replace(",", "") if isinstance(value, str) else value
    try:
        amount = float(text)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid {label}: {value}") from exc
    if amount != amount or amount < 0:  # NaN or negative
        raise ValueError(f"{label} cannot be negative")
    return amount


def _parse_rate(value: Any) -> float:
    if _blank(value):
        return DEFAULT_DEPRECIATION
    text = str(value).strip().rstrip("%").strip() if isinstance(value, str) else value
    try:
        rate = float(text)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid Depreciation Rate: {value}") from exc
    if rate > 1:  # entered as a percentage
        rate /= 100
    if not 0 <= rate <= 1:
        raise ValueError("Depreciation Rate must be between 0 and 100%")
    return round(rate, 4)


def _parse_currency(value: Any) -> str:
    if _blank(value):
        raise ValueError("Currency is required")
    code = str(value).strip().upper()
    try:
        return CurrencyEnum(code).value
    except ValueError as exc:
        raise ValueError(f"Invalid Currency: {value}. Use GHS, LRD, USD, or STN.") from exc


def _read_rows(file_bytes: bytes, filename: str) -> List[tuple]:
    if filename.lower().endswith(".csv"):
        try:
            text = file_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = file_bytes.decode("latin-1")
        sample = text[:2048]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        return [tuple(row) for row in csv.reader(io.StringIO(text), dialect)]
    wb = safe_load_workbook(file_bytes)
    try:
        ws = wb["Assets"] if "Assets" in wb.sheetnames else wb.active
        return list(ws.iter_rows(values_only=True))
    finally:
        wb.close()


def registration_key(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def parse_asset_bulk_upload(
    file_bytes: bytes, filename: str = "assets.xlsx"
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Return (valid rows, errors). Duplicate registrations within the file are errors."""
    rows = _read_rows(file_bytes, filename)
    if not rows:
        raise ValueError("The file is empty")

    column_map: Dict[int, str] = {}
    for idx, header in enumerate(rows[0]):
        field = _normalize_header(header)
        if field and field not in column_map.values():
            column_map[idx] = field
    missing = [_LABELS[f] for f in REQUIRED_FIELDS if f not in column_map.values()]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}. Download the template for the correct format.")
    if len(rows) - 1 > MAX_ROWS:
        raise ValueError(f"Too many rows (max {MAX_ROWS}). Split the file.")

    parsed: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    first_row_for: Dict[str, int] = {}

    for row_idx, row in enumerate(rows[1:], start=2):
        if is_sample_row(row, SAMPLE_ROW) or is_sample_row(row, [str(v) for v in SAMPLE_ROW]):
            errors.append({"row": row_idx, "message": SAMPLE_ROW_MESSAGE})
            continue
        data = {field: (row[idx] if idx < len(row) else None) for idx, field in column_map.items()}
        data = {k: (v.strip() if isinstance(v, str) else v) for k, v in data.items()}
        if all(_blank(v) for v in data.values()):
            continue

        registration = str(data.get("registration_number") or "").strip()
        try:
            if not registration:
                raise ValueError("Vehicle Registration is required")
            key = registration_key(registration)
            if key in first_row_for:
                raise ValueError(f"Duplicate of row {first_row_for[key]} in this file")
            item = {
                "row": row_idx,
                "registration_number": registration,
                "acquisition_date": _parse_date(data.get("acquisition_date")),
                "acquisition_cost": _parse_amount(data.get("acquisition_cost"), "Acquisition Cost", required=True),
                "currency": _parse_currency(data.get("currency")),
                "depreciation_rate": _parse_rate(data.get("depreciation_rate")),
                "current_value": _parse_amount(data.get("current_value"), "Current Value", required=False),
            }
            first_row_for[key] = row_idx
            parsed.append(item)
        except ValueError as exc:
            errors.append({"row": row_idx, "registration_number": registration, "message": str(exc)})

    return parsed, errors
