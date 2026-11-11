from __future__ import annotations

import io
from pathlib import Path

import openpyxl
import pytest
from app.services import agent_planner, embeddings, text_extractor
from docx import Document as DocxDocument
from pptx import Presentation
from worker import converter

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def test_text_extractor_across_all_formats() -> None:
    pdf_bytes = (FIXTURES / "sample_multipage.pdf").read_bytes()
    pdf_segs = text_extractor.extract_document_segments(
        pdf_bytes, "application/pdf", "sample.pdf"
    )
    assert len(pdf_segs) >= 1

    # DOCX
    doc = DocxDocument()
    doc.add_heading("Research Paper", level=1)
    doc.add_paragraph("Embeddings enable semantic search.")
    tbl = doc.add_table(rows=2, cols=2)
    tbl.cell(0, 0).text = "Metric"
    tbl.cell(0, 1).text = "Score"
    tbl.cell(1, 0).text = "Recall"
    tbl.cell(1, 1).text = "0.94"
    docx_buf = io.BytesIO()
    doc.save(docx_buf)
    docx_segs = text_extractor.extract_document_segments(
        docx_buf.getvalue(),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "paper.docx",
    )
    assert any("Embeddings enable semantic search" in s.text for s in docx_segs)

    # XLSX
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = "Metrics"
    ws.append(["Service", "Latency"])
    ws.append(["RAG", "42ms"])
    xlsx_buf = io.BytesIO()
    wb.save(xlsx_buf)
    xlsx_segs = text_extractor.extract_document_segments(
        xlsx_buf.getvalue(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "metrics.xlsx",
    )
    assert any("42ms" in s.text for s in xlsx_segs)

    # PPTX
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    if slide.shapes.title:
        slide.shapes.title.text = "System Overview"
    ppt_buf = io.BytesIO()
    prs.save(ppt_buf)
    ppt_segs = text_extractor.extract_document_segments(
        ppt_buf.getvalue(),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "deck.pptx",
    )
    assert any("System Overview" in s.text for s in ppt_segs)

    # Unknown binary returns empty list
    assert (
        text_extractor.extract_document_segments(
            b"\x89PNG\r\n\x1a\n", "image/png", "photo.png"
        )
        == []
    )


def test_deterministic_agent_planner_clauses() -> None:
    steps, summary = agent_planner.plan_command_deterministic(
        "rotate page 1 by 90, extract pages 1-2, protect with pass123, "
        "search deployment architecture, and ask what is the deadline?",
        document_id="doc-1",
        document_ids=["doc-1", "doc-2"],
        page_count=5,
        source_format="pdf",
    )
    tool_names = [s["tool_name"] for s in steps]
    assert "rotate_pdf" in tool_names
    assert "extract_pages" in tool_names
    assert "protect_pdf" in tool_names
    assert "semantic_search" in tool_names
    assert "rag_qa" in tool_names
    assert "step" in summary.lower()

    merge_steps, _ = agent_planner.plan_command_deterministic(
        "merge documents",
        document_id="doc-1",
        document_ids=["doc-1", "doc-2"],
        page_count=5,
        source_format="pdf",
    )
    assert merge_steps[0]["tool_name"] == "merge_pdf"

    split_steps, _ = agent_planner.plan_command_deterministic(
        "split every 2 pages",
        document_id="doc-1",
        document_ids=["doc-1"],
        page_count=5,
        source_format="pdf",
    )
    assert split_steps[0]["tool_name"] == "split_pdf"

    ocr_steps, _ = agent_planner.plan_command_deterministic(
        "run tamil ocr",
        document_id="doc-1",
        document_ids=["doc-1"],
        page_count=2,
        source_format="pdf",
    )
    assert ocr_steps[0]["tool_name"] == "ocr_document"

    none_steps, _ = agent_planner.plan_command_deterministic(
        "sing a lullaby please",
        document_id="doc-1",
        document_ids=["doc-1"],
        page_count=2,
        source_format="pdf",
    )
    assert none_steps == []


@pytest.mark.asyncio
async def test_embeddings_generation_and_edge_cases() -> None:
    assert embeddings.cosine_similarity([], [1.0]) == 0.0
    assert embeddings.cosine_similarity([0.0, 0.0], [0.0, 0.0]) == 0.0
    tokens = embeddings.tokenize_for_search("PostgreSQL pgvector embeddings v16")
    assert "postgresql" in tokens
    assert "pgvector" in tokens

    vecs, backend = await embeddings.generate_embeddings(
        ["Document intelligence semantic search", "Compress PDF under 200 KB"]
    )
    assert backend == "local-semantic-hash-384"
    assert len(vecs) == 2
    assert len(vecs[0]) == 384


def test_additional_converter_targets() -> None:
    pdf_bytes = (FIXTURES / "sample_multipage.pdf").read_bytes()

    html_bytes, html_meta = converter.pdf_to_html(pdf_bytes)
    assert b"<html" in html_bytes.lower()
    assert html_meta["target_format"] == "html"

    txt_bytes, txt_meta = converter.pdf_to_text(pdf_bytes)
    assert len(txt_bytes.decode("utf-8").strip()) > 0
    assert txt_meta["target_format"] == "txt"

    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.append(["Name", "Value"])
    ws.append(["Alpha", 10])
    xlsx_buf = io.BytesIO()
    wb.save(xlsx_buf)

    csv_bytes, _, csv_mime, _ = converter.convert_document_bytes(
        xlsx_buf.getvalue(), source_format="xlsx", target_format="csv"
    )
    assert b"Alpha,10" in csv_bytes
    assert csv_mime == "text/csv"

    doc = DocxDocument()
    doc.add_heading("Notes", level=1)
    doc.add_paragraph("Export check")
    docx_buf = io.BytesIO()
    doc.save(docx_buf)

    docx_txt, _, _, _ = converter.convert_document_bytes(
        docx_buf.getvalue(), source_format="docx", target_format="txt"
    )
    assert b"Export check" in docx_txt
