"""ISO 3166-1 alpha-2 country codes — normalize legacy enum values and names."""
from __future__ import annotations

from typing import Any, Optional

# Legacy backend enum → ISO alpha-2
LEGACY_ENUM_TO_ISO = {
    "GHANA": "GH",
    "LIBERIA": "LR",
    "SAO_TOME": "ST",
}

# Common display names → ISO (subset + legacy three)
NAME_TO_ISO = {
    "GHANA": "GH",
    "LIBERIA": "LR",
    "SAO TOME": "ST",
    "SAO_TOME": "ST",
    "SÃO TOMÉ": "ST",
    "SÃO TOMÉ AND PRÍNCIPE": "ST",
    "SAO TOME AND PRINCIPE": "ST",
    "GH": "GH",
    "LR": "LR",
    "ST": "ST",
}


def normalize_country_code(value: Any) -> str:
    """Return uppercase ISO alpha-2. Accepts legacy enum, name, or code."""
    if value is None:
        raise ValueError("Country is required")
    raw = str(value).strip()
    if not raw:
        raise ValueError("Country is required")
    upper = raw.upper().replace("-", " ").replace("_", " ")
    compact = upper.replace(" ", "_")
    if compact in LEGACY_ENUM_TO_ISO:
        return LEGACY_ENUM_TO_ISO[compact]
    if upper in NAME_TO_ISO:
        return NAME_TO_ISO[upper]
    if compact in NAME_TO_ISO:
        return NAME_TO_ISO[compact]
    code = raw.upper()
    if len(code) == 2 and code.isalpha():
        return code
    raise ValueError(f"Unknown country: {value!r}. Use ISO 3166-1 alpha-2 (e.g. GH, US).")


def country_display_name(code: Optional[str]) -> str:
    """Human-readable label for an ISO code (fallback to code)."""
    if not code:
        return ""
    try:
        iso = normalize_country_code(code)
    except ValueError:
        return str(code)
    legacy_names = {
        "GH": "Ghana",
        "LR": "Liberia",
        "ST": "São Tomé and Príncipe",
    }
    return legacy_names.get(iso, iso)


def country_filter_query(iso_code: str) -> dict:
    """Mongo filter matching ISO code or legacy enum string on same field."""
    iso = normalize_country_code(iso_code)
    legacy = {k for k, v in LEGACY_ENUM_TO_ISO.items() if v == iso}
    values = [iso, *legacy]
    if len(values) == 1:
        return {"country": iso}
    return {"country": {"$in": values}}
