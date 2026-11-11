from __future__ import annotations

import asyncio
import io
from pathlib import Path
from typing import Any

import httpx
import pytest
import pytest_asyncio
from app.core.config import get_settings
from app.db import session as db_session
from app.db.models import Base
from app.main import app
from app.services import agent_executor, job_runner
from app.services import storage as storage_service
from app.services.embeddings import cosine_similarity, local_semantic_embed
from app.services.rag import chunk_segments
from app.services.text_extractor import ExtractedSegment
from docx import Document as DocxDocument
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


@pytest_asyncio.fixture()
async def phase_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_file = tmp_path / "phases_2_3_4.db"
    storage_dir = tmp_path / "storage"
    storage_dir.mkdir(parents=True, exist_ok=True)

    engine = create_async_engine(f"sqlite+aiosqlite:///{db_file.as_posix()}", future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )

    monkeypatch.setattr(db_session, "AsyncSessionLocal", session_factory)
    monkeypatch.setattr(agent_executor, "AsyncSessionLocal", session_factory)
    if hasattr(job_runner, "AsyncSessionLocal"):
        monkeypatch.setattr(job_runner, "AsyncSessionLocal", session_factory)

    monkeypatch.setattr(
        storage_service,
        "_adapter",
        storage_service.LocalStorageAdapter(str(storage_dir)),
    )
    settings = get_settings()
    monkeypatch.setattr(settings, "local_storage_path", str(storage_dir))

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[db_session.get_db] = _override_get_db

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

    app.dependency_overrides.clear()
    await engine.dispose()


async def _wait_for_job(
    client: httpx.AsyncClient, headers: dict[str, str], job_id: str
) -> dict[str, Any]:
    for _ in range(100):
        resp = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
        assert resp.status_code == 200
        payload = resp.json()["data"]
        if payload["status"] in ("completed", "failed"):
            return payload
        await asyncio.sleep(0.05)
    raise AssertionError(f"Job {job_id} did not finish")


async def _wait_for_run(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    run_id: str,
    target_statuses: tuple[str, ...] = ("completed", "failed", "cancelled"),
) -> dict[str, Any]:
    for _ in range(120):
        resp = await client.get(f"/api/v1/ai/agent/runs/{run_id}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        if data["status"] in target_statuses:
            return data
        await asyncio.sleep(0.05)
    raise AssertionError(f"Agent run {run_id} did not reach {target_statuses}")


def test_rag_chunking_and_embedding_similarity() -> None:
    segments = [
        ExtractedSegment(
            page_no=1,
            section_title=None,
            text="pgvector enables semantic nearest neighbor retrieval for PDF knowledge bases. "
            * 15,
        )
    ]
    chunks = chunk_segments(segments, chunk_size=280, overlap=60)
    assert len(chunks) >= 2

    q_vec = local_semantic_embed("semantic vector retrieval PDF", dim=384)
    hit_vec = local_semantic_embed(chunks[0].content, dim=384)
    unrelated_vec = local_semantic_embed("banana recipe flour oven baking", dim=384)
    assert cosine_similarity(q_vec, hit_vec) > cosine_similarity(q_vec, unrelated_vec)


@pytest.mark.asyncio
async def test_phase2_rag_search_qa_summary_and_idor(phase_client: httpx.AsyncClient) -> None:
    g1 = await phase_client.post("/api/v1/auth/guest")
    assert g1.status_code in (200, 201)
    headers1 = {"Authorization": f"Bearer {g1.json()['data']['access_token']}"}

    g2 = await phase_client.post("/api/v1/auth/guest")
    assert g2.status_code in (200, 201)
    headers2 = {"Authorization": f"Bearer {g2.json()['data']['access_token']}"}

    md_content = (
        b"# Cloud Migration Architecture\n\n"
        b"Primary database runs on PostgreSQL 16 with pgvector 384-dim embeddings.\n"
        b"Zero downtime blue-green rollout deadline is November 15.\n\n"
        b"# Security Controls\n\n"
        b"All uploaded files pass ClamAV signature scanning and strict magic-byte validation.\n"
    )

    up_md = await phase_client.post(
        "/api/v1/documents/upload",
        headers=headers1,
        files={"file": ("architecture.md", md_content, "text/markdown")},
    )
    assert up_md.status_code == 201
    md_doc_id = up_md.json()["data"]["id"]

    pdf_bytes = (FIXTURES / "sample_multipage.pdf").read_bytes()
    up_pdf = await phase_client.post(
        "/api/v1/documents/upload",
        headers=headers1,
        files={"file": ("multi.pdf", pdf_bytes, "application/pdf")},
    )
    assert up_pdf.status_code == 201
    pdf_doc_id = up_pdf.json()["data"]["id"]

    # Index status & explicit force re-index
    idx_status = await phase_client.get(
        f"/api/v1/ai/documents/{md_doc_id}/index", headers=headers1
    )
    assert idx_status.status_code == 200
    assert idx_status.json()["data"]["chunk_count"] >= 1

    reindex = await phase_client.post(
        f"/api/v1/ai/documents/{md_doc_id}/index",
        headers=headers1,
        json={"force": True},
    )
    assert reindex.status_code == 200
    assert reindex.json()["data"]["indexed"] is True

    # Semantic search & hybrid GET /search
    ai_search = await phase_client.post(
        "/api/v1/ai/search",
        headers=headers1,
        json={"query": "pgvector rollout deadline November", "mode": "hybrid", "limit": 5},
    )
    assert ai_search.status_code == 200
    hits = ai_search.json()["data"]
    assert len(hits) >= 1
    assert hits[0]["document_id"] == md_doc_id

    hybrid_get = await phase_client.get(
        "/api/v1/search?q=ClamAV&mode=hybrid", headers=headers1
    )
    assert hybrid_get.status_code == 200
    assert any(item["id"] == md_doc_id for item in hybrid_get.json()["data"])

    # Cited Q&A across documents + thread persistence
    qa1 = await phase_client.post(
        "/api/v1/ai/qa/ask",
        headers=headers1,
        json={
            "question": "What database and rollout deadline are planned?",
            "document_id": md_doc_id,
        },
    )
    assert qa1.status_code == 200
    qa1_data = qa1.json()["data"]
    assert qa1_data["thread_id"]
    assert len(qa1_data["citations"]) >= 1
    assert "pgvector" in qa1_data["answer"] or "November" in qa1_data["answer"]

    qa2 = await phase_client.post(
        "/api/v1/ai/qa/ask",
        headers=headers1,
        json={
            "question": "How is malware scanning handled?",
            "document_ids": [md_doc_id, pdf_doc_id],
            "thread_id": qa1_data["thread_id"],
        },
    )
    assert qa2.status_code == 200
    assert qa2.json()["data"]["thread_id"] == qa1_data["thread_id"]

    thread_detail = await phase_client.get(
        f"/api/v1/ai/qa/threads/{qa1_data['thread_id']}", headers=headers1
    )
    assert thread_detail.status_code == 200
    assert len(thread_detail.json()["data"]["messages"]) == 4

    # Document summary
    summary = await phase_client.post(
        f"/api/v1/ai/documents/{md_doc_id}/summarize",
        headers=headers1,
        json={},
    )
    assert summary.status_code == 200
    assert len(summary.json()["data"]["key_points"]) >= 1

    # Actor isolation (actor 2 cannot read actor 1 RAG resources)
    idor_search = await phase_client.post(
        "/api/v1/ai/search",
        headers=headers2,
        json={"query": "pgvector", "document_ids": [md_doc_id]},
    )
    assert idor_search.status_code in (200, 404)
    if idor_search.status_code == 200:
        assert idor_search.json()["data"] == []

    idor_thread = await phase_client.get(
        f"/api/v1/ai/qa/threads/{qa1_data['thread_id']}", headers=headers2
    )
    assert idor_thread.status_code == 404

    del_thread = await phase_client.delete(
        f"/api/v1/ai/qa/threads/{qa1_data['thread_id']}", headers=headers1
    )
    assert del_thread.status_code == 200


@pytest.mark.asyncio
async def test_phase3_format_conversions_end_to_end(phase_client: httpx.AsyncClient) -> None:
    guest = await phase_client.post("/api/v1/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['data']['access_token']}"}

    sup = await phase_client.get("/api/v1/tools/convert/supported", headers=headers)
    assert sup.status_code == 200
    assert "docx" in sup.json()["data"]["matrix"]["pdf"]

    pdf_bytes = (FIXTURES / "sample_multipage.pdf").read_bytes()
    up_pdf = await phase_client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("report.pdf", pdf_bytes, "application/pdf")},
    )
    assert up_pdf.status_code == 201
    pdf_doc_id = up_pdf.json()["data"]["id"]

    # PDF -> DOCX
    conv_docx = await phase_client.post(
        "/api/v1/tools/convert",
        headers=headers,
        json={"document_id": pdf_doc_id, "target_format": "docx"},
    )
    assert conv_docx.status_code == 202
    docx_job = await _wait_for_job(phase_client, headers, conv_docx.json()["data"]["id"])
    assert docx_job["status"] == "completed"
    docx_doc_id = docx_job["output_document_id"]
    assert docx_doc_id

    dl_docx = await phase_client.get(f"/api/v1/documents/{docx_doc_id}/download", headers=headers)
    assert dl_docx.status_code == 200
    parsed_docx = DocxDocument(io.BytesIO(dl_docx.content))
    assert len(parsed_docx.paragraphs) >= 1

    # Converted DOCX -> PDF round-trip
    conv_back = await phase_client.post(
        "/api/v1/tools/convert",
        headers=headers,
        json={"document_id": docx_doc_id, "target_format": "pdf"},
    )
    assert conv_back.status_code == 202
    back_job = await _wait_for_job(phase_client, headers, conv_back.json()["data"]["id"])
    assert back_job["status"] == "completed"
    dl_pdf = await phase_client.get(
        f"/api/v1/documents/{back_job['output_document_id']}/download", headers=headers
    )
    assert dl_pdf.content.startswith(b"%PDF-")
    assert len(PdfReader(io.BytesIO(dl_pdf.content)).pages) >= 1


@pytest.mark.asyncio
async def test_phase4_multistep_agent_workflow_granular_approvals(
    phase_client: httpx.AsyncClient,
) -> None:
    guest = await phase_client.post("/api/v1/auth/guest")
    headers = {"Authorization": f"Bearer {guest.json()['data']['access_token']}"}

    pdf_bytes = (FIXTURES / "sample_multipage.pdf").read_bytes()
    up_pdf = await phase_client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("assignment.pdf", pdf_bytes, "application/pdf")},
    )
    doc_id = up_pdf.json()["data"]["id"]

    # Compound multi-step plan
    plan_resp = await phase_client.post(
        "/api/v1/ai/agent/command",
        headers=headers,
        json={
            "command": "remove page 1, watermark DRAFT, add page numbers, and compress to 250 kb",
            "document_id": doc_id,
        },
    )
    assert plan_resp.status_code == 200
    plan = plan_resp.json()["data"]
    assert plan["status"] == "awaiting_approval"
    assert len(plan["steps"]) == 4
    run_id = plan["run_id"]

    # Granular approval: skip step 2 (watermark), override step 4 to 180 KB, run step-by-step
    step1_exec = await phase_client.post(
        f"/api/v1/ai/agent/runs/{run_id}/approve",
        headers=headers,
        json={
            "approve": True,
            "mode": "next_step",
            "step_approvals": {"1": True, "2": False, "3": True, "4": True},
            "step_overrides": {"4": {"target_kb": 180}},
        },
    )
    assert step1_exec.status_code == 200
    after_step1 = await _wait_for_run(
        phase_client, headers, run_id, target_statuses=("awaiting_approval", "completed", "failed")
    )
    assert after_step1["steps"][0]["execution_status"] == "completed"
    assert after_step1["steps"][1]["approval_status"] == "skipped"
    assert after_step1["status"] == "awaiting_approval"

    # Resume and run all remaining approved steps (steps 3 & 4)
    finish_exec = await phase_client.post(
        f"/api/v1/ai/agent/runs/{run_id}/approve",
        headers=headers,
        json={"approve": True, "mode": "all"},
    )
    assert finish_exec.status_code == 200
    finished = await _wait_for_run(phase_client, headers, run_id)
    assert finished["status"] == "completed"
    assert finished["steps"][2]["execution_status"] == "completed"
    assert finished["steps"][3]["execution_status"] == "completed"

    # Verify chained non-destructive immutable versions (v1 original + 3 completed edits => v4)
    doc_detail = await phase_client.get(f"/api/v1/documents/{doc_id}", headers=headers)
    assert doc_detail.status_code == 200
    assert doc_detail.json()["data"]["current_version_no"] == 4

    # Verify run history endpoints
    runs_list = await phase_client.get("/api/v1/ai/agent/runs", headers=headers)
    assert runs_list.status_code == 200
    assert any(r["run_id"] == run_id for r in runs_list.json()["data"])

    run_detail = await phase_client.get(f"/api/v1/ai/agent/runs/{run_id}", headers=headers)
    assert run_detail.status_code == 200
    assert len(run_detail.json()["data"]["execution_log"]) >= 3

    # Mixed conversion + RAG summarization chain
    mixed_plan = await phase_client.post(
        "/api/v1/ai/agent/command",
        headers=headers,
        json={
            "command": "convert to markdown and summarize key points",
            "document_id": doc_id,
        },
    )
    assert mixed_plan.status_code == 200
    mixed_data = mixed_plan.json()["data"]
    assert [s["tool_name"] for s in mixed_data["steps"]] == [
        "convert_document",
        "qa_summarize",
    ]

    mixed_exec = await phase_client.post(
        f"/api/v1/ai/agent/runs/{mixed_data['run_id']}/approve",
        headers=headers,
        json={"approve": True, "mode": "all"},
    )
    assert mixed_exec.status_code == 200
    mixed_done = await _wait_for_run(phase_client, headers, mixed_data["run_id"])
    assert mixed_done["status"] == "completed"
    assert mixed_done["steps"][0]["output_document_id"] is not None
    assert mixed_done["steps"][1]["output_preview"]
