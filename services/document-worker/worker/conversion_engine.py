from __future__ import annotations

import csv
import html
import io
import json
import os
import re
import shutil
import statistics
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import openpyxl
import pdfplumber
import pypdfium2 as pdfium
from bs4 import BeautifulSoup
from docx import Document as DocxDocument
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Pt, RGBColor
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from PIL import Image
from pptx import Presentation
from pptx.util import Inches as PptxInches
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


@dataclass
class ConversionArtifact:
    output_bytes: bytes
    output_mime: str
    output_ext: str
    suggested_name: str
    warnings: list[str] = field(default_factory=list)
    font_warnings: list[dict[str, str]] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)


def _find_unicode_font() -> tuple[str, str] | None:
    """Locate a TTF/TTC font with Latin + Tamil Unicode coverage for ReportLab."""
    candidates = [
        ("NotoSansTamil", "/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf"),
        ("NotoSans", "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"),
        ("Nirmala", r"C:\Windows\Fonts\Nirmala.ttc"),
        ("ArialUnicode", r"C:\Windows\Fonts\arial.ttf"),
    ]
    for font_name, path in candidates:
        if Path(path).exists():
            try:
                if font_name not in pdfmetrics.getRegisteredFontNames():
                    if path.lower().endswith(".ttc"):
                        pdfmetrics.registerFont(TTFont(font_name, path, subfontIndex=0))
                    else:
                        pdfmetrics.registerFont(TTFont(font_name, path))
                return font_name, path
            except Exception:
                continue
    return None


def find_libreoffice_binary() -> str | None:
    for candidate in ("soffice", "libreoffice"):
        found = shutil.which(candidate)
        if found:
            return found
    win_paths = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ]
    for p in win_paths:
        if Path(p).exists():
            return p
    return None


def convert_office_via_libreoffice(input_bytes: bytes, source_ext: str, target_ext: str) -> bytes:
    soffice = find_libreoffice_binary()
    if not soffice:
        raise FileNotFoundError("LibreOffice binary not found")
    with tempfile.TemporaryDirectory() as tmpdir:
        in_path = Path(tmpdir) / f"input.{source_ext.lstrip('.')}"
        in_path.write_bytes(input_bytes)
        out_dir = Path(tmpdir) / "out"
        out_dir.mkdir(parents=True, exist_ok=True)
        proc = subprocess.run(
            [
                soffice,
                "--headless",
                "--norestore",
                "--convert-to",
                target_ext.lstrip("."),
                "--outdir",
                str(out_dir),
                str(in_path),
            ],
            capture_output=True,
            text=True,
            timeout=90,
            check=False,
        )
        expected = out_dir / f"input.{target_ext.lstrip('.')}"
        if proc.returncode != 0 or not expected.exists():
            raise RuntimeError(
                f"LibreOffice conversion failed ({proc.returncode}): {proc.stderr.strip()}"
            )
        return expected.read_bytes()


def render_pdf_pages_to_pngs(
    pdf_bytes: bytes, *, dpi: int = 150, max_pages: int = 60
) -> list[tuple[int, bytes]]:
    """Render real visual PDF pages to PNG using pypdfium2 (Apache-2.0)."""
    scale = max(0.5, dpi / 72.0)
    pdf = pdfium.PdfDocument(pdf_bytes)
    rendered: list[tuple[int, bytes]] = []
    try:
        total = min(len(pdf), max_pages)
        for idx in range(total):
            page = pdf[idx]
            try:
                bitmap = page.render(scale=scale)
                pil_img = bitmap.to_pil()
                buf = io.BytesIO()
                pil_img.save(buf, format="PNG", optimize=True)
                rendered.append((idx + 1, buf.getvalue()))
            finally:
                page.close()
    finally:
        pdf.close()
    return rendered


def _hex_from_color(val: Any) -> str | None:
    if not val:
        return None
    if isinstance(val, (tuple, list)):
        if len(val) >= 3:
            r, g, b = (int(max(0, min(1, float(c))) * 255) for c in val[:3])
            return f"{r:02X}{g:02X}{b:02X}"
        if len(val) == 1:
            g = int(max(0, min(1, float(val[0]))) * 255)
            return f"{g:02X}{g:02X}{g:02X}"
    if isinstance(val, (int, float)):
        g = int(max(0, min(1, float(val))) * 255)
        return f"{g:02X}{g:02X}{g:02X}"
    return None


def _rgb_from_color(val: Any) -> RGBColor | None:
    hx = _hex_from_color(val)
    if not hx:
        return None
    return RGBColor.from_string(hx)


def _normalize_font_name(raw_font: str) -> tuple[str, bool]:
    """Map embedded PDF subset font names (e.g. 'BCDEEE+Calibri-Bold') to safe clean family."""
    clean = raw_font.split("+")[-1] if "+" in raw_font else raw_font
    base = re.split(r"[-,]", clean)[0].strip()
    lower = base.lower()
    mapping = {
        "helvetica": ("Arial", True),
        "times": ("Times New Roman", True),
        "timesnewroman": ("Times New Roman", True),
        "courier": ("Courier New", True),
        "couriernew": ("Courier New", True),
        "calibri": ("Calibri", False),
        "arial": ("Arial", False),
        "cambria": ("Cambria", False),
        "georgia": ("Georgia", False),
        "verdana": ("Verdana", False),
        "inter": ("Calibri", True),
        "notosanstamil": ("Nirmala UI", True),
        "latha": ("Latha", False),
    }
    for key, (mapped, warned) in mapping.items():
        if key in lower:
            return mapped, warned and (mapped.lower() != base.lower())
    if base:
        return base, False
    return "Calibri", True


def _set_cell_shading(cell: Any, hex_color: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tc_pr.append(shd)


def _set_cell_margins(
    cell: Any, top: int = 45, bottom: int = 45, left: int = 85, right: int = 85
) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = OxmlElement("w:tcMar")
    for side, val in (("top", top), ("bottom", bottom), ("left", left), ("right", right)):
        node = OxmlElement(f"w:{side}")
        node.set(qn("w:w"), str(val))
        node.set(qn("w:type"), "dxa")
        tc_mar.append(node)
    tc_pr.append(tc_mar)


def _set_table_borders(table: Any, border_hex: str = "CBD5E1") -> None:
    tbl_pr = table._tbl.tblPr
    borders = parse_xml(
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="single" w:sz="4" w:space="0" w:color="{border_hex}"/>'
        f'<w:left w:val="single" w:sz="4" w:space="0" w:color="{border_hex}"/>'
        f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="{border_hex}"/>'
        f'<w:right w:val="single" w:sz="4" w:space="0" w:color="{border_hex}"/>'
        f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="{border_hex}"/>'
        f'<w:insideV w:val="single" w:sz="4" w:space="0" w:color="{border_hex}"/>'
        f"</w:tblBorders>"
    )
    tbl_pr.append(borders)


def _rect_contains(outer: tuple[float, float, float, float], x: float, y: float) -> bool:
    return outer[0] - 2 <= x <= outer[2] + 2 and outer[1] - 2 <= y <= outer[3] + 2


def _cluster_borderless_table_rows(
    words: list[dict[str, Any]],
) -> list[tuple[tuple[float, float, float, float], list[list[str]], list[float]]]:
    """
    Detect borderless whitespace-aligned tabular blocks from word coordinates.
    Never discards rows: words are mapped to column bins based on horizontal coordinates.
    Returns list of (bbox, rows, col_widths).
    """
    if len(words) < 4:
        return []

    # Group words into visual lines by baseline / top coordinate
    sorted_w = sorted(words, key=lambda w: (round(w["top"], 1), w["x0"]))
    lines: list[list[dict[str, Any]]] = []
    for w in sorted_w:
        if not lines or abs(w["top"] - lines[-1][0]["top"]) > 4.5:
            lines.append([w])
        else:
            lines[-1].append(w)

    # Segment each line into candidate cell fragments wherever gap >= 12pt
    line_segments: list[tuple[float, float, list[tuple[float, float, str]]]] = []
    for line in lines:
        line.sort(key=lambda w: w["x0"])
        cells: list[tuple[float, float, str]] = []
        cur_text = [line[0]["text"]]
        cur_x0 = line[0]["x0"]
        cur_x1 = line[0]["x1"]
        for w in line[1:]:
            if w["x0"] - cur_x1 >= 12.0:
                cells.append((cur_x0, cur_x1, " ".join(cur_text)))
                cur_text = [w["text"]]
                cur_x0 = w["x0"]
                cur_x1 = w["x1"]
            else:
                cur_text.append(w["text"])
                cur_x1 = max(cur_x1, w["x1"])
        cells.append((cur_x0, cur_x1, " ".join(cur_text)))
        y0 = min(w["top"] for w in line)
        y1 = max(w["bottom"] for w in line)
        line_segments.append((y0, y1, cells))

    # Cluster consecutive lines into tabular blocks if line distance <= 24pt
    groups: list[list[tuple[float, float, list[tuple[float, float, str]]]]] = []
    for item in line_segments:
        has_multi = len(item[2]) >= 2
        if not groups:
            if has_multi:
                groups.append([item])
        else:
            prev_y1 = groups[-1][-1][1]
            if item[0] - prev_y1 <= 24.0:
                groups[-1].append(item)
            elif has_multi:
                groups.append([item])

    results: list[tuple[tuple[float, float, float, float], list[list[str]], list[float]]] = []
    for grp in groups:
        if len(grp) < 2:
            continue

        multi_col_lines = sum(1 for r in grp if len(r[2]) >= 2)
        if multi_col_lines < max(1, len(grp) // 2):
            continue

        all_x0s: list[float] = []
        for _, _, cells in grp:
            for c_x0, _, _ in cells:
                all_x0s.append(c_x0)

        all_x0s.sort()
        col_splits: list[float] = []
        for x in all_x0s:
            if not col_splits or (x - col_splits[-1]) > 16.0:
                col_splits.append(x)
            else:
                col_splits[-1] = (col_splits[-1] + x) / 2.0

        if len(col_splits) < 2:
            continue

        num_cols = len(col_splits)
        dividers = [
            (col_splits[i] + col_splits[i + 1]) / 2.0 for i in range(num_cols - 1)
        ]

        table_rows: list[list[str]] = []
        for _, _, cells in grp:
            row_cells = [""] * num_cols
            for c_x0, c_x1, text in cells:
                c_mid = (c_x0 + c_x1) / 2.0
                col_idx = 0
                for d_idx, div in enumerate(dividers):
                    if c_mid >= div:
                        col_idx = d_idx + 1
                    else:
                        break
                col_idx = min(col_idx, num_cols - 1)
                if row_cells[col_idx]:
                    row_cells[col_idx] += " " + text
                else:
                    row_cells[col_idx] = text
            if any(row_cells):
                table_rows.append(row_cells)

        if len(table_rows) < 2:
            continue

        min_x = min(c[0] for r in grp for c in r[2])
        max_x = max(c[1] for r in grp for c in r[2])
        min_y = min(r[0] for r in grp)
        max_y = max(r[1] for r in grp)

        col_widths: list[float] = []
        for i in range(num_cols):
            if i + 1 < num_cols:
                col_widths.append(max(40.0, col_splits[i + 1] - col_splits[i]))
            else:
                col_widths.append(max(40.0, max_x - col_splits[i] + 10.0))

        results.append(((min_x, min_y, max_x, max_y), table_rows, col_widths))
    return results


def _try_pdf2docx_if_allowed(pdf_bytes: bytes) -> bytes | None:
    if os.getenv("PDF_ENGINE_ALLOW_PYMUPDF", "false").lower() != "true":
        return None
    try:
        from pdf2docx import Converter
    except ImportError:
        return None
    with tempfile.TemporaryDirectory() as tmp:
        pdf_p = Path(tmp) / "src.pdf"
        docx_p = Path(tmp) / "out.docx"
        pdf_p.write_bytes(pdf_bytes)
        cv = Converter(str(pdf_p))
        try:
            cv.convert(str(docx_p))
        finally:
            cv.close()
        return docx_p.read_bytes()


def pdf_to_docx(
    pdf_bytes: bytes,
    *,
    mode: str = "editable",
    base_name: str = "document",
    font_name: str = "Times New Roman",
) -> ConversionArtifact:
    """
    High-fidelity PDF -> Word conversion supporting Modes A (editable),
    B (high_fidelity), and C (hybrid).
    Preserves exact page geometry, native tables with column widths/borders/fills,
    typography, alignment, spacing, and embedded images.
    """
    if mode not in ("editable", "high_fidelity", "hybrid"):
        raise ValueError("DOCX conversion mode must be 'editable', 'high_fidelity', or 'hybrid'.")

    warnings: list[str] = []
    font_warnings: list[dict[str, str]] = []
    seen_font_warns: set[str] = set()

    if mode == "hybrid":
        p2d = _try_pdf2docx_if_allowed(pdf_bytes)
        if p2d is not None:
            return ConversionArtifact(
                output_bytes=p2d,
                output_mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                output_ext=".docx",
                suggested_name=f"{Path(base_name).stem}_{mode}.docx",
                warnings=["Used PyMuPDF+pdf2docx accelerated layout extraction."],
                meta={"mode": mode, "engine": "pdf2docx"},
            )

    doc = DocxDocument()
    total_tables = 0
    total_images = 0

    # Open render doc once via pypdfium2 for image/hybrid crops
    pdf_render = pdfium.PdfDocument(pdf_bytes)
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as plum:
            if not plum.pages:
                raise ValueError("PDF contains zero pages.")

            body_sizes: list[float] = []
            for pg in plum.pages[:10]:
                for ch in pg.chars[:400]:
                    sz = float(ch.get("size") or 10.5)
                    if 6.0 <= sz <= 36.0:
                        body_sizes.append(sz)
            median_body_pt = statistics.median(body_sizes) if body_sizes else 10.5

            for p_idx, page in enumerate(plum.pages):
                page_w = float(page.width)
                page_h = float(page.height)

                section = doc.sections[0] if p_idx == 0 else doc.add_section()
                section.page_width = Pt(page_w)
                section.page_height = Pt(page_h)

                chars = page.chars or []
                words = page.extract_words(
                    keep_blank_chars=False,
                    extra_attrs=["fontname", "size", "non_stroking_color"],
                )

                # Compute tight realistic page margins from content bounds
                all_x0 = [float(w["x0"]) for w in words] or [42.0]
                all_x1 = [float(w["x1"]) for w in words] or [page_w - 42.0]
                all_top = [float(w["top"]) for w in words] or [42.0]
                margin_left = max(18.0, min(72.0, min(all_x0)))
                margin_right = max(18.0, min(72.0, page_w - max(all_x1)))
                margin_top = max(18.0, min(68.0, min(all_top)))
                margin_bottom = 28.0 if mode == "high_fidelity" else 36.0
                section.left_margin = Pt(margin_left)
                section.right_margin = Pt(margin_right)
                section.top_margin = Pt(margin_top)
                section.bottom_margin = Pt(margin_bottom)
                usable_w = max(120.0, page_w - margin_left - margin_right)

                # Detect bordered tables first via pdfplumber
                raw_tables = page.find_tables(
                    table_settings={
                        "vertical_strategy": "lines",
                        "horizontal_strategy": "lines",
                        "snap_tolerance": 4,
                        "join_tolerance": 4,
                    }
                )
                flow_blocks: list[tuple[float, str, Any]] = []
                excluded_boxes: list[tuple[float, float, float, float]] = []

                for tbl in raw_tables:
                    extracted = tbl.extract()
                    if not extracted:
                        continue
                    bbox = (
                        float(tbl.bbox[0]),
                        float(tbl.bbox[1]),
                        float(tbl.bbox[2]),
                        float(tbl.bbox[3]),
                    )
                    excluded_boxes.append(bbox)
                    flow_blocks.append((bbox[1], "table", (tbl, extracted)))

                # Borderless table detection for regions outside bordered tables
                outside_words = [
                    w
                    for w in words
                    if not any(
                        _rect_contains(bx, (w["x0"] + w["x1"]) / 2, (w["top"] + w["bottom"]) / 2)
                        for bx in excluded_boxes
                    )
                ]
                for bbox, rows_txt, col_widths in _cluster_borderless_table_rows(outside_words):
                    excluded_boxes.append(bbox)
                    flow_blocks.append((bbox[1], "borderless_table", (bbox, rows_txt, col_widths)))

                # Group remaining words into lines -> flowing paragraphs
                rem_words = [
                    w
                    for w in words
                    if not any(
                        _rect_contains(bx, (w["x0"] + w["x1"]) / 2, (w["top"] + w["bottom"]) / 2)
                        for bx in excluded_boxes
                    )
                ]
                rem_words.sort(key=lambda w: (round(w["top"], 1), w["x0"]))
                lines: list[list[dict[str, Any]]] = []
                for w in rem_words:
                    if not lines or abs(w["top"] - lines[-1][0]["top"]) > 4.0:
                        lines.append([w])
                    else:
                        lines[-1].append(w)

                # Handle embedded images via page render crop
                for img_meta in page.images or []:
                    ix0 = float(img_meta.get("x0", 0))
                    itop = float(img_meta.get("top", page_h - img_meta.get("y1", 0)))
                    ix1 = float(img_meta.get("x1", ix0 + 80))
                    ibottom = float(img_meta.get("bottom", page_h - img_meta.get("y0", itop - 80)))
                    if ix1 - ix0 >= 18 and ibottom - itop >= 18:
                        flow_blocks.append((itop, "image_crop", (ix0, itop, ix1, ibottom)))

                for line in lines:
                    line.sort(key=lambda w: w["x0"])
                    flow_blocks.append((line[0]["top"], "line", line))

                # Hybrid mode complex-vector crop check
                if mode == "hybrid" and len(page.curves or []) > 18 and not raw_tables:
                    warnings.append(
                        f"Page {p_idx + 1}: dense vector/formula paths detected; "
                        "rendered exact reference preview."
                    )

                flow_blocks.sort(key=lambda b: b[0])

                # Emit Word content in true top-to-bottom reading order
                prev_y = margin_top
                for b_top, kind, data in flow_blocks:
                    gap = max(0.0, b_top - prev_y)

                    if kind == "line":
                        line_words: list[dict[str, Any]] = data
                        p = doc.add_paragraph()
                        p.paragraph_format.space_before = Pt(min(10.0, gap * 0.25))
                        p.paragraph_format.space_after = Pt(1.5 if mode == "high_fidelity" else 3.0)
                        first_x0 = float(line_words[0]["x0"])
                        last_x1 = float(line_words[-1]["x1"])
                        word_sizes = [float(w.get("size") or median_body_pt) for w in line_words]
                        avg_size = sum(word_sizes) / len(line_words)

                        # Detect alignment & exact multi-column tab stops in high_fidelity mode
                        left_gap = first_x0 - margin_left
                        right_gap = (page_w - margin_right) - last_x1
                        if abs(left_gap - right_gap) <= 18.0 and left_gap > 25.0:
                            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                        elif right_gap <= 12.0 and left_gap > 120.0:
                            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                        elif mode == "high_fidelity" and left_gap > 4.0:
                            p.paragraph_format.left_indent = Pt(max(0.0, left_gap))

                        if mode == "high_fidelity":
                            p.paragraph_format.line_spacing = Pt(max(10.0, avg_size * 1.18))

                        # Emit styled runs with tab stops for wide horizontal gaps on baseline
                        for idx_w, w in enumerate(line_words):
                            if idx_w > 0:
                                hgap = float(w["x0"]) - float(line_words[idx_w - 1]["x1"])
                                if hgap > 16.0:
                                    tab_pos = max(4.0, float(w["x0"]) - margin_left)
                                    p.paragraph_format.tab_stops.add_tab_stop(
                                        Pt(tab_pos), WD_TAB_ALIGNMENT.LEFT
                                    )
                                    p.add_run("\t")
                                else:
                                    p.add_run(" ")

                            run = p.add_run(w["text"])
                            raw_fn = str(w.get("fontname") or font_name or "Times New Roman")
                            fam, warned = _normalize_font_name(raw_fn)
                            if warned and raw_fn not in seen_font_warns:
                                seen_font_warns.add(raw_fn)
                                font_warnings.append(
                                    {"source_font": raw_fn, "substituted_font": fam}
                                )
                            run.font.name = font_name or fam
                            sz = float(w.get("size") or median_body_pt)
                            run.font.size = Pt(max(6.0, min(48.0, sz)))
                            low_fn = raw_fn.lower()
                            if "bold" in low_fn or sz >= median_body_pt * 1.25:
                                run.bold = True
                            if "italic" in low_fn or "oblique" in low_fn:
                                run.italic = True
                            rgb = _rgb_from_color(w.get("non_stroking_color"))
                            if rgb is not None:
                                run.font.color.rgb = rgb
                        prev_y = max(float(w["bottom"]) for w in line_words)

                    elif kind == "table":
                        tbl, rows_data = data
                        num_rows = len(rows_data)
                        num_cols = max((len(r) for r in rows_data), default=0)
                        if num_rows == 0 or num_cols == 0:
                            continue
                        total_tables += 1
                        word_tbl = doc.add_table(rows=num_rows, cols=num_cols)
                        word_tbl.alignment = WD_TABLE_ALIGNMENT.LEFT
                        word_tbl.autofit = False
                        _set_table_borders(word_tbl, "94A3B8")

                        # Compute column widths from actual pdfplumber column geometry
                        col_widths_pt: list[float] = []
                        if getattr(tbl, "rows", None) and tbl.rows[0].cells:
                            raw_widths = [
                                (float(c[2]) - float(c[0])) if c else usable_w / num_cols
                                for c in tbl.rows[0].cells[:num_cols]
                            ]
                            sum_w = sum(raw_widths) or usable_w
                            scale_factor = min(1.0, usable_w / sum_w)
                            col_widths_pt = [max(24.0, w * scale_factor) for w in raw_widths]
                        else:
                            col_widths_pt = [usable_w / num_cols] * num_cols

                        for r_idx, row_vals in enumerate(rows_data):
                            row_cells = word_tbl.rows[r_idx].cells
                            for c_idx in range(num_cols):
                                cell = row_cells[c_idx]
                                cell.width = Pt(col_widths_pt[c_idx])
                                cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
                                _set_cell_margins(cell)
                                raw_cell = row_vals[c_idx] if c_idx < len(row_vals) else ""
                                txt = (raw_cell or "").strip()
                                p = cell.paragraphs[0]
                                p.paragraph_format.space_before = Pt(0)
                                p.paragraph_format.space_after = Pt(0)
                                run = p.add_run(txt)
                                run.font.name = font_name or "Times New Roman"
                                run.font.size = Pt(9.5 if mode == "high_fidelity" else 10.0)
                                if r_idx == 0:
                                    run.bold = True
                                    run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                                    _set_cell_shading(cell, "1E293B")
                                elif r_idx % 2 == 1:
                                    _set_cell_shading(cell, "F8FAFC")

                        # Word table pagination standards: repeat header and prevent split rows
                        try:
                            tr_hdr = word_tbl.rows[0]._tr.get_or_add_trPr()
                            tr_hdr.append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))
                            for w_row in word_tbl.rows:
                                tr_p = w_row._tr.get_or_add_trPr()
                                tr_p.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))
                        except Exception:
                            pass

                        # Inspect cell background rects from PDF to preserve custom header colors
                        for rect in page.rects or []:
                            fill_hex = _hex_from_color(rect.get("non_stroking_color"))
                            if fill_hex and fill_hex not in ("FFFFFF", "000000") and tbl.rows:
                                rx = (float(rect["x0"]) + float(rect["x1"])) / 2
                                ry = (float(rect["top"]) + float(rect["bottom"])) / 2
                                for r_idx, t_row in enumerate(tbl.rows):
                                    for c_idx, c_box in enumerate(t_row.cells[:num_cols]):
                                        if c_box and _rect_contains(c_box, rx, ry):
                                            target_cell = word_tbl.rows[r_idx].cells[c_idx]
                                            _set_cell_shading(target_cell, fill_hex)

                        prev_y = float(tbl.bbox[3])

                    elif kind == "borderless_table":
                        bbox, rows_txt, raw_widths = data
                        num_rows = len(rows_txt)
                        num_cols = max((len(r) for r in rows_txt), default=0)
                        if num_rows == 0 or num_cols == 0:
                            continue
                        total_tables += 1
                        word_tbl = doc.add_table(rows=num_rows, cols=num_cols)
                        word_tbl.autofit = False
                        _set_table_borders(word_tbl, "E2E8F0")
                        sum_w = sum(raw_widths) or usable_w
                        scale_f = min(1.0, usable_w / sum_w)
                        for r_idx, r_vals in enumerate(rows_txt):
                            for c_idx in range(num_cols):
                                cell = word_tbl.rows[r_idx].cells[c_idx]
                                cell.width = Pt(max(24.0, raw_widths[c_idx] * scale_f))
                                _set_cell_margins(cell, top=35, bottom=35, left=65, right=65)
                                p = cell.paragraphs[0]
                                p.paragraph_format.space_before = Pt(0)
                                p.paragraph_format.space_after = Pt(0)
                                run = p.add_run(r_vals[c_idx] if c_idx < len(r_vals) else "")
                                run.font.size = Pt(9.5)
                                if r_idx == 0:
                                    run.bold = True
                                    _set_cell_shading(cell, "F1F5F9")
                        prev_y = float(bbox[3])

                    elif kind == "image_crop":
                        ix0, itop, ix1, ibottom = data
                        if p_idx < len(pdf_render):
                            f_page = pdf_render[p_idx]
                            try:
                                scale_img = 200.0 / 72.0
                                bmp = f_page.render(scale=scale_img)
                                full_pil = bmp.to_pil()
                                crop_box = (
                                    max(0, int(ix0 * scale_img)),
                                    max(0, int(itop * scale_img)),
                                    min(full_pil.width, int(ix1 * scale_img)),
                                    min(full_pil.height, int(ibottom * scale_img)),
                                )
                                if crop_box[2] > crop_box[0] + 8 and crop_box[3] > crop_box[1] + 8:
                                    cropped = full_pil.crop(crop_box)
                                    img_io = io.BytesIO()
                                    cropped.save(img_io, format="PNG")
                                    img_io.seek(0)
                                    p_img = doc.add_paragraph()
                                    target_w = min(usable_w, max(24.0, ix1 - ix0))
                                    p_img.add_run().add_picture(img_io, width=Pt(target_w))
                                    total_images += 1
                            finally:
                                f_page.close()
                        prev_y = max(prev_y, ibottom)

                if not chars and not raw_tables:
                    warnings.append(
                        f"Page {p_idx + 1} appears scanned (0 extractable text characters). "
                        "Run OCR first for editable text."
                    )

                need_snapshot = mode == "hybrid" or (
                    mode == "high_fidelity" and not chars and not raw_tables
                )
                if need_snapshot and p_idx < len(pdf_render):
                    f_page = pdf_render[p_idx]
                    try:
                        pil_full = f_page.render(scale=180.0 / 72.0).to_pil()
                        img_io = io.BytesIO()
                        pil_full.save(img_io, format="PNG")
                        img_io.seek(0)
                        doc.add_paragraph().add_run().add_picture(img_io, width=Pt(usable_w))
                        total_images += 1
                    finally:
                        f_page.close()

                if p_idx + 1 < len(plum.pages) and mode != "high_fidelity":
                    doc.add_page_break()
    finally:
        pdf_render.close()

    out = io.BytesIO()
    doc.save(out)
    return ConversionArtifact(
        output_bytes=out.getvalue(),
        output_mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        output_ext=".docx",
        suggested_name=f"{Path(base_name).stem}_{mode}.docx",
        warnings=warnings,
        font_warnings=font_warnings,
        meta={"mode": mode, "tables_reconstructed": total_tables, "images_embedded": total_images},
    )


def _parse_excel_cell_value(raw: str) -> tuple[Any, str | None]:
    """Parse cell text into real int/float + number format when numeric/currency/percentage."""
    s = raw.strip()
    if not s:
        return "", None
    pct = re.fullmatch(r"(-?\d+(?:\.\d+)?)\s*%", s.replace(",", ""))
    if pct:
        return float(pct.group(1)) / 100.0, "0.0%"
    curr = re.fullmatch(r"([₹$€£])\s*(-?[\d,]+(?:\.\d{1,4})?)", s)
    if curr:
        sym, num_s = curr.group(1), curr.group(2).replace(",", "")
        return float(num_s), f'"{sym}"#,##0.00'
    num = re.fullmatch(r"-?[\d,]+(?:\.\d+)?", s)
    if num and not (s.startswith("0") and len(s) > 1 and "." not in s):
        cleaned = s.replace(",", "")
        return (float(cleaned), "#,##0.00") if "." in cleaned else (int(cleaned), "#,##0")
    return s, None


def extract_tables_from_pdf(pdf_bytes: bytes) -> list[dict[str, Any]]:
    """Extract tables across all pages (bordered + borderless whitespace fallback)."""
    extracted_tables: list[dict[str, Any]] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as plum:
        for p_idx, page in enumerate(plum.pages, start=1):
            raw_tbls = page.find_tables(
                table_settings={
                    "vertical_strategy": "lines",
                    "horizontal_strategy": "lines",
                    "snap_tolerance": 4,
                    "join_tolerance": 4,
                }
            )
            page_boxes: list[tuple[float, float, float, float]] = []
            for t_idx, tbl in enumerate(raw_tbls, start=1):
                rows = [[(c or "").strip() for c in row] for row in (tbl.extract() or [])]
                if not rows:
                    continue
                bbox = (
                    float(tbl.bbox[0]),
                    float(tbl.bbox[1]),
                    float(tbl.bbox[2]),
                    float(tbl.bbox[3]),
                )
                page_boxes.append(bbox)
                extracted_tables.append(
                    {
                        "page": p_idx,
                        "table_index": t_idx,
                        "strategy": "bordered_lines",
                        "bbox": [round(v, 2) for v in bbox],
                        "rows_count": len(rows),
                        "cols_count": max((len(r) for r in rows), default=0),
                        "col_widths_pt": [
                            round(float(c[2]) - float(c[0]), 2) if c else 80.0
                            for c in (tbl.rows[0].cells if tbl.rows else [])
                        ],
                        "rows": rows,
                    }
                )

            words = page.extract_words(keep_blank_chars=False)
            rem_words = [
                w
                for w in words
                if not any(
                    _rect_contains(bx, (w["x0"] + w["x1"]) / 2, (w["top"] + w["bottom"]) / 2)
                    for bx in page_boxes
                )
            ]
            for b_idx, (bbox, rows, col_widths) in enumerate(
                _cluster_borderless_table_rows(rem_words), start=len(raw_tbls) + 1
            ):
                extracted_tables.append(
                    {
                        "page": p_idx,
                        "table_index": b_idx,
                        "strategy": "whitespace_columns",
                        "bbox": [round(v, 2) for v in bbox],
                        "rows_count": len(rows),
                        "cols_count": max((len(r) for r in rows), default=0),
                        "col_widths_pt": [round(w, 2) for w in col_widths],
                        "rows": rows,
                    }
                )
    return extracted_tables


def _determine_column_alignments(rows: list[list[str]]) -> list[str]:
    """
    Analyze column values to determine optimal alignment:
    - 'right': Numeric, Currency, Percentage
    - 'center': Dates, Short Codes (<=4 chars)
    - 'left': Text / Descriptions
    """
    if not rows or len(rows) < 2:
        return ["left"] * (len(rows[0]) if rows else 1)

    num_cols = max((len(r) for r in rows), default=1)
    alignments: list[str] = []
    for c_idx in range(num_cols):
        numeric_count = 0
        date_count = 0
        total_data = 0
        for r in rows[1:]:
            val = str(r[c_idx]).strip() if c_idx < len(r) else ""
            if not val:
                continue
            total_data += 1
            if (
                re.fullmatch(r"(-?\d+(?:\.\d+)?)\s*%", val.replace(",", ""))
                or re.fullmatch(r"([₹$€£])\s*(-?[\d,]+(?:\.\d{1,4})?)", val)
                or (
                    re.fullmatch(r"-?[\d,]+(?:\.\d+)?", val)
                    and not (val.startswith("0") and len(val) > 1 and "." not in val)
                )
            ):
                numeric_count += 1
            elif re.fullmatch(r"\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}", val):
                date_count += 1

        if total_data > 0 and (numeric_count / total_data) >= 0.5:
            alignments.append("right")
        elif total_data > 0 and (date_count / total_data) >= 0.5:
            alignments.append("center")
        else:
            alignments.append("left")
    return alignments


def _is_summary_row(row: list[str]) -> bool:
    """Identify Total / Subtotal / Summary rows to apply accounting double-underlines."""
    summary_prefixes = (
        "total", "subtotal", "grand total", "sum", "net", "average", "balance"
    )
    for cell in row[:2]:
        s = str(cell or "").strip().lower()
        if any(s.startswith(k) for k in summary_prefixes):
            return True
    return False


def _write_xlsx_table_sheet(
    wb: openpyxl.Workbook,
    t: dict[str, Any],
    grid_border: Border,
    total_border: Border,
    header_fill: PatternFill,
    zebra_fill: PatternFill,
    header_font: Font,
    body_font: Font,
    summary_font: Font,
) -> None:
    """Write a single detected table into a new worksheet with lead-analyst styling."""
    ws = wb.create_sheet(title=f"P{t['page']}_Table{t['table_index']}"[:31])
    ws.views.sheetView[0].showGridLines = True
    ws.freeze_panes = "A2"
    rows: list[list[str]] = t["rows"]
    if not rows:
        return

    cols_count = max(1, t.get("cols_count") or len(rows[0]))
    col_alignments = _determine_column_alignments(rows)
    col_max_lens = [12] * cols_count

    for r_idx, row in enumerate(rows, start=1):
        is_summary = _is_summary_row(row) if r_idx > 1 else False
        ws.row_dimensions[r_idx].height = 26.0 if r_idx == 1 else 20.0

        for c_idx, raw_val in enumerate(row, start=1):
            cell = ws.cell(row=r_idx, column=c_idx)
            val_str = str(raw_val or "").strip()
            align_type = col_alignments[c_idx - 1] if c_idx - 1 < len(col_alignments) else "left"

            if r_idx == 1:
                cell.value = val_str
                cell.font = header_font
                cell.fill = header_fill
                cell.border = grid_border
                cell.alignment = Alignment(
                    horizontal=align_type, vertical="center", wrap_text=True
                )
            else:
                parsed_val, num_fmt = _parse_excel_cell_value(val_str)
                cell.value = parsed_val
                cell.font = summary_font if is_summary else body_font
                cell.border = total_border if is_summary else grid_border
                if not is_summary and r_idx % 2 == 1:
                    cell.fill = zebra_fill
                if num_fmt:
                    cell.number_format = num_fmt
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                elif align_type == "center":
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    cell.alignment = Alignment(
                        horizontal="left", vertical="center", wrap_text=True
                    )

            col_max_lens[c_idx - 1] = max(
                col_max_lens[c_idx - 1], min(55, len(val_str) + 4)
            )

    # Lead Excel Auto-Filter
    if len(rows) >= 2 and cols_count >= 1:
        max_col_letter = get_column_letter(cols_count)
        ws.auto_filter.ref = f"A1:{max_col_letter}{len(rows)}"

    for c_idx, max_len in enumerate(col_max_lens, start=1):
        col_pt = t["col_widths_pt"][c_idx - 1] if c_idx - 1 < len(t["col_widths_pt"]) else 0
        col_w = min(55.0, round(col_pt / 6.0, 1)) if col_pt else float(max_len)
        computed_w = max(float(max_len), col_w)
        ws.column_dimensions[get_column_letter(c_idx)].width = max(13.0, computed_w)

    ws.page_setup.orientation = (
        ws.ORIENTATION_LANDSCAPE if cols_count >= 6 else ws.ORIENTATION_PORTRAIT
    )
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0


def _write_combined_sheet(
    wb: openpyxl.Workbook,
    tables: list[dict[str, Any]],
    pdf_bytes: bytes,
    grid_border: Border,
    total_border: Border,
    header_fill: PatternFill,
    zebra_fill: PatternFill,
    header_font: Font,
    body_font: Font,
    summary_font: Font,
    section_font: Font,
) -> int:
    """
    Create a unified 'Combined_Data' worksheet containing all rows and columns
    from the PDF in reading order with lead-analyst formatting and auto-filter.
    """
    ws = wb.create_sheet(title="Combined_Data", index=0)
    ws.views.sheetView[0].showGridLines = True
    ws.freeze_panes = "A2"

    section_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")

    cur_row = 1
    total_rows_written = 0

    if tables:
        col_max_lens: dict[int, int] = {}
        last_header: list[str] | None = None
        filter_start_row = 1

        for t_idx, t in enumerate(tables):
            rows: list[list[str]] = t.get("rows") or []
            if not rows:
                continue

            first_row = [str(c or "").strip() for c in rows[0]]
            is_same_table = (
                last_header is not None
                and (
                    first_row == last_header
                    or (len(first_row) == len(last_header) and t_idx > 0)
                )
            )

            col_alignments = _determine_column_alignments(rows)

            if not is_same_table:
                if cur_row > 1:
                    cur_row += 1

                if len(tables) > 1 and t_idx > 0:
                    ws.row_dimensions[cur_row].height = 24.0
                    sec_cell = ws.cell(
                        row=cur_row,
                        column=1,
                        value=f"Table {t_idx + 1} (Page {t['page']})",
                    )
                    sec_cell.font = section_font
                    sec_cell.fill = section_fill
                    sec_cell.alignment = Alignment(horizontal="left", vertical="center")
                    cur_row += 1

                # Header row
                ws.row_dimensions[cur_row].height = 26.0
                if t_idx == 0:
                    filter_start_row = cur_row

                for c_idx, raw_val in enumerate(rows[0], start=1):
                    val_str = str(raw_val or "").strip()
                    align_type = (
                        col_alignments[c_idx - 1]
                        if c_idx - 1 < len(col_alignments)
                        else "left"
                    )
                    cell = ws.cell(row=cur_row, column=c_idx, value=val_str)
                    cell.font = header_font
                    cell.fill = header_fill
                    cell.border = grid_border
                    cell.alignment = Alignment(
                        horizontal=align_type, vertical="center", wrap_text=True
                    )
                    col_max_lens[c_idx] = max(
                        col_max_lens.get(c_idx, 12), min(55, len(val_str) + 4)
                    )
                cur_row += 1
                last_header = first_row
                data_rows = rows[1:]
            else:
                data_rows = rows[1:] if first_row == last_header else rows

            # Write data rows
            for row in data_rows:
                is_summary = _is_summary_row(row)
                ws.row_dimensions[cur_row].height = 20.0

                for c_idx, raw_val in enumerate(row, start=1):
                    cell = ws.cell(row=cur_row, column=c_idx)
                    val_str = str(raw_val or "").strip()
                    align_type = (
                        col_alignments[c_idx - 1]
                        if c_idx - 1 < len(col_alignments)
                        else "left"
                    )

                    parsed_val, num_fmt = _parse_excel_cell_value(val_str)
                    cell.value = parsed_val
                    cell.font = summary_font if is_summary else body_font
                    cell.border = total_border if is_summary else grid_border

                    if not is_summary and cur_row % 2 == 1:
                        cell.fill = zebra_fill

                    if num_fmt:
                        cell.number_format = num_fmt
                        cell.alignment = Alignment(horizontal="right", vertical="center")
                    elif align_type == "center":
                        cell.alignment = Alignment(horizontal="center", vertical="center")
                    else:
                        cell.alignment = Alignment(
                            horizontal="left", vertical="center", wrap_text=True
                        )

                    col_max_lens[c_idx] = max(
                        col_max_lens.get(c_idx, 12), min(55, len(val_str) + 4)
                    )
                cur_row += 1
                total_rows_written += 1

        # Enable Auto-Filter on primary table
        if len(col_max_lens) >= 1 and cur_row > filter_start_row:
            max_col_letter = get_column_letter(max(col_max_lens.keys()))
            ws.auto_filter.ref = f"A{filter_start_row}:{max_col_letter}{cur_row - 1}"

        for c_idx, max_len in col_max_lens.items():
            ws.column_dimensions[get_column_letter(c_idx)].width = max(
                13.0, min(55.0, float(max_len))
            )
    else:
        # Fallback text format
        ws.row_dimensions[1].height = 26.0
        ws.cell(row=1, column=1, value="Document Content").font = header_font
        ws.cell(row=1, column=1).fill = header_fill
        ws.column_dimensions["A"].width = 90
        cur_row = 2
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as plum:
            for page in plum.pages:
                text = (page.extract_text(layout=True) or page.extract_text() or "").strip()
                for line in text.splitlines():
                    val = line.strip()
                    if val:
                        ws.row_dimensions[cur_row].height = 20.0
                        cell = ws.cell(row=cur_row, column=1, value=val)
                        cell.font = body_font
                        cell.border = grid_border
                        if cur_row % 2 == 1:
                            cell.fill = zebra_fill
                        cur_row += 1
                        total_rows_written += 1

    return total_rows_written


def pdf_to_xlsx(
    pdf_bytes: bytes,
    *,
    base_name: str = "document",
    font_name: str = "Times New Roman",
) -> ConversionArtifact:
    """
    Convert a PDF to Excel with lead financial analyst quality:
    - Font: Times New Roman (executive corporate typography)
    - Auto-Filter enabled on table headers
    - Smart column-aware alignment: Numbers/Currencies RIGHT, Dates CENTER, Text LEFT
    - Accounting double-underlines on Total / Summary rows
    - Proper 26pt header height and auto-fitted columns with padding
    """
    tables = extract_tables_from_pdf(pdf_bytes)
    wb = openpyxl.Workbook()
    warnings: list[str] = []

    thin_side = Side(border_style="thin", color="CBD5E1")
    grid_border = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)
    total_border = Border(
        left=thin_side,
        right=thin_side,
        top=Side(border_style="thin", color="94A3B8"),
        bottom=Side(border_style="double", color="0F172A"),
    )
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    header_font = Font(name=font_name, size=11, bold=True, color="FFFFFF")
    body_font = Font(name=font_name, size=10, color="0F172A")
    summary_font = Font(name=font_name, size=10, bold=True, color="0F172A")
    section_font = Font(name=font_name, size=11, bold=True, color="FFFFFF")

    wb.remove(wb.active)

    # 1. Primary unified sheet with ALL rows and columns combined
    total_combined_rows = _write_combined_sheet(
        wb,
        tables,
        pdf_bytes,
        grid_border,
        total_border,
        header_fill,
        zebra_fill,
        header_font,
        body_font,
        summary_font,
        section_font,
    )

    # 2. If multiple tables exist, also add individual sheets
    if len(tables) > 1:
        for t in tables:
            _write_xlsx_table_sheet(
                wb,
                t,
                grid_border,
                total_border,
                header_fill,
                zebra_fill,
                header_font,
                body_font,
                summary_font,
            )

    wb.active = 0

    if not tables and total_combined_rows == 0:
        warnings.append(
            "PDF contains no extractable text. If it is a scanned image, run OCR first."
        )

    out = io.BytesIO()
    wb.save(out)
    return ConversionArtifact(
        output_bytes=out.getvalue(),
        output_mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        output_ext=".xlsx",
        suggested_name=f"{Path(base_name).stem}_tables.xlsx",
        warnings=warnings,
        meta={
            "tables_count": len(tables),
            "combined_rows": total_combined_rows,
            "sheets_count": len(wb.sheetnames),
            "font": font_name,
        },
    )


def pdf_to_pptx(pdf_bytes: bytes, *, base_name: str = "document") -> ConversionArtifact:
    prs = Presentation()
    prs.slide_width = PptxInches(13.333)
    prs.slide_height = PptxInches(7.5)
    blank_layout = prs.slide_layouts[6]
    rendered = render_pdf_pages_to_pngs(pdf_bytes, dpi=150, max_pages=60)
    reader = PdfReader(io.BytesIO(pdf_bytes))

    for p_no, png_bytes in rendered:
        slide = prs.slides.add_slide(blank_layout)
        with Image.open(io.BytesIO(png_bytes)) as im:
            iw, ih = im.size
        ratio = min(12.5 / iw, 7.0 / ih)
        w_in = iw * ratio
        h_in = ih * ratio
        left_in = (13.333 - w_in) / 2
        top_in = (7.5 - h_in) / 2
        slide.shapes.add_picture(
            io.BytesIO(png_bytes),
            PptxInches(left_in),
            PptxInches(top_in),
            width=PptxInches(w_in),
            height=PptxInches(h_in),
        )
        if p_no - 1 < len(reader.pages):
            txt = (reader.pages[p_no - 1].extract_text() or "").strip()
            if txt:
                slide.notes_slide.notes_text_frame.text = txt

    out = io.BytesIO()
    prs.save(out)
    return ConversionArtifact(
        output_bytes=out.getvalue(),
        output_mime="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        output_ext=".pptx",
        suggested_name=f"{Path(base_name).stem}_slides.pptx",
        meta={"slides_count": len(rendered)},
    )


def pdf_to_images(
    pdf_bytes: bytes, *, fmt: str = "png", base_name: str = "document"
) -> ConversionArtifact:
    target = fmt.lower()
    if target not in ("png", "jpg"):
        raise ValueError("Image export target must be png or jpg.")
    rendered = render_pdf_pages_to_pngs(pdf_bytes, dpi=160, max_pages=60)
    converted_imgs: list[tuple[int, bytes]] = []
    for p_no, png_bytes in rendered:
        if target == "png":
            converted_imgs.append((p_no, png_bytes))
        else:
            with Image.open(io.BytesIO(png_bytes)) as im:
                buf = io.BytesIO()
                im.convert("RGB").save(buf, format="JPEG", quality=90)
                converted_imgs.append((p_no, buf.getvalue()))

    if len(converted_imgs) == 1:
        mime = "image/png" if target == "png" else "image/jpeg"
        return ConversionArtifact(
            output_bytes=converted_imgs[0][1],
            output_mime=mime,
            output_ext=f".{target}",
            suggested_name=f"{Path(base_name).stem}_page1.{target}",
            meta={"pages_exported": 1},
        )

    z_buf = io.BytesIO()
    with zipfile.ZipFile(z_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        stem = Path(base_name).stem
        for p_no, img_b in converted_imgs:
            zf.writestr(f"{stem}_page_{p_no}.{target}", img_b)
    return ConversionArtifact(
        output_bytes=z_buf.getvalue(),
        output_mime="application/zip",
        output_ext=".zip",
        suggested_name=f"{Path(base_name).stem}_{target}_pages.zip",
        meta={"pages_exported": len(converted_imgs)},
    )


def pdf_to_text_bundle(
    pdf_bytes: bytes, *, target: str, base_name: str = "document"
) -> ConversionArtifact:
    stem = Path(base_name).stem
    pages_text: list[dict[str, Any]] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as plum:
        for p_no, pg in enumerate(plum.pages, start=1):
            pages_text.append({"page": p_no, "text": (pg.extract_text() or "").strip()})

    tables = extract_tables_from_pdf(pdf_bytes) if target in ("json", "csv", "html", "md") else []

    if target == "txt":
        body = "\n\n".join(f"--- Page {p['page']} ---\n{p['text']}" for p in pages_text)
        return ConversionArtifact(
            body.encode("utf-8"), "text/plain; charset=utf-8", ".txt", f"{stem}.txt"
        )
    if target == "md":
        parts = [f"# {stem}\n"]
        for p in pages_text:
            parts.append(f"## Page {p['page']}\n\n{p['text']}\n")
        for t in tables:
            rows = t["rows"]
            if rows:
                header = "| " + " | ".join(rows[0]) + " |"
                sep = "| " + " | ".join(["---"] * len(rows[0])) + " |"
                body_rows = "\n".join("| " + " | ".join(r) + " |" for r in rows[1:])
                parts.append(f"### Table (Page {t['page']})\n\n{header}\n{sep}\n{body_rows}\n")
        return ConversionArtifact(
            "\n".join(parts).encode("utf-8"),
            "text/markdown; charset=utf-8",
            ".md",
            f"{stem}.md",
        )
    if target == "html":
        blocks = [
            f"<!doctype html><html><head><meta charset='utf-8'>"
            f"<title>{html.escape(stem)}</title></head><body>"
        ]
        for p in pages_text:
            blocks.append(f"<section data-page='{p['page']}'><h2>Page {p['page']}</h2>")
            for line in p["text"].splitlines():
                if line.strip():
                    blocks.append(f"<p>{html.escape(line)}</p>")
            blocks.append("</section>")
        for t in tables:
            blocks.append("<table>")
            for r_i, row in enumerate(t["rows"]):
                tag = "th" if r_i == 0 else "td"
                row_html = "".join(f"<{tag}>{html.escape(c)}</{tag}>" for c in row)
                blocks.append(f"<tr>{row_html}</tr>")
            blocks.append("</table>")
        blocks.append("</body></html>")
        return ConversionArtifact(
            "\n".join(blocks).encode("utf-8"),
            "text/html; charset=utf-8",
            ".html",
            f"{stem}.html",
        )
    if target == "csv":
        s_io = io.StringIO()
        writer = csv.writer(s_io)
        if tables:
            for t in tables:
                for row in t["rows"]:
                    writer.writerow(row)
                writer.writerow([])
        else:
            writer.writerow(["page", "text"])
            for p in pages_text:
                writer.writerow([p["page"], p["text"]])
        return ConversionArtifact(
            s_io.getvalue().encode("utf-8"), "text/csv; charset=utf-8", ".csv", f"{stem}.csv"
        )
    if target == "json":
        payload = {
            "filename": base_name,
            "page_count": len(pages_text),
            "pages": pages_text,
            "tables": tables,
        }
        return ConversionArtifact(
            json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8"),
            "application/json; charset=utf-8",
            ".json",
            f"{stem}.json",
        )
    raise ValueError(f"Unsupported text bundle target: {target}")


def office_or_text_to_pdf(
    source_bytes: bytes, *, source_ext: str, base_name: str = "document"
) -> ConversionArtifact:
    """
    Convert DOCX, XLSX, PPTX, TXT, MD, or HTML to PDF.
    Uses LibreOffice headless when installed; otherwise uses high-precision ReportLab renderers
    preserving table columns, alignment, headers, and Unicode/Tamil font when available.
    """
    ext = source_ext.lower().lstrip(".")
    stem = Path(base_name).stem
    warnings: list[str] = []

    if ext in ("docx", "xlsx", "pptx"):
        try:
            pdf_out = convert_office_via_libreoffice(source_bytes, ext, "pdf")
            return ConversionArtifact(
                output_bytes=pdf_out,
                output_mime="application/pdf",
                output_ext=".pdf",
                suggested_name=f"{stem}.pdf",
                meta={"engine": "libreoffice_headless"},
            )
        except FileNotFoundError:
            warnings.append(
                "LibreOffice headless is not installed on host; "
                "used native Python ReportLab PDF renderer."
            )
        except Exception as exc:
            warnings.append(f"LibreOffice fallback triggered ({exc}); used ReportLab PDF renderer.")

    font_info = _find_unicode_font()
    font_name = font_info[0] if font_info else "Helvetica"
    styles = getSampleStyleSheet()
    body_style = ParagraphStyle(
        "DocuBody",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=10,
        leading=14,
        spaceAfter=5,
    )
    heading_style = ParagraphStyle(
        "DocuHead",
        parent=styles["Heading2"],
        fontName=font_name,
        fontSize=13,
        leading=17,
        spaceAfter=8,
        textColor=colors.HexColor("#1E293B"),
    )

    out_buf = io.BytesIO()
    story: list[Any] = []
    pagesize = A4

    if ext == "xlsx":
        wb = openpyxl.load_workbook(io.BytesIO(source_bytes), data_only=True)
        # Choose landscape when wide tables exist
        max_cols = max((ws.max_column or 1 for ws in wb.worksheets), default=1)
        pagesize = landscape(A4) if max_cols >= 6 else A4
        usable_w = pagesize[0] - 0.9 * inch

        for s_idx, ws in enumerate(wb.worksheets):
            if s_idx > 0:
                story.append(PageBreak())
            story.append(Paragraph(html.escape(ws.title), heading_style))
            rows_data: list[list[Any]] = []
            max_c = min(ws.max_column or 1, 18)
            for row in ws.iter_rows(max_row=ws.max_row, max_col=max_c, values_only=True):
                if any(v is not None and str(v).strip() != "" for v in row):
                    rows_data.append(
                        [
                            Paragraph(
                                html.escape(str(v) if v is not None else ""),
                                ParagraphStyle(
                                    "CellTxt",
                                    fontName=font_name,
                                    fontSize=8.5,
                                    leading=11,
                                    textColor=(
                                        colors.white
                                        if not rows_data
                                        else colors.HexColor("#0F172A")
                                    ),
                                ),
                            )
                            for v in row
                        ]
                    )
            if rows_data:
                col_widths = []
                total_w = 0.0
                for c_i in range(1, max_c + 1):
                    w_char = ws.column_dimensions[get_column_letter(c_i)].width or 14.0
                    col_widths.append(float(w_char))
                    total_w += float(w_char)
                scaled_widths = [max(32.0, (w / (total_w or 1.0)) * usable_w) for w in col_widths]
                tbl = Table(rows_data, colWidths=scaled_widths, repeatRows=1)
                tbl.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                            (
                                "ROWBACKGROUNDS",
                                (0, 1),
                                (-1, -1),
                                [colors.white, colors.HexColor("#F8FAFC")],
                            ),
                            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("TOPPADDING", (0, 0), (-1, -1), 5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                            ("LEFTPADDING", (0, 0), (-1, -1), 5),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                        ]
                    )
                )
                story.append(tbl)

    elif ext == "docx":
        d = DocxDocument(io.BytesIO(source_bytes))
        usable_w = pagesize[0] - 1.2 * inch
        for p in d.paragraphs:
            txt = p.text.strip()
            if not txt:
                story.append(Spacer(1, 6))
                continue
            is_heading = bool(p.style and "Heading" in (p.style.name or ""))
            story.append(Paragraph(html.escape(txt), heading_style if is_heading else body_style))
        for tbl in d.tables:
            t_rows: list[list[Any]] = []
            for r_i, row in enumerate(tbl.rows):
                t_rows.append(
                    [
                        Paragraph(
                            html.escape(cell.text.strip()),
                            ParagraphStyle(
                                "DocxCell",
                                fontName=font_name,
                                fontSize=8.5,
                                leading=11,
                                textColor=colors.white if r_i == 0 else colors.HexColor("#0F172A"),
                            ),
                        )
                        for cell in row.cells
                    ]
                )
            if t_rows and t_rows[0]:
                cw = usable_w / len(t_rows[0])
                rl_t = Table(t_rows, colWidths=[cw] * len(t_rows[0]), repeatRows=1)
                rl_t.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ]
                    )
                )
                story.append(Spacer(1, 6))
                story.append(rl_t)
                story.append(Spacer(1, 8))

    elif ext == "pptx":
        prs = Presentation(io.BytesIO(source_bytes))
        for idx, slide in enumerate(prs.slides, start=1):
            if idx > 1:
                story.append(PageBreak())
            story.append(Paragraph(f"Slide {idx}", heading_style))
            for shape in slide.shapes:
                if getattr(shape, "has_text_frame", False):
                    for line in shape.text_frame.text.splitlines():
                        if line.strip():
                            story.append(Paragraph(html.escape(line.strip()), body_style))

    elif ext in ("html", "htm"):
        soup = BeautifulSoup(source_bytes.decode("utf-8", errors="replace"), "html.parser")
        for el in soup.find_all(["h1", "h2", "h3", "p", "li"]):
            txt = el.get_text(" ", strip=True)
            if txt:
                st = heading_style if el.name in ("h1", "h2", "h3") else body_style
                story.append(Paragraph(html.escape(txt), st))
    else:
        raw_txt = source_bytes.decode("utf-8", errors="replace")
        for line in raw_txt.splitlines():
            clean = line.strip()
            if not clean:
                story.append(Spacer(1, 5))
            elif clean.startswith("#"):
                story.append(Paragraph(html.escape(clean.lstrip("# ")), heading_style))
            else:
                story.append(Paragraph(html.escape(clean), body_style))

    if not story:
        story.append(Paragraph("(Empty document)", body_style))

    pdf_doc = SimpleDocTemplate(
        out_buf,
        pagesize=pagesize,
        leftMargin=0.45 * inch,
        rightMargin=0.45 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch,
    )
    pdf_doc.build(story)
    return ConversionArtifact(
        output_bytes=out_buf.getvalue(),
        output_mime="application/pdf",
        output_ext=".pdf",
        suggested_name=f"{stem}.pdf",
        warnings=warnings,
        meta={"engine": "reportlab_fallback", "font_used": font_name},
    )


def convert_document(
    source_bytes: bytes,
    *,
    source_mime: str,
    filename: str,
    target_format: str,
    mode: str = "editable",
    font_name: str = "Times New Roman",
) -> ConversionArtifact:
    """Unified bidirectional document conversion router."""
    src_ext = Path(filename).suffix.lower().lstrip(".")
    if not src_ext:
        src_ext = "pdf" if source_mime == "application/pdf" else "txt"
    tgt = target_format.lower().lstrip(".")

    if src_ext == "pdf":
        if tgt == "docx":
            return pdf_to_docx(source_bytes, mode=mode, base_name=filename, font_name=font_name)
        if tgt == "xlsx":
            return pdf_to_xlsx(source_bytes, base_name=filename, font_name=font_name)
        if tgt == "pptx":
            return pdf_to_pptx(source_bytes, base_name=filename)
        if tgt in ("png", "jpg"):
            return pdf_to_images(source_bytes, fmt=tgt, base_name=filename)
        if tgt in ("txt", "md", "html", "csv", "json"):
            return pdf_to_text_bundle(source_bytes, target=tgt, base_name=filename)
        if tgt == "pdf":
            return ConversionArtifact(
                source_bytes,
                "application/pdf",
                ".pdf",
                filename,
                warnings=["Source is already PDF."],
            )
        raise ValueError(f"Unsupported PDF target format '{tgt}'.")

    if tgt == "pdf":
        if src_ext in ("png", "jpg", "jpeg"):
            from worker import pdf_engine  # local sibling import

            pdf_b, meta = pdf_engine.images_to_scanned_pdf([source_bytes], enhance_mode="none")
            return ConversionArtifact(
                output_bytes=pdf_b,
                output_mime="application/pdf",
                output_ext=".pdf",
                suggested_name=f"{Path(filename).stem}.pdf",
                meta=meta,
            )
        if src_ext in ("docx", "xlsx", "pptx", "txt", "md", "html", "htm"):
            return office_or_text_to_pdf(source_bytes, source_ext=src_ext, base_name=filename)
        raise ValueError(f"Unsupported source extension '.{src_ext}' for PDF export.")

    # Indirect cross-format chain (e.g., DOCX/XLSX -> PDF -> PNG)
    intermediate = office_or_text_to_pdf(source_bytes, source_ext=src_ext, base_name=filename)
    chained = convert_document(
        intermediate.output_bytes,
        source_mime="application/pdf",
        filename=f"{Path(filename).stem}.pdf",
        target_format=tgt,
        mode=mode,
    )
    chained.warnings = intermediate.warnings + chained.warnings
    return chained
