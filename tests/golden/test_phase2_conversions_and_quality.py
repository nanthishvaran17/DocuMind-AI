from __future__ import annotations

import io
import zipfile
from unittest.mock import patch

import openpyxl
import pdfplumber
from docx import Document as DocxDocument
from PIL import Image, ImageDraw
from pptx import Presentation
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from worker import conversion_engine, converter, ocr_engine, quality_verifier


def _build_golden_invoice_pdf() -> bytes:
    """Create a real multi-paragraph + bordered-table PDF fixture."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("DocuMind Quarterly Lab Expense Report", styles["Title"]),
        Paragraph(
            "Department of Computer Science - Academic Budget Summary for Semester IV.",
            styles["Normal"],
        ),
        Spacer(1, 12),
        Table(
            [
                ["Item Code", "Description", "Qty", "Amount", "Growth"],
                ["CS-101", "Server Rack Cooling", "4", "$1,250.50", "12.5%"],
                ["CS-102", "GPU Compute Node", "2", "$4,800.00", "24.0%"],
                ["CS-103", "Optical Fiber Switch", "6", "$320.25", "5.2%"],
            ],
            colWidths=[75, 160, 45, 90, 70],
        ),
    ]
    story[-1].setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.75, colors.HexColor("#475569")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ]
        )
    )
    doc.build(story)
    return buf.getvalue()


def _build_golden_xlsx() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Marks"
    ws.append(["RollNo", "Student", "Math", "Physics", "Total"])
    ws.append(["2026A01", "Arjun Kumar", 94, 89, 183])
    ws.append(["2026A02", "Meera Devi", 98, 92, 190])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def _build_golden_docx() -> bytes:
    doc = DocxDocument()
    doc.add_heading("Research Synopsis", level=1)
    doc.add_paragraph("Neural retrieval benchmarks across multilingual student archives.")
    tbl = doc.add_table(rows=2, cols=3)
    tbl.cell(0, 0).text = "Dataset"
    tbl.cell(0, 1).text = "Queries"
    tbl.cell(0, 2).text = "Recall"
    tbl.cell(1, 0).text = "TN-Docs"
    tbl.cell(1, 1).text = "500"
    tbl.cell(1, 2).text = "93.4%"
    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()


def _build_english_scan_png() -> bytes:
    img = Image.new("RGB", (900, 280), "white")
    draw = ImageDraw.Draw(img)
    draw.text((40, 60), "DOCUMIND OPTICAL ARCHIVE TEST", fill="black")
    draw.text((40, 120), "Invoice Number 4092 Total 750", fill="black")
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def test_pdf_to_docx_modes_and_quality_report() -> None:
    pdf_bytes = _build_golden_invoice_pdf()

    for mode in ("editable", "high_fidelity", "hybrid"):
        artifact = conversion_engine.pdf_to_docx(
            pdf_bytes, mode=mode, base_name="quarterly_report.pdf"
        )
        assert artifact.output_ext == ".docx"
        docx_doc = DocxDocument(io.BytesIO(artifact.output_bytes))
        assert len(docx_doc.tables) >= 1
        assert len(docx_doc.tables[0].rows) == 4
        if mode == "hybrid":
            assert len(docx_doc.inline_shapes) >= 1

        qres = quality_verifier.verify_conversion_quality(
            source_bytes=pdf_bytes,
            source_ext="pdf",
            target_bytes=artifact.output_bytes,
            target_format="docx",
            artifact_warnings=artifact.warnings,
            font_warnings=artifact.font_warnings,
        )
        assert qres.source_page_count == 1
        assert qres.char_similarity >= 80.0
        assert qres.source_table_count >= 1
        assert (qres.converted_table_count or 0) >= 1
        assert qres.ssim_status in ("computed", "libreoffice_unavailable")


def test_pdf_to_xlsx_numeric_types_and_roundtrip() -> None:
    pdf_bytes = _build_golden_invoice_pdf()
    tables = conversion_engine.extract_tables_from_pdf(pdf_bytes)
    assert len(tables) >= 1
    assert tables[0]["rows_count"] == 4
    assert tables[0]["cols_count"] == 5

    xlsx_art = conversion_engine.pdf_to_xlsx(pdf_bytes, base_name="quarterly.pdf")
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_art.output_bytes), data_only=True)
    ws = wb.active
    assert ws["A1"].value == "Item Code"
    assert ws["C2"].value == 4
    assert isinstance(ws["D2"].value, float)
    assert ws["D2"].value == 1250.50

    # Round-trip XLSX -> PDF -> verify PDF quality + SSIM
    pdf_roundtrip = conversion_engine.office_or_text_to_pdf(
        _build_golden_xlsx(), source_ext="xlsx", base_name="marks.xlsx"
    )
    assert pdf_roundtrip.output_ext == ".pdf"
    reader = PdfReader(io.BytesIO(pdf_roundtrip.output_bytes))
    assert len(reader.pages) >= 1

    qres = quality_verifier.verify_conversion_quality(
        source_bytes=_build_golden_xlsx(),
        source_ext="xlsx",
        target_bytes=pdf_roundtrip.output_bytes,
        target_format="pdf",
    )
    assert qres.char_similarity >= 75.0
    assert qres.ssim_status in ("computed", "non_visual_target")


def test_bidirectional_office_text_and_bundles() -> None:
    # DOCX -> PDF
    docx_pdf = conversion_engine.office_or_text_to_pdf(
        _build_golden_docx(), source_ext="docx", base_name="synopsis.docx"
    )
    assert len(PdfReader(io.BytesIO(docx_pdf.output_bytes)).pages) >= 1

    # PPTX -> PDF
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "Architecture Review"
    pptx_buf = io.BytesIO()
    prs.save(pptx_buf)
    pptx_pdf = conversion_engine.office_or_text_to_pdf(
        pptx_buf.getvalue(), source_ext="pptx", base_name="slides.pptx"
    )
    assert "Architecture Review" in (
        PdfReader(io.BytesIO(pptx_pdf.output_bytes)).pages[0].extract_text() or ""
    )

    # HTML / MD -> PDF
    html_pdf = conversion_engine.office_or_text_to_pdf(
        b"<h1>Heading Alpha</h1><p>Structured HTML body line.</p>",
        source_ext="html",
        base_name="notes.html",
    )
    assert len(PdfReader(io.BytesIO(html_pdf.output_bytes)).pages) == 1

    # PDF -> PPTX / PNG / CSV / JSON / HTML / TXT
    golden_pdf = _build_golden_invoice_pdf()
    pptx_out, ext, mime, _ = converter.convert_document_bytes(
        golden_pdf, "pdf", "pptx", {"pptx_mode": "hybrid"}
    )
    assert ext == ".pptx" and "presentationml" in mime
    assert len(Presentation(io.BytesIO(pptx_out)).slides) == 1

    png_art = conversion_engine.pdf_to_images(golden_pdf, fmt="png", base_name="inv.pdf")
    assert png_art.output_ext == ".png"
    with Image.open(io.BytesIO(png_art.output_bytes)) as im:
        assert im.width > 200 and im.height > 200

    for tgt in ("txt", "md", "html", "csv", "json"):
        out_b, out_ext, _, _ = converter.convert_document_bytes(golden_pdf, "pdf", tgt)
        assert out_ext == f".{tgt}"
        assert len(out_b) > 20

    # Multi-page image export produces ZIP
    doc_2p = io.BytesIO()
    s = getSampleStyleSheet()
    SimpleDocTemplate(doc_2p, pagesize=letter).build(
        [Paragraph("Page One", s["Normal"]), PageBreak(), Paragraph("Page Two", s["Normal"])]
    )
    multi_art = conversion_engine.pdf_to_images(doc_2p.getvalue(), fmt="jpg", base_name="multi.pdf")
    assert multi_art.output_ext == ".zip"
    with zipfile.ZipFile(io.BytesIO(multi_art.output_bytes), "r") as zf:
        assert len(zf.namelist()) >= 2


def test_ocr_digital_skip_image_english_and_tamil_handling() -> None:
    # 1. Digital PDF bypasses OCR unless force_ocr=True
    digital_pdf = _build_golden_invoice_pdf()
    res_skip = ocr_engine.run_ocr(digital_pdf, is_pdf=True, language="eng", force_ocr=False)
    assert res_skip.pages_processed == 1
    assert res_skip.pages_ocr_applied == 0
    assert "Quarterly" in res_skip.extracted_text

    # 2. Image OCR (English)
    scan_png = _build_english_scan_png()
    res_img = ocr_engine.run_ocr(scan_png, is_pdf=False, language="eng")
    assert res_img.pages_processed == 1
    assert res_img.pages_ocr_applied == 1
    with pdfplumber.open(io.BytesIO(res_img.searchable_pdf_bytes)) as plum:
        assert len(plum.pages) == 1

    # 3. Tamil OCR when tesseract is absent records honest warning cleanly
    with patch("worker.ocr_engine.find_tesseract_binary", return_value=None):
        res_tam_warn = ocr_engine.run_ocr(scan_png, is_pdf=False, language="tam")
        assert res_tam_warn.pages_processed == 1
        assert any("Tamil" in w or "tam" in w.lower() for w in res_tam_warn.warnings)

    # 4. Simulated Tesseract Tamil output builds Unicode searchable PDF without errors
    fake_data = {
        "text": ["தமிழ்", "ஆவணம்", "2026"],
        "conf": ["91", "89", "95"],
        "left": [40, 140, 260],
        "top": [50, 50, 50],
        "width": [80, 90, 60],
        "height": [28, 28, 28],
    }
    with (
        patch("worker.ocr_engine.find_tesseract_binary", return_value="/usr/bin/tesseract"),
        patch("worker.ocr_engine._get_available_tesseract_langs", return_value={"eng", "tam"}),
        patch("worker.ocr_engine.pytesseract.image_to_data", return_value=fake_data),
    ):
        res_tam_ok = ocr_engine.run_ocr(scan_png, is_pdf=False, language="tam")
        assert res_tam_ok.engine_used == "tesseract:tam"
        assert "தமிழ்" in res_tam_ok.extracted_text
        assert res_tam_ok.mean_confidence is not None and res_tam_ok.mean_confidence > 85.0
