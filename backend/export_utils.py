"""Shared Excel / PDF / Word export builders for tabular reports."""
from __future__ import annotations

import io
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Sequence

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

LOGO_PATH = Path(__file__).parent / "assets" / "gti-logo.png"

_MIME = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def export_mime(fmt: str) -> str:
    key = (fmt or "").lower().strip()
    if key not in _MIME:
        raise ValueError(f"Unsupported export format: {fmt}")
    return _MIME[key]


def export_filename(base: str, fmt: str) -> str:
    key = (fmt or "").lower().strip()
    if key not in _MIME:
        raise ValueError(f"Unsupported export format: {fmt}")
    return f"{base}.{key}"


def build_export_bytes(
    title: str,
    headers: Sequence[str],
    rows: Sequence[Sequence[object]],
    fmt: str,
) -> bytes:
    key = (fmt or "").lower().strip()
    if key == "xlsx":
        return _build_xlsx(title, headers, rows)
    if key == "pdf":
        return _build_pdf(title, headers, rows)
    if key == "docx":
        return _build_docx(title, headers, rows)
    raise ValueError(f"Unsupported export format: {fmt}")


def _cell_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    return str(value)


def _build_xlsx(
    title: str,
    headers: Sequence[str],
    rows: Sequence[Sequence[object]],
) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = (title or "Export")[:31]

    header_fill = PatternFill("solid", fgColor="1E3A5F")
    header_font = Font(bold=True, color="FFFFFF")

    for col, name in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col, value=name)
        cell.fill = header_fill
        cell.font = header_font

    for row_idx, row in enumerate(rows, start=2):
        for col, value in enumerate(row, start=1):
            ws.cell(row=row_idx, column=col, value=_cell_str(value))

    for col in range(1, len(headers) + 1):
        ws.column_dimensions[get_column_letter(col)].width = 18

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _build_docx(
    title: str,
    headers: Sequence[str],
    rows: Sequence[Sequence[object]],
) -> bytes:
    from docx import Document
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()
    heading = doc.add_heading(title, level=1)
    heading.alignment = WD_ALIGN_PARAGRAPH.LEFT

    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    meta = doc.add_paragraph(f"Generated: {generated}")
    meta.runs[0].font.size = Pt(9)
    meta.runs[0].font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    if LOGO_PATH.is_file():
        try:
            doc.add_picture(str(LOGO_PATH), width=Inches(1.2))
        except Exception:
            pass

    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    hdr_cells = table.rows[0].cells
    for i, name in enumerate(headers):
        hdr_cells[i].text = name
        for paragraph in hdr_cells[i].paragraphs:
            for run in paragraph.runs:
                run.bold = True

    for r_idx, row in enumerate(rows):
        cells = table.rows[r_idx + 1].cells
        for c_idx, value in enumerate(row):
            cells[c_idx].text = _cell_str(value)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _build_pdf(
    title: str,
    headers: Sequence[str],
    rows: Sequence[Sequence[object]],
) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        Image,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=0.5 * inch,
        rightMargin=0.5 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
    )
    styles = getSampleStyleSheet()
    story = []

    if LOGO_PATH.is_file():
        try:
            story.append(Image(str(LOGO_PATH), width=1.4 * inch))
            story.append(Spacer(1, 8))
        except Exception:
            pass

    story.append(Paragraph("GTI Fleet Solutions", styles["Heading2"]))
    story.append(Paragraph(title, styles["Heading1"]))
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    story.append(Paragraph(f"Generated: {generated}", styles["Normal"]))
    story.append(Spacer(1, 12))

    data = [list(headers)]
    for row in rows:
        data.append([_cell_str(v) for v in row])

    col_count = max(len(headers), 1)
    available = landscape(A4)[0] - inch
    col_width = available / col_count
    table = Table(data, colWidths=[col_width] * col_count, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A5F")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(table)
    doc.build(story)
    return buf.getvalue()
