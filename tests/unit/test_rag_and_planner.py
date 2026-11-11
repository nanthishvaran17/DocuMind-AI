from __future__ import annotations

import io
from pathlib import Path

import openpyxl
import pytest
from app.services import agent_planner, embeddings, llm, text_extractor
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
    steps = agent_planner.plan_command_deterministic(
        "rotate page 1 by 90, extract pages 1-2, protect with pass123, "
        "search deployment architecture, and ask what is the deadline?",
        total_pages=5,
        doc_ids=["doc-1", "doc-2"],
        source_format="pdf",
    )
    tool_names = [s["tool_name"] for s in steps]
    assert "rotate_pdf" in tool_names
    assert "extract_pages" in tool_names
    assert "protect_pdf" in tool_names
    assert "semantic_search" in tool_names
    assert "rag_qa" in tool_names

    merge_steps = agent_planner.plan_command_deterministic(
        "merge documents",
        total_pages=5,
        doc_ids=["doc-1", "doc-2"],
        source_format="pdf",
    )
    assert merge_steps[0]["tool_name"] == "merge_pdf"

    split_steps = agent_planner.plan_command_deterministic(
        "split every 2 pages",
        total_pages=5,
        doc_ids=["doc-1"],
        source_format="pdf",
    )
    assert split_steps[0]["tool_name"] == "split_pdf"

    ocr_steps = agent_planner.plan_command_deterministic(
        "run tamil ocr",
        total_pages=2,
        doc_ids=["doc-1"],
        source_format="pdf",
    )
    assert ocr_steps[0]["tool_name"] == "ocr_document"

    none_steps = agent_planner.plan_command_deterministic(
        "sing a lullaby please",
        total_pages=2,
        doc_ids=["doc-1"],
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

    html_bytes, _, html_mime, html_meta = converter.convert_document_bytes(
        pdf_bytes, source_format="pdf", target_format="html"
    )
    assert b"<html" in html_bytes.lower()
    assert "html" in html_mime
    assert html_meta["target_format"] == "html"

    txt_bytes, _, _, txt_meta = converter.convert_document_bytes(
        pdf_bytes, source_format="pdf", target_format="txt"
    )
    assert len(txt_bytes.decode("utf-8").strip()) > 0
    assert txt_meta["target_format"] == "txt"

    json_bytes, _, _, json_meta = converter.convert_document_bytes(
        pdf_bytes, source_format="pdf", target_format="json"
    )
    assert b"pages" in json_bytes or b"text" in json_bytes
    assert json_meta["target_format"] == "json"

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
    assert "text/csv" in csv_mime

    doc = DocxDocument()
    doc.add_heading("Notes", level=1)
    doc.add_paragraph("Export check")
    docx_buf = io.BytesIO()
    doc.save(docx_buf)

    docx_txt, _, _, _ = converter.convert_document_bytes(
        docx_buf.getvalue(), source_format="docx", target_format="txt"
    )
    assert b"Export check" in docx_txt


@pytest.mark.asyncio
async def test_llm_local_synthesis_and_fallback() -> None:
    empty_ans = llm.synthesize_grounded_answer("What is DocuMind?", [])
    assert "could not find" in empty_ans.lower()

    citations = [
        {
            "index": 1,
            "document_name": "syllabus.pdf",
            "page_no": 2,
            "score": 0.92,
            "full_text": (
                "DocuMind AI supports semantic RAG search across uploaded PDF files. "
                "Users can compress exam documents to exact kilobyte targets."
            ),
            "snippet": "DocuMind AI supports semantic RAG search.",
        },
        {
            "index": 2,
            "document_name": "notes.md",
            "page_no": None,
            "score": 0.78,
            "full_text": "Format conversion supports DOCX, XLSX, PPTX, Markdown, and PDF.",
            "snippet": "Format conversion supports DOCX, XLSX, PPTX.",
        },
    ]

    concise = llm.synthesize_grounded_answer(
        "How does semantic RAG work?", citations, response_style="concise"
    )
    assert "Key takeaway" in concise
    assert "**[1]**" in concise

    academic = llm.synthesize_grounded_answer(
        "Which formats are converted?", citations, response_style="academic"
    )
    assert "Grounded synthesis" in academic

    balanced = llm.synthesize_grounded_answer(
        "Summarize features", citations, response_style="balanced"
    )
    assert "Based on the retrieved document passages" in balanced

    empty_sum, empty_pts, empty_cits = llm.synthesize_local_summary("empty.pdf", [])
    assert "No extractable text" in empty_sum
    assert empty_pts == []
    assert empty_cits == []

    many_chunks = [
        {
            "id": f"chunk-{idx + 1}",
            "document_id": "doc-1",
            "version_no": 1,
            "page_no": idx + 1,
            "section_title": f"Section {idx + 1}",
            "content": f"Paragraph {idx + 1} discusses key engineering workflows and metrics.",
        }
        for idx in range(7)
    ]
    summary_text, points, sum_cits = llm.synthesize_local_summary("report.pdf", many_chunks)
    assert "report.pdf" in summary_text
    assert len(points) == 5
    assert len(sum_cits) == 5

    raw_reply, model_used = await llm.call_chat_completion(
        system_prompt="You are helpful.",
        user_prompt="Hello",
    )
    assert raw_reply is None
    assert model_used == "documind-extractive-rag-v1"


@pytest.mark.asyncio
async def test_llm_and_embeddings_remote_providers(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx
    from app.core.config import get_settings

    class _FakeResponse:
        def __init__(self, payload: dict[str, object]) -> None:
            self._payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return self._payload

    class _FakeAsyncClient:
        response_payload: dict[str, object] = {}

        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        async def __aenter__(self) -> _FakeAsyncClient:
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(self, *args: object, **kwargs: object) -> _FakeResponse:
            return _FakeResponse(self.response_payload)

    monkeypatch.setattr(httpx, "AsyncClient", _FakeAsyncClient)
    settings = get_settings()

    # 1. OpenAI-compatible chat & embeddings
    monkeypatch.setattr(settings, "ai_provider", "openai_compatible")
    monkeypatch.setattr(settings, "ai_api_key", "sk-test")
    monkeypatch.setattr(settings, "ai_chat_model", "gpt-4o-mini")
    monkeypatch.setattr(settings, "ai_embedding_model", "text-embedding-3-small")

    _FakeAsyncClient.response_payload = {
        "choices": [{"message": {"content": "OpenAI grounded reply"}}]
    }
    reply, used = await llm.call_chat_completion("sys", "usr")
    assert reply == "OpenAI grounded reply"
    assert used == "gpt-4o-mini"

    _FakeAsyncClient.response_payload = {
        "data": [{"embedding": [0.5, 0.5]}, {"embedding": [1.0] * 500}]
    }
    vecs, emb_backend = await embeddings.generate_embeddings(["one", "two"])
    assert emb_backend == "text-embedding-3-small"
    assert len(vecs) == 2 and len(vecs[0]) == 384 and len(vecs[1]) == 384
    assert embeddings.cosine_similarity(vecs[0], vecs[0]) > 0.99
    assert embeddings.cosine_similarity([], []) == 0.0

    # 2. Anthropic chat
    monkeypatch.setattr(settings, "ai_provider", "anthropic")
    monkeypatch.setattr(settings, "ai_api_key", "")
    monkeypatch.setattr(settings, "anthropic_api_key", "ant-test")
    _FakeAsyncClient.response_payload = {
        "content": [{"type": "text", "text": "Claude grounded reply"}]
    }
    reply2, used2 = await llm.call_chat_completion("sys", "usr")
    assert reply2 == "Claude grounded reply"
    assert used2.startswith("anthropic:")

    # 3. Ollama chat & embeddings
    monkeypatch.setattr(settings, "ai_provider", "ollama")
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    monkeypatch.setattr(settings, "ollama_base_url", "http://127.0.0.1:11434")
    _FakeAsyncClient.response_payload = {"message": {"content": "Ollama grounded reply"}}
    reply3, used3 = await llm.call_chat_completion("sys", "usr")
    assert reply3 == "Ollama grounded reply"
    assert used3.startswith("ollama:")

    _FakeAsyncClient.response_payload = {"embeddings": [[0.1] * 384]}
    vecs3, emb3 = await embeddings.generate_embeddings(["ollama query"])
    assert emb3.startswith("ollama:")
    assert len(vecs3) == 1
