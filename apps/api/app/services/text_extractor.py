from __future__ import annotations

import io
import re
from dataclasses import dataclass
from pathlib import Path

import openpyxl
import pdfplumber
from docx import Document as DocxDocument
from pptx import Presentation
from pypdf import PdfReader


@dataclass(frozen=True)
class ExtractedSegment:
    page_no: int | None
    section_title: str | None
    text: str


def _ocr_pdf_page_fallback(pdf_bytes: bytes, page_index: int) -> str:
    """Best-effort OCR for image-only PDF pages if rapidocr + pypdfium2 are available."""
    try:
        import numpy as np
        import pypdfium2 as pdfium
        from rapidocr_onnxruntime import RapidOCR

        doc = pdfium.PdfDocument(pdf_bytes)
        try:
            page = doc[page_index]
            pil = page.render(scale=1.5).to_pil()
            page.close()
        finally:
            doc.close()

        ocr = RapidOCR()
        result, _ = ocr(np.array(pil))
        if not result:
            return ""
        return "\n".join(str(item[1]) for item in result if len(item) >= 2 and item[1])
    except Exception:
        return ""


def _extract_pdf_segments(raw_bytes: bytes) -> list[ExtractedSegment]:
    reader = PdfReader(io.BytesIO(raw_bytes), strict=False)
    if reader.is_encrypted:
        return []

    segments: list[ExtractedSegment] = []
    with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
        for idx, page in enumerate(pdf.pages):
            page_no = idx + 1
            text = (page.extract_text() or "").strip()
            if not text and idx < len(reader.pages):
                text = (reader.pages[idx].extract_text() or "").strip()
            if not text and idx < 15:
                text = _ocr_pdf_page_fallback(raw_bytes, idx).strip()

            tables = page.extract_tables() or []
            table_texts: list[str] = []
            for tbl in tables:
                rows = [" | ".join((c or "").strip() for c in r) for r in tbl if r]
                cleaned = "\n".join(r for r in rows if r.replace("|", "").strip())
                if cleaned:
                    table_texts.append(cleaned)

            combined = "\n\n".join(part for part in (text, *table_texts) if part)
            if combined.strip():
                first_line = combined.splitlines()[0].strip()[:120]
                segments.append(
                    ExtractedSegment(
                        page_no=page_no,
                        section_title=first_line or f"Page {page_no}",
                        text=combined.strip(),
                    )
                )
    return segments


def _extract_docx_segments(raw_bytes: bytes) -> list[ExtractedSegment]:
    doc = DocxDocument(io.BytesIO(raw_bytes))
    segments: list[ExtractedSegment] = []
    current_section: str | None = "Document"
    buf: list[str] = []
    section_idx = 1

    para_map = {p._element: p for p in doc.paragraphs}
    table_map = {t._element: t for t in doc.tables}

    for child in doc.element.body:
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p" and child in para_map:
            p = para_map[child]
            txt = p.text.strip()
            if not txt:
                continue
            style_name = ((p.style.name if p.style else "") or "").lower()
            if "heading" in style_name or "title" in style_name:
                if buf:
                    segments.append(
                        ExtractedSegment(
                            page_no=section_idx,
                            section_title=current_section,
                            text="\n".join(buf),
                        )
                    )
                    buf.clear()
                    section_idx += 1
                current_section = txt[:150]
                buf.append(txt)
            else:
                buf.append(txt)
        elif tag == "tbl" and child in table_map:
            tbl = table_map[child]
            for row in tbl.rows:
                row_txt = " | ".join(c.text.strip().replace("\n", " ") for c in row.cells)
                if row_txt.replace("|", "").strip():
                    buf.append(row_txt)

    if buf:
        segments.append(
            ExtractedSegment(
                page_no=section_idx,
                section_title=current_section,
                text="\n".join(buf),
            )
        )
    return segments


def _extract_xlsx_segments(raw_bytes: bytes) -> list[ExtractedSegment]:
    wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True)
    segments: list[ExtractedSegment] = []
    for idx, sheet in enumerate(wb.worksheets, start=1):
        lines: list[str] = []
        for row in sheet.iter_rows(values_only=True):
            vals = ["" if c is None else str(c).strip() for c in row]
            if any(vals):
                lines.append(" | ".join(vals))
        if lines:
            segments.append(
                ExtractedSegment(
                    page_no=idx,
                    section_title=sheet.title[:150],
                    text="\n".join(lines),
                )
            )
    return segments


def _extract_pptx_segments(raw_bytes: bytes) -> list[ExtractedSegment]:
    prs = Presentation(io.BytesIO(raw_bytes))
    segments: list[ExtractedSegment] = []
    for idx, slide in enumerate(prs.slides, start=1):
        title = f"Slide {idx}"
        if slide.shapes.title and slide.shapes.title.text.strip():
            title = slide.shapes.title.text.strip()[:150]
        parts: list[str] = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                txt = shape.text_frame.text.strip()
                if txt:
                    parts.append(txt)
            elif shape.has_table:
                for row in shape.table.rows:
                    row_txt = " | ".join(c.text.strip() for c in row.cells)
                    if row_txt.replace("|", "").strip():
                        parts.append(row_txt)
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
            notes = slide.notes_slide.notes_text_frame.text.strip()
            if notes:
                parts.append(f"Notes: {notes}")
        if parts:
            segments.append(
                ExtractedSegment(page_no=idx, section_title=title, text="\n".join(parts))
            )
    return segments


def _extract_markdown_or_text_segments(raw_bytes: bytes) -> list[ExtractedSegment]:
    text = raw_bytes.decode("utf-8", errors="replace")
    lines = text.splitlines()
    segments: list[ExtractedSegment] = []
    current_title: str | None = "Section 1"
    current_page = 1
    buf: list[str] = []

    for line in lines:
        page_marker = re.match(r"<!--\s*Page\s+(\d+)\s*-->", line.strip(), flags=re.IGNORECASE)
        if page_marker:
            if buf:
                segments.append(
                    ExtractedSegment(
                        page_no=current_page,
                        section_title=current_title,
                        text="\n".join(buf).strip(),
                    )
                )
                buf.clear()
            current_page = int(page_marker.group(1))
            continue

        heading = re.match(r"^#{1,4}\s+(.+)$", line.strip())
        if heading:
            if buf:
                segments.append(
                    ExtractedSegment(
                        page_no=current_page,
                        section_title=current_title,
                        text="\n".join(buf).strip(),
                    )
                )
                buf.clear()
            current_title = heading.group(1).strip()[:150]
            buf.append(line.strip())
        else:
            buf.append(line)

    if buf and "\n".join(buf).strip():
        segments.append(
            ExtractedSegment(
                page_no=current_page,
                section_title=current_title,
                text="\n".join(buf).strip(),
            )
        )
    return segments


def extract_document_segments(
    raw_bytes: bytes,
    mime_type: str,
    filename: str,
) -> list[ExtractedSegment]:
    """Extract ordered, page/section-tagged text segments from PDF, DOCX, XLSX, PPTX, MD, or TXT."""
    ext = Path(filename).suffix.lower()
    if mime_type == "application/pdf" or ext == ".pdf":
        return _extract_pdf_segments(raw_bytes)
    if ext == ".docx" or "wordprocessingml" in mime_type:
        return _extract_docx_segments(raw_bytes)
    if ext == ".xlsx" or "spreadsheetml" in mime_type:
        return _extract_xlsx_segments(raw_bytes)
    if ext == ".pptx" or "presentationml" in mime_type:
        return _extract_pptx_segments(raw_bytes)
    if ext in (".md", ".markdown", ".txt") or mime_type.startswith("text/"):
        return _extract_markdown_or_text_segments(raw_bytes)
    return []
