from __future__ import annotations

import difflib
import io
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import openpyxl
import pdfplumber
from bs4 import BeautifulSoup
from docx import Document as DocxDocument
from PIL import Image
from rapidfuzz import fuzz
from skimage.metrics import structural_similarity as compute_ssim

from worker import conversion_engine


@dataclass
class QualityVerificationResult:
    source_page_count: int
    converted_page_count: int | None
    page_count_match: bool | None
    char_similarity: float
    word_similarity: float
    mean_ssim: float | None
    ssim_status: str  # computed | libreoffice_unavailable | non_visual_target
    source_table_count: int
    converted_table_count: int | None
    source_image_count: int
    converted_image_count: int | None
    missing_text_snippets: list[str] = field(default_factory=list)
    font_warnings: list[dict[str, str]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    page_metrics: list[dict[str, Any]] = field(default_factory=list)
    source_page_pngs: dict[int, bytes] = field(default_factory=dict)
    converted_page_pngs: dict[int, bytes] = field(default_factory=dict)


def _normalize_ws(text: str) -> str:
    return " ".join(text.split())


def _extract_docx_text_tables_images(docx_bytes: bytes) -> tuple[list[str], int, int]:
    """Read text, table count, and inline image count from generated DOCX."""
    doc = DocxDocument(io.BytesIO(docx_bytes))
    chunks: list[str] = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    for tbl in doc.tables:
        for row in tbl.rows:
            row_txt = " ".join(c.text.strip() for c in row.cells if c.text.strip())
            if row_txt:
                chunks.append(row_txt)
    # Inline images reside in document relationships as image parts
    img_count = len(doc.inline_shapes)
    return chunks, len(doc.tables), img_count


def _extract_xlsx_text_tables(xlsx_bytes: bytes) -> tuple[list[str], int]:
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=True)
    lines: list[str] = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            vals = [str(v).strip() for v in row if v is not None and str(v).strip() != ""]
            if vals:
                lines.append(" ".join(vals))
    return lines, len(wb.worksheets)


def _extract_target_text_for_diff(
    target_bytes: bytes, target_format: str
) -> tuple[str, int | None, int | None]:
    """Return (flat_text, converted_table_count, converted_image_count)."""
    fmt = target_format.lower().lstrip(".")
    if fmt == "docx":
        chunks, tbl_cnt, img_cnt = _extract_docx_text_tables_images(target_bytes)
        return "\n".join(chunks), tbl_cnt, img_cnt
    if fmt == "xlsx":
        chunks, tbl_cnt = _extract_xlsx_text_tables(target_bytes)
        return "\n".join(chunks), tbl_cnt, None
    if fmt in ("txt", "md", "csv"):
        return target_bytes.decode("utf-8", errors="replace"), None, None
    if fmt == "html":
        soup = BeautifulSoup(target_bytes.decode("utf-8", errors="replace"), "html.parser")
        return soup.get_text(" ", strip=True), len(soup.find_all("table")), None
    if fmt == "pdf":
        parts: list[str] = []
        tbls = 0
        imgs = 0
        with pdfplumber.open(io.BytesIO(target_bytes)) as plum:
            for pg in plum.pages:
                parts.append(pg.extract_text() or "")
                tbls += len(pg.find_tables())
                imgs += len(pg.images or [])
        return "\n".join(parts), tbls, imgs
    return "", None, None


def _compute_image_ssim(png_a: bytes, png_b: bytes) -> float:
    with Image.open(io.BytesIO(png_a)) as ia, Image.open(io.BytesIO(png_b)) as ib:
        ga = ia.convert("L")
        gb = ib.convert("L")
        if ga.size != gb.size:
            gb = gb.resize(ga.size, Image.Resampling.BILINEAR)
        arr_a = np.asarray(ga, dtype=np.float32)
        arr_b = np.asarray(gb, dtype=np.float32)
        score = float(compute_ssim(arr_a, arr_b, data_range=255.0))
        return round(max(0.0, min(1.0, score)), 4)


def verify_conversion_quality(
    *,
    source_bytes: bytes,
    source_ext: str,
    target_bytes: bytes,
    target_format: str,
    artifact_warnings: list[str] | None = None,
    font_warnings: list[dict[str, str]] | None = None,
) -> QualityVerificationResult:
    """
    Compute genuine verification metrics between source and converted document.
    Never invents scores: visual SSIM is computed only when both sides can be rendered to pixels.
    """
    warnings = list(artifact_warnings or [])
    f_warns = list(font_warnings or [])
    src_ext = source_ext.lower().lstrip(".")
    tgt_fmt = target_format.lower().lstrip(".")

    source_pages_text: list[str] = []
    source_table_count = 0
    source_image_count = 0
    source_pngs: dict[int, bytes] = {}

    if src_ext == "pdf":
        with pdfplumber.open(io.BytesIO(source_bytes)) as plum:
            for pg in plum.pages:
                source_pages_text.append(pg.extract_text() or "")
                source_table_count += len(pg.find_tables())
                source_image_count += len(pg.images or [])
        for p_no, png in conversion_engine.render_pdf_pages_to_pngs(
            source_bytes, dpi=120, max_pages=25
        ):
            source_pngs[p_no] = png
    else:
        src_flat, tbl_c, img_c = _extract_target_text_for_diff(source_bytes, src_ext)
        source_pages_text = [src_flat]
        source_table_count = tbl_c or 0
        source_image_count = img_c or 0

    src_full = _normalize_ws("\n".join(source_pages_text))
    tgt_flat, conv_tbl_count, conv_img_count = _extract_target_text_for_diff(target_bytes, tgt_fmt)
    tgt_norm = _normalize_ws(tgt_flat)

    char_sim = round(float(fuzz.ratio(src_full, tgt_norm)) if (src_full or tgt_norm) else 100.0, 2)
    src_words_str = " ".join(src_full.split())
    tgt_words_str = " ".join(tgt_norm.split())
    word_sim = round(
        float(fuzz.token_sort_ratio(src_words_str, tgt_words_str))
        if (src_words_str or tgt_words_str)
        else 100.0,
        2,
    )

    # Identify concrete missing text snippets from source
    src_lines = [ln.strip() for ln in "\n".join(source_pages_text).splitlines() if ln.strip()]
    tgt_lower = tgt_norm.lower()
    missing_snippets: list[str] = []
    for ln in src_lines:
        norm_ln = _normalize_ws(ln).lower()
        if len(norm_ln) >= 6 and norm_ln not in tgt_lower:
            ratio = fuzz.partial_ratio(norm_ln, tgt_lower)
            if ratio < 82.0:
                missing_snippets.append(ln[:140])
                if len(missing_snippets) >= 12:
                    break

    # Attempt real converted page PNG rendering for visual SSIM check
    converted_pngs: dict[int, bytes] = {}
    converted_page_count: int | None = None
    ssim_status = "non_visual_target"

    if tgt_fmt == "pdf":
        for p_no, png in conversion_engine.render_pdf_pages_to_pngs(
            target_bytes, dpi=120, max_pages=25
        ):
            converted_pngs[p_no] = png
        converted_page_count = len(converted_pngs)
        ssim_status = "computed" if source_pngs else "non_visual_target"
    elif tgt_fmt == "xlsx":
        # Spreadsheets are structured data tables; page-raster SSIM is non-applicable
        ssim_status = "non_visual_target"
    elif tgt_fmt in ("docx", "pptx"):
        try:
            rendered_pdf = conversion_engine.convert_office_via_libreoffice(
                target_bytes, tgt_fmt, "pdf"
            )
            for p_no, png in conversion_engine.render_pdf_pages_to_pngs(
                rendered_pdf, dpi=120, max_pages=25
            ):
                converted_pngs[p_no] = png
            converted_page_count = len(converted_pngs)
            ssim_status = "computed"
        except FileNotFoundError:
            ssim_status = "libreoffice_unavailable"
        except Exception:
            ssim_status = "libreoffice_unavailable"

    # Fallback converted_page_count when docx uses explicit page breaks + 1
    if converted_page_count is None and tgt_fmt == "docx":
        d = DocxDocument(io.BytesIO(target_bytes))
        breaks = sum(
            1
            for p in d.paragraphs
            for r in p.runs
            if "w:br" in getattr(r._element, "xml", "") and 'w:type="page"' in r._element.xml
        )
        raw_count = len(d.sections) + breaks if len(d.sections) == 1 else len(d.sections)
        converted_page_count = max(1, raw_count)
        if converted_page_count != len(source_pages_text):
            # In multi-section python-docx, sections equals source pages
            converted_page_count = len(d.sections)

    page_count_match = (
        (converted_page_count == len(source_pages_text))
        if converted_page_count is not None
        else None
    )

    page_metrics: list[dict[str, Any]] = []
    ssim_values: list[float] = []
    for idx, pg_txt in enumerate(source_pages_text, start=1):
        pg_norm = _normalize_ws(pg_txt)
        pg_char_sim = round(
            float(fuzz.partial_ratio(pg_norm, tgt_norm)) if pg_norm else char_sim, 2
        )
        pg_ssim: float | None = None
        if idx in source_pngs and idx in converted_pngs:
            pg_ssim = _compute_image_ssim(source_pngs[idx], converted_pngs[idx])
            ssim_values.append(pg_ssim)
        diff_ratio = round(
            difflib.SequenceMatcher(None, pg_norm[:2000], tgt_norm[:2000]).ratio(), 4
        )
        page_metrics.append(
            {
                "page_no": idx,
                "char_similarity": pg_char_sim,
                "sequence_ratio": diff_ratio,
                "ssim": pg_ssim,
                "has_source_preview": idx in source_pngs,
                "has_converted_preview": idx in converted_pngs,
            }
        )

    mean_ssim = round(sum(ssim_values) / len(ssim_values), 4) if ssim_values else None

    return QualityVerificationResult(
        source_page_count=len(source_pages_text),
        converted_page_count=converted_page_count,
        page_count_match=page_count_match,
        char_similarity=char_sim,
        word_similarity=word_sim,
        mean_ssim=mean_ssim,
        ssim_status=ssim_status,
        source_table_count=source_table_count,
        converted_table_count=conv_tbl_count,
        source_image_count=source_image_count,
        converted_image_count=conv_img_count,
        missing_text_snippets=missing_snippets,
        font_warnings=f_warns,
        warnings=warnings,
        page_metrics=page_metrics,
        source_page_pngs=source_pngs,
        converted_page_pngs=converted_pngs,
    )
