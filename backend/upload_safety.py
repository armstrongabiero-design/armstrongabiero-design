"""Checks for uploaded files: spreadsheet size limits, content type, and download headers."""
from __future__ import annotations

import io
import re
import zipfile
from urllib.parse import quote

from openpyxl import load_workbook

MAX_WORKBOOK_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
MAX_WORKBOOK_ENTRIES = 1000

_OLE = (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",)
_ZIP = (b"PK\x03\x04",)
_SIGNATURES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "application/msword": _OLE,
    "application/vnd.ms-excel": _OLE,
    "application/vnd.ms-powerpoint": _OLE,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": _ZIP,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": _ZIP,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": _ZIP,
    "application/vnd.oasis.opendocument.text": _ZIP,
    "application/vnd.oasis.opendocument.spreadsheet": _ZIP,
    "video/webm": (b"\x1a\x45\xdf\xa3",),
}
_INLINE_TYPES = frozenset({"application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"})


def safe_load_workbook(file_bytes: bytes):
    """Open an uploaded .xlsx after checking how large it expands to.

    A small zip can expand to many gigabytes, and the size limit on the upload cannot see that.
    Raises ValueError, which the import routes report as a 400.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            entries = archive.infolist()
    except zipfile.BadZipFile as exc:
        raise ValueError("This is not a valid Excel (.xlsx) file.") from exc
    expanded = sum(entry.file_size for entry in entries)
    if len(entries) > MAX_WORKBOOK_ENTRIES or expanded > MAX_WORKBOOK_UNCOMPRESSED_BYTES:
        raise ValueError("This Excel file is too large to import. Split it into smaller files.")
    return load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)


def content_matches_type(content: bytes, content_type: str) -> bool:
    """Check that a file's bytes match its declared type, which the client controls."""
    head = content[:2048]
    if content_type == "application/pdf":
        return b"%PDF-" in head[:1024]
    if content_type == "image/webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if content_type == "text/csv":
        return b"\x00" not in head
    if content_type in ("video/mp4", "video/quicktime"):
        return head[4:8] in (b"ftyp", b"moov", b"mdat", b"wide", b"free")
    signatures = _SIGNATURES.get(content_type)
    return bool(signatures) and head.startswith(signatures)


def content_disposition(filename: str, content_type: str = "") -> str:
    """Build a Content-Disposition header that is safe for any uploaded filename."""
    disposition = "inline" if content_type in _INLINE_TYPES else "attachment"
    fallback = re.sub(r"[^A-Za-z0-9._ -]", "_", filename or "download").strip() or "download"
    encoded = quote(filename or "download", safe="")
    return f"{disposition}; filename=\"{fallback}\"; filename*=UTF-8''{encoded}"
