from __future__ import annotations

import io
from pathlib import Path

import openpyxl
from docx import Document as DocxDocument
from pptx import Presentation
from pypdf import PdfReader
from worker import converter

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def test_markdown_roundtrip_to_pdf_and_docx() -> None:
    md = (
        b"# Quarterly Engineering Report\n\n"
        b"Summary paragraph explaining system throughput.\n\n"
        b"- Latency reduced by 35%\n"
        b"- Vector search enabled\n\n"
        b"| Service | Status |\n"
        b"| --- | --- |\n"
        b"| RAG API | Healthy |\n"
        b"| Worker | Healthy |\n"
    )

    pdf_bytes, pdf_meta = converter.markdown_to_pdf(md)
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(PdfReader(io.BytesIO(pdf_bytes)).pages) >= 1
    assert pdf_meta["target_format"] == "pdf"

    docx_bytes, docx_meta = converter.markdown_to_docx(md)
    doc = DocxDocument(io.BytesIO(docx_bytes))
    full_text = "\n".join(p.text for p in doc.paragraphs)
    assert "Quarterly Engineering Report" in full_text
    assert len(doc.tables) == 1
    assert docx_meta["target_format"] == "docx"

    md_back, _ = converter.docx_to_markdown(docx_bytes)
    assert b"Quarterly Engineering Report" in md_back
    assert b"RAG API" in md_back


def test_office_to_pdf_pipelines() -> None:
    # DOCX -> PDF
    doc = DocxDocument()
    doc.add_heading("Student Transcript", level=1)
    doc.add_paragraph("Final grade verified for computer science coursework.")
    tbl = doc.add_table(rows=2, cols=2)
    tbl.cell(0, 0).text = "Course"
    tbl.cell(0, 1).text = "Credits"
    tbl.cell(1, 0).text = "Distributed Systems"
    tbl.cell(1, 1).text = "4"
    docx_buf = io.BytesIO()
    doc.save(docx_buf)

    docx_pdf, _ = converter.docx_to_pdf(docx_buf.getvalue())
    assert docx_pdf.startswith(b"%PDF-")
    assert len(PdfReader(io.BytesIO(docx_pdf)).pages) >= 1

    # XLSX -> PDF
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = "Budget"
    ws.append(["Category", "Amount"])
    ws.append(["Cloud", 1200])
    xlsx_buf = io.BytesIO()
    wb.save(xlsx_buf)

    xlsx_pdf, _ = converter.xlsx_to_pdf(xlsx_buf.getvalue())
    assert xlsx_pdf.startswith(b"%PDF-")

    # PPTX -> PDF
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    if slide.shapes.title:
        slide.shapes.title.text = "Architecture Review"
    pptx_buf = io.BytesIO()
    prs.save(pptx_buf)

    pptx_pdf, _ = converter.pptx_to_pdf(pptx_buf.getvalue())
    assert pptx_pdf.startswith(b"%PDF-")


def test_pdf_to_office_and_markdown_pipelines() -> None:
    pdf_bytes = (FIXTURES / "sample_multipage.pdf").read_bytes()

    docx_out, docx_meta = converter.pdf_to_docx(pdf_bytes)
    assert docx_meta["target_format"] == "docx"
    assert len(DocxDocument(io.BytesIO(docx_out)).paragraphs) >= 1

    xlsx_out, xlsx_meta = converter.pdf_to_xlsx(pdf_bytes)
    assert xlsx_meta["target_format"] == "xlsx"
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_out))
    assert len(wb.sheetnames) >= 1

    pptx_out, pptx_meta = converter.pdf_to_pptx(pdf_bytes, mode="editable")
    assert pptx_meta["target_format"] == "pptx"
    prs = Presentation(io.BytesIO(pptx_out))
    assert len(prs.slides) >= 1

    md_out, md_meta = converter.pdf_to_markdown(pdf_bytes)
    assert md_meta["target_format"] == "md"
    assert len(md_out.decode("utf-8").strip()) > 0


def test_infer_source_format_and_dispatch() -> None:
    assert converter.infer_source_format("notes.markdown", "text/plain") == "md"
    assert converter.infer_source_format("doc.bin", "application/pdf") == "pdf"

    md_bytes = b"# Dispatch Check\n\nValid body text."
    out_bytes, ext, mime, meta = converter.convert_document_bytes(
        md_bytes,
        source_format="md",
        target_format="pdf",
    )
    assert out_bytes.startswith(b"%PDF-")
    assert ext == ".pdf"
    assert "pdf" in mime
    assert meta["target_format"] == "pdf"
