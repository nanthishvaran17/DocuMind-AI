from __future__ import annotations

import html
import io
import re
from pathlib import Path
from typing import Any

import openpyxl
import pdfplumber
from docx import Document as DocxDocument
from docx.oxml.ns import qn
from docx.shared import Inches as DocxInches
from docx.shared import Pt as DocxPt
from docx.shared import RGBColor as DocxRGBColor
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from PIL import Image
from pptx import Presentation
from pptx.util import Inches as PptxInches
from pptx.util import Pt as PptxPt
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus import Image as RLImage

MIME_BY_FORMAT: dict[str, str] = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "md": "text/markdown",
    "txt": "text/plain",
    "html": "text/html",
    "csv": "text/csv",
    "json": "application/json",
    "png": "image/png",
    "jpg": "image/jpeg",
    "zip": "application/zip",
}

SUPPORTED_CONVERSION_MATRIX: dict[str, list[str]] = {
    "pdf": ["docx", "xlsx", "pptx", "md", "txt", "html", "csv", "json", "png", "jpg"],
    "docx": ["pdf", "md", "txt", "html", "png", "jpg"],
    "xlsx": ["pdf", "csv", "html", "png", "jpg"],
    "pptx": ["pdf", "png", "jpg"],
    "md": ["pdf", "docx", "html", "txt"],
    "markdown": ["pdf", "docx", "html", "txt"],
    "txt": ["pdf", "docx", "html", "md"],
    "html": ["pdf", "docx", "md", "txt"],
    "htm": ["pdf", "docx", "md", "txt"],
    "png": ["pdf"],
    "jpg": ["pdf"],
    "jpeg": ["pdf"],
}


def _escape_rl(text: str) -> str:
    return html.escape(text, quote=False)


def _inline_md_to_rl(text: str) -> str:
    """Convert inline markdown (**bold**, *italic*, `code`, [label](url)) to ReportLab XML."""
    escaped = _escape_rl(text)
    escaped = re.sub(
        r"`([^`]+)`",
        r'<font name="Courier" backColor="#F1F5F9"> \1 </font>',
        escaped,
    )
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"__(.+?)__", r"<b>\1</b>", escaped)
    escaped = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"<i>\1</i>", escaped)
    escaped = re.sub(
        r"\[([^\]]+)\]\((https?://[^\s)]+)\)",
        r'<link href="\2" color="#4F46E5"><u>\1</u></link>',
        escaped,
    )
    return escaped


def _build_rl_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "DMTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=25,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=12,
        ),
        "h1": ParagraphStyle(
            "DMH1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=21,
            textColor=colors.HexColor("#1E1B4B"),
            spaceBefore=12,
            spaceAfter=6,
        ),
        "h2": ParagraphStyle(
            "DMH2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=17,
            textColor=colors.HexColor("#312E81"),
            spaceBefore=10,
            spaceAfter=4,
        ),
        "h3": ParagraphStyle(
            "DMH3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#334155"),
            spaceBefore=8,
            spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "DMBody",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14.5,
            textColor=colors.HexColor("#1E293B"),
            spaceAfter=5,
        ),
        "bullet": ParagraphStyle(
            "DMBullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14.5,
            leftIndent=16,
            firstLineIndent=-10,
            textColor=colors.HexColor("#1E293B"),
            spaceAfter=3,
        ),
        "quote": ParagraphStyle(
            "DMQuote",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=10,
            leading=14,
            leftIndent=14,
            borderPadding=6,
            backColor=colors.HexColor("#F8FAFC"),
            textColor=colors.HexColor("#475569"),
            spaceAfter=6,
        ),
        "code": ParagraphStyle(
            "DMCode",
            parent=base["Code"],
            fontName="Courier",
            fontSize=8.5,
            leading=11.5,
            leftIndent=8,
            rightIndent=8,
            backColor=colors.HexColor("#F1F5F9"),
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=6,
        ),
        "cell": ParagraphStyle(
            "DMCell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#1E293B"),
        ),
        "cell_header": ParagraphStyle(
            "DMCellHeader",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            textColor=colors.white,
        ),
    }


def _draw_page_footer(canv: rl_canvas.Canvas, doc: SimpleDocTemplate) -> None:
    canv.saveState()
    canv.setFont("Helvetica", 8)
    canv.setFillColor(colors.HexColor("#64748B"))
    canv.drawRightString(doc.pagesize[0] - 40, 22, f"Page {doc.page}")
    canv.drawString(40, 22, "DocuMind AI")
    canv.restoreState()


def _styled_table(
    rows: list[list[str]],
    avail_width: float,
    styles: dict[str, ParagraphStyle],
    *,
    has_header: bool = True,
) -> Table:
    if not rows:
        rows = [[""]]
    col_count = max(len(r) for r in rows)
    normalized = [r + [""] * (col_count - len(r)) for r in rows]

    # Compute proportional column widths from average/max character length
    col_weights: list[float] = []
    for c_idx in range(col_count):
        max_len = max((len(str(r[c_idx])) for r in normalized[:30]), default=4)
        col_weights.append(float(min(max(max_len, 4), 40)))
    total_w = sum(col_weights) or float(col_count)
    col_widths = [max(36.0, (w / total_w) * avail_width) for w in col_weights]
    # Re-normalize so sum equals avail_width
    scale = avail_width / (sum(col_widths) or avail_width)
    col_widths = [w * scale for w in col_widths]

    table_data: list[list[Paragraph]] = []
    for r_idx, row in enumerate(normalized):
        p_style = styles["cell_header"] if (has_header and r_idx == 0) else styles["cell"]
        table_data.append([Paragraph(_escape_rl(str(cell)), p_style) for cell in row])

    tbl = Table(table_data, colWidths=col_widths, repeatRows=1 if has_header else 0)
    cmds: list[Any] = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if has_header:
        cmds.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#312E81")))
        if len(table_data) > 1:
            cmds.append(
                (
                    "ROWBACKGROUNDS",
                    (0, 1),
                    (-1, -1),
                    [colors.white, colors.HexColor("#F8FAFC")],
                )
            )
    else:
        cmds.append(
            (
                "ROWBACKGROUNDS",
                (0, 0),
                (-1, -1),
                [colors.white, colors.HexColor("#F8FAFC")],
            )
        )
    tbl.setStyle(TableStyle(cmds))
    return tbl


def docx_to_pdf(raw_bytes: bytes) -> tuple[bytes, dict[str, Any]]:
    """Convert DOCX bytes into a styled multi-page PDF preserving paragraph/table order."""
    doc = DocxDocument(io.BytesIO(raw_bytes))
    styles = _build_rl_styles()
    buf = io.BytesIO()
    pdf_doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=44,
        rightMargin=44,
        topMargin=44,
        bottomMargin=44,
    )
    avail_w = A4[0] - 88
    flowables: list[Any] = []

    para_map = {p._element: p for p in doc.paragraphs}
    table_map = {t._element: t for t in doc.tables}
    para_count = 0
    table_count = 0
    image_count = 0

    for child in doc.element.body:
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p" and child in para_map:
            para = para_map[child]
            para_count += 1

            # Extract inline images inside paragraph runs if present
            for blip in child.findall(".//{http://schemas.openxmlformats.org/drawingml/2006/main}blip"):
                embed_id = blip.get(qn("r:embed"))
                if embed_id and embed_id in doc.part.related_parts:
                    img_part = doc.part.related_parts[embed_id]
                    try:
                        with Image.open(io.BytesIO(img_part.blob)) as pil:
                            w_px, h_px = pil.size
                        ratio = min(avail_w / max(w_px, 1), 360.0 / max(h_px, 1), 1.0)
                        rl_img = RLImage(
                            io.BytesIO(img_part.blob),
                            width=max(24.0, w_px * ratio),
                            height=max(24.0, h_px * ratio),
                        )
                        flowables.append(rl_img)
                        flowables.append(Spacer(1, 6))
                        image_count += 1
                    except Exception:
                        pass

            text = para.text.strip()
            if not text:
                flowables.append(Spacer(1, 4))
                continue

            # Build inline XML from runs
            rich_parts: list[str] = []
            for run in para.runs:
                r_txt = _escape_rl(run.text)
                if not r_txt:
                    continue
                if run.bold:
                    r_txt = f"<b>{r_txt}</b>"
                if run.italic:
                    r_txt = f"<i>{r_txt}</i>"
                if run.underline:
                    r_txt = f"<u>{r_txt}</u>"
                rich_parts.append(r_txt)
            rich_xml = "".join(rich_parts) or _escape_rl(text)

            style_name = (para.style.name if para.style else "") or ""
            lower_style = style_name.lower()
            if "title" in lower_style:
                p_style = styles["title"]
            elif "heading 1" in lower_style or lower_style == "h1":
                p_style = styles["h1"]
            elif "heading 2" in lower_style or lower_style == "h2":
                p_style = styles["h2"]
            elif "heading" in lower_style:
                p_style = styles["h3"]
            elif "bullet" in lower_style or "list" in lower_style:
                p_style = styles["bullet"]
                if not text.startswith(("•", "-", "*")):
                    rich_xml = f"• {rich_xml}"
            elif "quote" in lower_style:
                p_style = styles["quote"]
            else:
                p_style = styles["body"]

            flowables.append(Paragraph(rich_xml, p_style))

        elif tag == "tbl" and child in table_map:
            tbl = table_map[child]
            table_count += 1
            rows: list[list[str]] = []
            for row in tbl.rows:
                rows.append([cell.text.strip() for cell in row.cells])
            if rows:
                flowables.append(Spacer(1, 4))
                flowables.append(_styled_table(rows, avail_w, styles, has_header=True))
                flowables.append(Spacer(1, 8))

    if not flowables:
        flowables.append(Paragraph("(Empty DOCX document)", styles["body"]))

    pdf_doc.build(flowables, onFirstPage=_draw_page_footer, onLaterPages=_draw_page_footer)
    out = buf.getvalue()
    pages = len(PdfReader(io.BytesIO(out)).pages)
    return out, {
        "source_format": "docx",
        "target_format": "pdf",
        "paragraphs": para_count,
        "tables": table_count,
        "images": image_count,
        "output_pages": pages,
    }


def xlsx_to_pdf(raw_bytes: bytes) -> tuple[bytes, dict[str, Any]]:
    """Convert XLSX workbook into a formatted multi-sheet PDF."""
    wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True)
    styles = _build_rl_styles()
    max_cols = 1
    sheets_data: list[tuple[str, list[list[str]]]] = []
    for sheet in wb.worksheets:
        rows: list[list[str]] = []
        for row in sheet.iter_rows(values_only=True):
            str_row = ["" if cell is None else str(cell) for cell in row]
            if any(v != "" for v in str_row):
                rows.append(str_row)
        if rows:
            max_cols = max(max_cols, max(len(r) for r in rows))
        sheets_data.append((sheet.title, rows))

    pagesize = landscape(A4) if max_cols > 5 else A4
    avail_w = pagesize[0] - 64
    buf = io.BytesIO()
    pdf_doc = SimpleDocTemplate(
        buf,
        pagesize=pagesize,
        leftMargin=32,
        rightMargin=32,
        topMargin=36,
        bottomMargin=36,
    )
    flowables: list[Any] = []
    for idx, (title, rows) in enumerate(sheets_data):
        if idx > 0:
            flowables.append(PageBreak())
        flowables.append(Paragraph(f"Sheet: {_escape_rl(title)}", styles["h1"]))
        if not rows:
            flowables.append(Paragraph("(Empty sheet)", styles["body"]))
            continue
        col_count = max(len(r) for r in rows)
        flowables.append(
            Paragraph(f"{len(rows)} rows × {col_count} columns", styles["cell"])
        )
        flowables.append(Spacer(1, 6))
        # Chunk wide sheets into manageable column slices if > 12 columns
        if col_count <= 12:
            flowables.append(_styled_table(rows, avail_w, styles, has_header=True))
        else:
            for c_start in range(0, col_count, 10):
                sliced = [r[c_start : c_start + 10] for r in rows]
                flowables.append(
                    Paragraph(f"Columns {c_start + 1}–{min(col_count, c_start + 10)}", styles["h3"])
                )
                flowables.append(_styled_table(sliced, avail_w, styles, has_header=True))
                flowables.append(Spacer(1, 8))

    if not flowables:
        flowables.append(Paragraph("(Empty workbook)", styles["body"]))

    pdf_doc.build(flowables, onFirstPage=_draw_page_footer, onLaterPages=_draw_page_footer)
    out = buf.getvalue()
    pages = len(PdfReader(io.BytesIO(out)).pages)
    return out, {
        "source_format": "xlsx",
        "target_format": "pdf",
        "sheets": len(sheets_data),
        "output_pages": pages,
    }


def pptx_to_pdf(raw_bytes: bytes) -> tuple[bytes, dict[str, Any]]:
    """Convert PPTX slides into an aspect-matched PDF with text, tables, and images."""
    prs = Presentation(io.BytesIO(raw_bytes))
    slide_w_pt = (prs.slide_width / 914400.0) * 72.0 if prs.slide_width else 960.0
    slide_h_pt = (prs.slide_height / 914400.0) * 72.0 if prs.slide_height else 540.0

    buf = io.BytesIO()
    canv = rl_canvas.Canvas(buf, pagesize=(slide_w_pt, slide_h_pt))
    styles = _build_rl_styles()

    for slide_idx, slide in enumerate(prs.slides, start=1):
        # Clean slide canvas background + subtle top accent stripe
        canv.setFillColor(colors.white)
        canv.rect(0, 0, slide_w_pt, slide_h_pt, stroke=0, fill=1)
        canv.setFillColor(colors.HexColor("#4F46E5"))
        canv.rect(0, slide_h_pt - 6, slide_w_pt, 6, stroke=0, fill=1)

        for shape in slide.shapes:
            left_pt = (shape.left / 914400.0) * 72.0
            top_pt = (shape.top / 914400.0) * 72.0
            width_pt = max(20.0, (shape.width / 914400.0) * 72.0)
            height_pt = max(16.0, (shape.height / 914400.0) * 72.0)
            rl_y = slide_h_pt - top_pt - height_pt

            if shape.has_text_frame:
                lines_html: list[str] = []
                is_title = shape == slide.shapes.title
                for p in shape.text_frame.paragraphs:
                    txt = p.text.strip()
                    if not txt:
                        continue
                    prefix = "• " if p.level > 0 and not is_title else ""
                    escaped = _escape_rl(f"{prefix}{txt}")
                    if is_title:
                        lines_html.append(f"<b>{escaped}</b>")
                    else:
                        lines_html.append(escaped)
                if lines_html:
                    p_style = ParagraphStyle(
                        f"SlideTxt_{slide_idx}",
                        parent=styles["h1"] if is_title else styles["body"],
                        fontSize=22 if is_title else 12,
                        leading=27 if is_title else 16,
                        leftIndent=12 if not is_title else 0,
                    )
                    para = Paragraph("<br/>".join(lines_html), p_style)
                    _, used_h = para.wrap(width_pt, height_pt + 200)
                    draw_y = max(16.0, slide_h_pt - top_pt - used_h)
                    para.drawOn(canv, left_pt, draw_y)

            elif shape.has_table:
                rows = [
                    [cell.text.strip() for cell in row.cells] for row in shape.table.rows
                ]
                if rows:
                    tbl = _styled_table(rows, width_pt, styles, has_header=True)
                    _, used_h = tbl.wrap(width_pt, height_pt + 200)
                    tbl.drawOn(canv, left_pt, max(16.0, slide_h_pt - top_pt - used_h))

            elif getattr(shape, "shape_type", None) == 13:  # PICTURE
                try:
                    img_blob = shape.image.blob
                    with Image.open(io.BytesIO(img_blob)) as pil:
                        img_buf = io.BytesIO()
                        pil.convert("RGBA").save(img_buf, format="PNG")
                        img_buf.seek(0)
                    canv.drawImage(
                        ImageReader(img_buf),
                        left_pt,
                        max(0.0, rl_y),
                        width=width_pt,
                        height=height_pt,
                        preserveAspectRatio=True,
                        mask="auto",
                    )
                except Exception:
                    pass

        canv.setFont("Helvetica", 8.5)
        canv.setFillColor(colors.HexColor("#64748B"))
        canv.drawRightString(slide_w_pt - 24, 14, f"Slide {slide_idx} / {len(prs.slides)}")
        canv.showPage()

    if len(prs.slides) == 0:
        canv.setFont("Helvetica", 14)
        canv.drawString(48, slide_h_pt - 72, "(Empty presentation)")
        canv.showPage()

    canv.save()
    return buf.getvalue(), {
        "source_format": "pptx",
        "target_format": "pdf",
        "slides": len(prs.slides),
        "output_pages": max(1, len(prs.slides)),
    }


def _parse_markdown_blocks(md_text: str) -> list[dict[str, Any]]:
    """Parse markdown into structured blocks (headings, code, tables, lists, quotes, paragraphs)."""
    lines = md_text.replace("\r\n", "\n").split("\n")
    blocks: list[dict[str, Any]] = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # Fenced code block
        if stripped.startswith("```"):
            lang = stripped[3:].strip()
            code_lines: list[str] = []
            i += 1
            while i < n and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1
            blocks.append({"type": "code", "lang": lang, "text": "\n".join(code_lines)})
            continue

        # Horizontal rule
        if re.match(r"^(?:---|\*\*\*|___)\s*$", stripped):
            blocks.append({"type": "hr"})
            i += 1
            continue

        # Heading
        h_match = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if h_match:
            blocks.append(
                {
                    "type": "heading",
                    "level": len(h_match.group(1)),
                    "text": h_match.group(2).strip(),
                }
            )
            i += 1
            continue

        # GFM Table
        if "|" in stripped and i + 1 < n and re.match(
            r"^\|?[\s:\-|]+\|[\s:\-|]*$", lines[i + 1].strip()
        ):
            rows: list[list[str]] = []
            while i < n and "|" in lines[i]:
                row_line = lines[i].strip()
                if re.match(r"^\|?[\s:\-|]+\|[\s:\-|]*$", row_line) and len(rows) == 1:
                    i += 1
                    continue
                cells = [c.strip() for c in row_line.strip("|").split("|")]
                rows.append(cells)
                i += 1
            blocks.append({"type": "table", "rows": rows})
            continue

        # Blockquote
        if stripped.startswith(">"):
            q_lines: list[str] = []
            while i < n and lines[i].strip().startswith(">"):
                q_lines.append(lines[i].strip().lstrip(">").strip())
                i += 1
            blocks.append({"type": "quote", "text": " ".join(q_lines)})
            continue

        # Unordered or ordered list
        if re.match(r"^(?:[-*+]|\d+\.)\s+", stripped):
            items: list[tuple[bool, str]] = []
            while i < n and re.match(r"^(?:[-*+]|\d+\.)\s+", lines[i].strip()):
                s = lines[i].strip()
                ordered = bool(re.match(r"^\d+\.\s+", s))
                content = re.sub(r"^(?:[-*+]|\d+\.)\s+", "", s)
                items.append((ordered, content))
                i += 1
            blocks.append({"type": "list", "items": items})
            continue

        # Paragraph
        p_lines: list[str] = []
        while (
            i < n
            and lines[i].strip()
            and not lines[i].strip().startswith(("```", "#", ">"))
            and not re.match(r"^(?:[-*+]|\d+\.)\s+", lines[i].strip())
            and not re.match(r"^(?:---|\*\*\*|___)\s*$", lines[i].strip())
        ):
            p_lines.append(lines[i].strip())
            i += 1
        blocks.append({"type": "paragraph", "text": " ".join(p_lines)})

    return blocks


def markdown_to_pdf(raw_bytes: bytes) -> tuple[bytes, dict[str, Any]]:
    """Convert Markdown or UTF-8 text into a clean publication-grade PDF."""
    text = raw_bytes.decode("utf-8", errors="replace")
    blocks = _parse_markdown_blocks(text)
    styles = _build_rl_styles()
    buf = io.BytesIO()
    pdf_doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=48,
        rightMargin=48,
        topMargin=48,
        bottomMargin=48,
    )
    avail_w = A4[0] - 96
    flowables: list[Any] = []

    for blk in blocks:
        btype = blk["type"]
        if btype == "heading":
            lvl = blk["level"]
            key = "h1" if lvl == 1 else ("h2" if lvl == 2 else "h3")
            flowables.append(Paragraph(_inline_md_to_rl(blk["text"]), styles[key]))
        elif btype == "paragraph":
            flowables.append(Paragraph(_inline_md_to_rl(blk["text"]), styles["body"]))
        elif btype == "quote":
            flowables.append(Paragraph(_inline_md_to_rl(blk["text"]), styles["quote"]))
        elif btype == "code":
            flowables.append(Preformatted(blk["text"], styles["code"]))
        elif btype == "hr":
            flowables.append(Spacer(1, 4))
            flowables.append(
                HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#CBD5E1"))
            )
            flowables.append(Spacer(1, 6))
        elif btype == "list":
            ord_idx = 1
            for ordered, item_text in blk["items"]:
                prefix = f"{ord_idx}." if ordered else "•"
                if ordered:
                    ord_idx += 1
                flowables.append(
                    Paragraph(f"{prefix} {_inline_md_to_rl(item_text)}", styles["bullet"])
                )
            flowables.append(Spacer(1, 4))
        elif btype == "table":
            flowables.append(Spacer(1, 4))
            flowables.append(_styled_table(blk["rows"], avail_w, styles, has_header=True))
            flowables.append(Spacer(1, 8))

    if not flowables:
        flowables.append(Paragraph("(Empty markdown document)", styles["body"]))

    pdf_doc.build(flowables, onFirstPage=_draw_page_footer, onLaterPages=_draw_page_footer)
    out = buf.getvalue()
    pages = len(PdfReader(io.BytesIO(out)).pages)
    return out, {
        "source_format": "md",
        "target_format": "pdf",
        "blocks": len(blocks),
        "output_pages": pages,
    }


def _extract_pdf_page_structure(
    page: pdfplumber.page.Page,
) -> tuple[list[dict[str, Any]], list[list[list[str]]]]:
    """Extract ordered blocks (headings/paragraphs) and tables from a PDF page."""
    tables_raw = page.find_tables()
    table_bboxes = [t.bbox for t in tables_raw]
    extracted_tables: list[list[list[str]]] = []
    for t in tables_raw:
        data = t.extract()
        if data:
            cleaned = [[(c or "").strip() for c in row] for row in data]
            if any(any(cell for cell in r) for r in cleaned):
                extracted_tables.append(cleaned)

    def _inside_table(word: dict[str, Any]) -> bool:
        wx = (float(word["x0"]) + float(word["x1"])) / 2.0
        wy = (float(word["top"]) + float(word["bottom"])) / 2.0
        for x0, top, x1, bottom in table_bboxes:
            if x0 <= wx <= x1 and top <= wy <= bottom:
                return True
        return False

    words = [
        w for w in page.extract_words(extra_attrs=["size", "fontname"]) if not _inside_table(w)
    ]
    # Group words into visual lines by vertical top coordinate
    lines: list[list[dict[str, Any]]] = []
    for w in sorted(words, key=lambda item: (round(float(item["top"]), 1), float(item["x0"]))):
        if not lines or abs(float(w["top"]) - float(lines[-1][0]["top"])) > 4.5:
            lines.append([w])
        else:
            lines[-1].append(w)

    sizes = [float(w.get("size") or 10.0) for w in words]
    median_size = sorted(sizes)[len(sizes) // 2] if sizes else 10.0

    blocks: list[dict[str, Any]] = []
    for line_words in lines:
        line_words_sorted = sorted(line_words, key=lambda item: float(item["x0"]))
        text = " ".join(str(w["text"]) for w in line_words_sorted).strip()
        if not text:
            continue
        avg_size = sum(float(w.get("size") or median_size) for w in line_words_sorted) / len(
            line_words_sorted
        )
        font_names = " ".join(str(w.get("fontname") or "") for w in line_words_sorted).lower()
        is_bold = "bold" in font_names or "black" in font_names
        if avg_size >= median_size * 1.45 and len(text) <= 140:
            kind = "h1"
        elif (avg_size >= median_size * 1.18 or (is_bold and len(text) <= 90)) and len(text) <= 140:
            kind = "h2"
        elif text.startswith(("•", "-", "*")) and len(text) > 2:
            kind = "bullet"
        else:
            kind = "paragraph"
        blocks.append({"kind": kind, "text": text})

    return blocks, extracted_tables


def pdf_to_docx(raw_bytes: bytes) -> tuple[bytes, dict[str, Any]]:
    """Convert PDF into an editable, styled DOCX with headings, paragraphs, tables, and images."""
    docx = DocxDocument()
    normal_style = docx.styles["Normal"]
    normal_style.font.name = "Calibri"
    normal_style.font.size = DocxPt(11)

    reader = PdfReader(io.BytesIO(raw_bytes), strict=False)
    if reader.is_encrypted:
        raise ValueError("Cannot convert an encrypted PDF. Unlock it first.")

    tables_total = 0
    images_total = 0

    with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
        for p_idx, page in enumerate(pdf.pages):
            if p_idx > 0:
                docx.add_page_break()
            blocks, tables = _extract_pdf_page_structure(page)

            # Merge consecutive normal paragraph lines into smooth paragraphs
            para_buf: list[str] = []

            for blk in blocks:
                kind = blk["kind"]
                txt = blk["text"]
                if kind == "h1":
                    if para_buf:
                        docx.add_paragraph(" ".join(para_buf))
                        para_buf.clear()
                    docx.add_heading(txt, level=1)
                elif kind == "h2":
                    if para_buf:
                        docx.add_paragraph(" ".join(para_buf))
                        para_buf.clear()
                    docx.add_heading(txt, level=2)
                elif kind == "bullet":
                    if para_buf:
                        docx.add_paragraph(" ".join(para_buf))
                        para_buf.clear()
                    clean = re.sub(r"^[•\-*]\s*", "", txt)
                    docx.add_paragraph(clean, style="List Bullet")
                else:
                    para_buf.append(txt)
            if para_buf:
                docx.add_paragraph(" ".join(para_buf))
                para_buf.clear()

            for tbl_rows in tables:
                tables_total += 1
                col_count = max(len(r) for r in tbl_rows)
                t = docx.add_table(rows=len(tbl_rows), cols=col_count)
                t.style = "Table Grid"
                for r_i, r_vals in enumerate(tbl_rows):
                    for c_i in range(col_count):
                        val = r_vals[c_i] if c_i < len(r_vals) else ""
                        cell = t.cell(r_i, c_i)
                        cell.text = val
                        if r_i == 0 and cell.paragraphs and cell.paragraphs[0].runs:
                            cell.paragraphs[0].runs[0].bold = True

            # Extract embedded images from pypdf page if present
            if p_idx < len(reader.pages):
                try:
                    for img_obj in reader.pages[p_idx].images:
                        try:
                            with Image.open(io.BytesIO(img_obj.data)) as pil:
                                png_buf = io.BytesIO()
                                pil.convert("RGB").save(png_buf, format="PNG")
                                png_buf.seek(0)
                            docx.add_picture(png_buf, width=DocxInches(4.5))
                            images_total += 1
                        except Exception:
                            pass
                except Exception:
                    pass

        page_count = len(pdf.pages)

    out = io.BytesIO()
    docx.save(out)
    return out.getvalue(), {
        "source_format": "pdf",
        "target_format": "docx",
        "source_pages": page_count,
        "tables_extracted": tables_total,
        "images_extracted": images_total,
    }


def _coerce_excel_value(raw: str) -> Any:
    s = raw.strip()
    if not s:
        return ""
    cleaned = s.replace(",", "")
    if re.fullmatch(r"-?\d+", cleaned):
        try:
            return int(cleaned)
        except ValueError:
            return s
    if re.fullmatch(r"-?\d+\.\d+", cleaned):
        try:
            return float(cleaned)
        except ValueError:
            return s
    return s


def pdf_to_xlsx(raw_bytes: bytes) -> tuple[bytes, dict[str, Any]]:
    """Extract tables and structured rows from a PDF into a styled XLSX workbook."""
    reader = PdfReader(io.BytesIO(raw_bytes), strict=False)
    if reader.is_encrypted:
        raise ValueError("Cannot convert an encrypted PDF. Unlock it first.")

    wb = openpyxl.Workbook()
    # Remove default sheet later once we add populated sheets
    default_ws = wb.active
    header_fill = PatternFill("solid", fgColor="312E81")
    zebra_fill = PatternFill("solid", fgColor="F8FAFC")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    body_font = Font(color="0F172A", size=10)
    thin = Side(border_style="thin", color="CBD5E1")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    tables_count = 0
    sheet_names_used = 0

    def _write_table_sheet(title: str, rows: list[list[str]]) -> None:
        nonlocal sheet_names_used
        sheet_names_used += 1
        ws = wb.create_sheet(title=title[:31])
        ws.freeze_panes = "A2"
        col_widths: dict[int, int] = {}
        for r_idx, row in enumerate(rows, start=1):
            for c_idx, val in enumerate(row, start=1):
                coerced = val if r_idx == 1 else _coerce_excel_value(val)
                cell = ws.cell(row=r_idx, column=c_idx, value=coerced)
                cell.border = border
                cell.alignment = Alignment(vertical="top", wrap_text=True)
                if r_idx == 1:
                    cell.fill = header_fill
                    cell.font = header_font
                else:
                    cell.font = body_font
                    if r_idx % 2 == 1:
                        cell.fill = zebra_fill
                col_widths[c_idx] = max(col_widths.get(c_idx, 10), min(len(str(coerced)) + 4, 48))
        for c_idx, width in col_widths.items():
            ws.column_dimensions[get_column_letter(c_idx)].width = width

    with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
        text_fallback_rows: list[list[str]] = [["Page", "Line", "Content"]]
        for p_idx, page in enumerate(pdf.pages, start=1):
            raw_tables = page.extract_tables() or []
            for t_idx, raw_tbl in enumerate(raw_tables, start=1):
                cleaned = [[(c or "").strip() for c in r] for r in raw_tbl if r]
                cleaned = [r for r in cleaned if any(cell for cell in r)]
                if cleaned:
                    tables_count += 1
                    _write_table_sheet(f"P{p_idx}_Table_{t_idx}", cleaned)

            txt = (page.extract_text() or "").strip()
            for l_idx, line in enumerate(txt.splitlines(), start=1):
                if line.strip():
                    text_fallback_rows.append([str(p_idx), str(l_idx), line.strip()])

        if tables_count == 0:
            _write_table_sheet("Extracted_Content", text_fallback_rows)
        elif len(text_fallback_rows) > 1:
            _write_table_sheet("All_Text_Lines", text_fallback_rows)

        page_count = len(pdf.pages)

    if default_ws is not None and sheet_names_used > 0:
        wb.remove(default_ws)

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue(), {
        "source_format": "pdf",
        "target_format": "xlsx",
        "source_pages": page_count,
        "tables_extracted": tables_count,
        "sheets_created": len(wb.worksheets),
    }


def _render_pdf_page_pngs(pdf_bytes: bytes, max_pages: int = 60) -> dict[int, bytes]:
    rendered: dict[int, bytes] = {}
    try:
        import pypdfium2 as pdfium

        doc = pdfium.PdfDocument(pdf_bytes)
        try:
            for idx in range(min(len(doc), max_pages)):
                page = doc[idx]
                bitmap = page.render(scale=1.6)
                pil = bitmap.to_pil()
                buf = io.BytesIO()
                pil.save(buf, format="PNG")
                rendered[idx + 1] = buf.getvalue()
                page.close()
        finally:
            doc.close()
    except Exception:
        return {}
    return rendered


def pdf_to_pptx(raw_bytes: bytes, mode: str = "hybrid") -> tuple[bytes, dict[str, Any]]:
    """Convert PDF pages into a 16:9 PPTX presentation (hybrid, editable, or visual mode)."""
    reader = PdfReader(io.BytesIO(raw_bytes), strict=False)
    if reader.is_encrypted:
        raise ValueError("Cannot convert an encrypted PDF. Unlock it first.")

    prs = Presentation()
    prs.slide_width = PptxInches(13.333)
    prs.slide_height = PptxInches(7.5)
    blank_layout = prs.slide_layouts[6]

    pngs = _render_pdf_page_pngs(raw_bytes) if mode in ("hybrid", "visual") else {}

    with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
        for p_idx, page in enumerate(pdf.pages, start=1):
            slide = prs.slides.add_slide(blank_layout)
            blocks, tables = _extract_pdf_page_structure(page)
            page_text = (page.extract_text() or "").strip()

            # Speaker notes always get the full page text
            notes_slide = slide.notes_slide
            notes_tf = notes_slide.notes_text_frame
            if notes_tf is not None:
                notes_tf.text = page_text or f"Page {p_idx}"

            if mode == "visual" and p_idx in pngs:
                slide.shapes.add_picture(
                    io.BytesIO(pngs[p_idx]),
                    PptxInches(0.35),
                    PptxInches(0.25),
                    height=PptxInches(7.0),
                )
                continue

            # Title selection
            title_text = f"Page {p_idx}"
            body_lines: list[str] = []
            for b in blocks:
                if b["kind"] in ("h1", "h2") and title_text == f"Page {p_idx}":
                    title_text = b["text"][:100]
                else:
                    body_lines.append(b["text"])
            if not body_lines and page_text:
                split_lines = [ln.strip() for ln in page_text.splitlines() if ln.strip()]
                if split_lines:
                    if title_text == f"Page {p_idx}":
                        title_text = split_lines[0][:100]
                        body_lines = split_lines[1:]
                    else:
                        body_lines = split_lines

            title_box = slide.shapes.add_textbox(
                PptxInches(0.6), PptxInches(0.35), PptxInches(12.1), PptxInches(0.8)
            )
            ttf = title_box.text_frame
            ttf.word_wrap = True
            tp = ttf.paragraphs[0]
            tp.text = title_text
            tp.font.size = PptxPt(24)
            tp.font.bold = True

            if mode == "hybrid" and p_idx in pngs:
                slide.shapes.add_picture(
                    io.BytesIO(pngs[p_idx]),
                    PptxInches(0.6),
                    PptxInches(1.25),
                    width=PptxInches(5.4),
                )
                text_left, text_w = PptxInches(6.3), PptxInches(6.4)
            else:
                text_left, text_w = PptxInches(0.6), PptxInches(12.1)

            body_box = slide.shapes.add_textbox(
                text_left, PptxInches(1.25), text_w, PptxInches(5.6)
            )
            btf = body_box.text_frame
            btf.word_wrap = True
            for idx_line, line_txt in enumerate(body_lines[:18]):
                bp = btf.paragraphs[0] if idx_line == 0 else btf.add_paragraph()
                bp.text = f"• {line_txt}" if not line_txt.startswith("•") else line_txt
                bp.font.size = PptxPt(13)
                bp.space_after = PptxPt(6)

            if tables and mode == "editable":
                first_tbl = tables[0][:8]
                c_count = max(len(r) for r in first_tbl)
                shape_tbl = slide.shapes.add_table(
                    len(first_tbl),
                    c_count,
                    PptxInches(0.6),
                    PptxInches(4.3),
                    PptxInches(12.1),
                    PptxInches(2.6),
                ).table
                for r_i, row in enumerate(first_tbl):
                    for c_i in range(c_count):
                        shape_tbl.cell(r_i, c_i).text = row[c_i] if c_i < len(row) else ""

        page_count = len(pdf.pages)

    out = io.BytesIO()
    prs.save(out)
    return out.getvalue(), {
        "source_format": "pdf",
        "target_format": "pptx",
        "mode": mode,
        "slides_created": page_count,
    }


def pdf_to_markdown(raw_bytes: bytes) -> tuple[bytes, dict[str, Any]]:
    """Convert PDF into clean GitHub-Flavored Markdown with headings, lists, and tables."""
    reader = PdfReader(io.BytesIO(raw_bytes), strict=False)
    if reader.is_encrypted:
        raise ValueError("Cannot convert an encrypted PDF. Unlock it first.")

    parts: list[str] = []
    tables_total = 0

    with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
        for p_idx, page in enumerate(pdf.pages, start=1):
            parts.append(f"<!-- Page {p_idx} -->")
            blocks, tables = _extract_pdf_page_structure(page)
            para_buf: list[str] = []

            for blk in blocks:
                kind = blk["kind"]
                txt = blk["text"]
                if kind == "h1":
                    if para_buf:
                        parts.append(" ".join(para_buf))
                        parts.append("")
                        para_buf.clear()
                    parts.append(f"# {txt}")
                    parts.append("")
                elif kind == "h2":
                    if para_buf:
                        parts.append(" ".join(para_buf))
                        parts.append("")
                        para_buf.clear()
                    parts.append(f"## {txt}")
                    parts.append("")
                elif kind == "bullet":
                    if para_buf:
                        parts.append(" ".join(para_buf))
                        parts.append("")
                        para_buf.clear()
                    clean = re.sub(r"^[•\-*]\s*", "", txt)
                    parts.append(f"- {clean}")
                else:
                    para_buf.append(txt)
            if para_buf:
                parts.append(" ".join(para_buf))
                parts.append("")
                para_buf.clear()

            for tbl_rows in tables:
                tables_total += 1
                col_count = max(len(r) for r in tbl_rows)
                norm = [r + [""] * (col_count - len(r)) for r in tbl_rows]
                header = "| " + " | ".join(c.replace("\n", " ") for c in norm[0]) + " |"
                sep = "| " + " | ".join("---" for _ in range(col_count)) + " |"
                parts.append(header)
                parts.append(sep)
                for row in norm[1:]:
                    parts.append("| " + " | ".join(c.replace("\n", " ") for c in row) + " |")
                parts.append("")

        page_count = len(pdf.pages)

    md_bytes = "\n".join(parts).strip().encode("utf-8") + b"\n"
    return md_bytes, {
        "source_format": "pdf",
        "target_format": "md",
        "source_pages": page_count,
        "tables_extracted": tables_total,
    }


def markdown_to_docx(raw_bytes: bytes) -> tuple[bytes, dict[str, Any]]:
    """Convert Markdown or UTF-8 text into a styled DOCX document."""
    text = raw_bytes.decode("utf-8", errors="replace")
    blocks = _parse_markdown_blocks(text)
    docx = DocxDocument()

    for blk in blocks:
        btype = blk["type"]
        if btype == "heading":
            docx.add_heading(blk["text"], level=min(3, blk["level"]))
        elif btype == "paragraph":
            docx.add_paragraph(blk["text"])
        elif btype == "quote":
            p = docx.add_paragraph(blk["text"])
            if p.runs:
                p.runs[0].italic = True
                p.runs[0].font.color.rgb = DocxRGBColor(0x47, 0x55, 0x69)
        elif btype == "code":
            p = docx.add_paragraph()
            run = p.add_run(blk["text"])
            run.font.name = "Courier New"
            run.font.size = DocxPt(9.5)
        elif btype == "list":
            for ordered, item_text in blk["items"]:
                docx.add_paragraph(
                    item_text, style="List Number" if ordered else "List Bullet"
                )
        elif btype == "table":
            rows = blk["rows"]
            col_count = max(len(r) for r in rows)
            t = docx.add_table(rows=len(rows), cols=col_count)
            t.style = "Table Grid"
            for r_i, row in enumerate(rows):
                for c_i in range(col_count):
                    cell = t.cell(r_i, c_i)
                    cell.text = row[c_i] if c_i < len(row) else ""
                    if r_i == 0 and cell.paragraphs and cell.paragraphs[0].runs:
                        cell.paragraphs[0].runs[0].bold = True

    out = io.BytesIO()
    docx.save(out)
    return out.getvalue(), {
        "source_format": "md",
        "target_format": "docx",
        "blocks": len(blocks),
    }


def docx_to_markdown(raw_bytes: bytes) -> tuple[bytes, dict[str, Any]]:
    """Convert DOCX paragraphs and tables into clean Markdown."""
    doc = DocxDocument(io.BytesIO(raw_bytes))
    para_map = {p._element: p for p in doc.paragraphs}
    table_map = {t._element: t for t in doc.tables}
    lines: list[str] = []

    for child in doc.element.body:
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p" and child in para_map:
            para = para_map[child]
            txt = para.text.strip()
            if not txt:
                continue
            style_name = ((para.style.name if para.style else "") or "").lower()
            if "title" in style_name or "heading 1" in style_name:
                lines.append(f"# {txt}\n")
            elif "heading 2" in style_name:
                lines.append(f"## {txt}\n")
            elif "heading" in style_name:
                lines.append(f"### {txt}\n")
            elif "bullet" in style_name or "list" in style_name:
                lines.append(f"- {txt}")
            else:
                lines.append(f"{txt}\n")
        elif tag == "tbl" and child in table_map:
            tbl = table_map[child]
            rows = [[c.text.strip().replace("\n", " ") for c in r.cells] for r in tbl.rows]
            if rows:
                cols = max(len(r) for r in rows)
                norm = [r + [""] * (cols - len(r)) for r in rows]
                lines.append("| " + " | ".join(norm[0]) + " |")
                lines.append("| " + " | ".join("---" for _ in range(cols)) + " |")
                for row in norm[1:]:
                    lines.append("| " + " | ".join(row) + " |")
                lines.append("")

    md_bytes = "\n".join(lines).strip().encode("utf-8") + b"\n"
    return md_bytes, {"source_format": "docx", "target_format": "md"}


def infer_source_format(filename: str, mime_type: str) -> str:
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext in ("htm",):
        return "html"
    if ext in ("jpeg",):
        return "jpg"
    if ext in SUPPORTED_CONVERSION_MATRIX:
        return "md" if ext in ("markdown",) else ext
    mime_map = {
        "application/pdf": "pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
        "text/markdown": "md",
        "text/plain": "txt",
        "text/html": "html",
        "image/png": "png",
        "image/jpeg": "jpg",
    }
    return mime_map.get(mime_type, ext)


def convert_document_bytes(
    raw_bytes: bytes,
    source_format: str,
    target_format: str,
    options: dict[str, Any] | None = None,
) -> tuple[bytes, str, str, dict[str, Any]]:
    """Run deterministic conversion pipeline returning (bytes, extension, mime_type, metrics)."""
    from worker import conversion_engine

    src = "md" if source_format in ("markdown",) else source_format.lower()
    src = "html" if src == "htm" else ("jpg" if src == "jpeg" else src)
    tgt = "md" if target_format in ("markdown",) else target_format.lower()
    opts = options or {}

    allowed = SUPPORTED_CONVERSION_MATRIX.get(src, [])
    if tgt not in allowed:
        raise ValueError(f"Conversion from '{src}' to '{tgt}' is not supported.")

    if src == "md" and tgt == "docx":
        out, meta = markdown_to_docx(raw_bytes)
        return out, ".docx", MIME_BY_FORMAT["docx"], meta
    if src == "docx" and tgt == "md":
        out, meta = docx_to_markdown(raw_bytes)
        return out, ".md", MIME_BY_FORMAT["md"], meta
    if src == "pdf" and tgt == "pptx" and str(opts.get("pptx_mode", "hybrid")) != "image_only":
        out, meta = pdf_to_pptx(raw_bytes, mode=str(opts.get("pptx_mode", "hybrid")))
        return out, ".pptx", MIME_BY_FORMAT["pptx"], meta

    doc_mode = str(opts.get("mode") or opts.get("conversion_mode") or "editable")
    font_name = str(opts.get("font_name") or opts.get("font_family") or "Times New Roman")
    artifact = conversion_engine.convert_document(
        raw_bytes,
        source_mime=MIME_BY_FORMAT.get(src, "application/octet-stream"),
        filename=f"document.{src}",
        target_format=tgt,
        mode=doc_mode,
        font_name=font_name,
    )
    conv_meta: dict[str, Any] = dict(artifact.meta)
    conv_meta["source_format"] = src
    conv_meta["target_format"] = tgt
    conv_meta["conversion_mode"] = doc_mode
    conv_meta["warnings"] = list(artifact.warnings)
    conv_meta["font_warnings"] = list(artifact.font_warnings)
    return artifact.output_bytes, artifact.output_ext, artifact.output_mime, conv_meta
