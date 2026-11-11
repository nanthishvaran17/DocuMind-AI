from __future__ import annotations

import asyncio
import io
import os
from pathlib import Path

import openpyxl
import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image, ImageDraw
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


@pytest.fixture()
async def phase2_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_file = tmp_path / "test_phase2.db"
    storage_dir = tmp_path / "storage"
    storage_dir.mkdir(parents=True, exist_ok=True)
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    os.environ["LOCAL_STORAGE_PATH"] = str(storage_dir)
    os.environ["STORAGE_BACKEND"] = "local"
    os.environ["TASK_RUNNER"] = "inline"
    os.environ["CLAMAV_MODE"] = "disabled_dev"

    from app.core.config import get_settings
    from app.db import session as db_session
    from app.db.models import Base
    from app.main import create_app
    from app.services import agent_executor, job_runner
    from app.services import storage as storage_service
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    get_settings.cache_clear()
    settings = get_settings()
    monkeypatch.setattr(settings, "local_storage_path", str(storage_dir))

    iso_engine = create_async_engine(f"sqlite+aiosqlite:///{db_file.as_posix()}", future=True)
    async with iso_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=iso_engine,
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

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[db_session.get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    app.dependency_overrides.clear()
    await iso_engine.dispose()


async def _wait_for_job(client: AsyncClient, headers: dict[str, str], job_id: str) -> dict:
    for _ in range(400):
        resp = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
        assert resp.status_code == 200
        job = resp.json()["data"]
        if job["status"] in ("completed", "failed", "cancelled"):
            return job
        await asyncio.sleep(0.05)
    raise AssertionError(f"Job {job_id} did not finish")


def _sample_table_pdf_bytes() -> bytes:
    buf = io.BytesIO()
    styles = getSampleStyleSheet()
    tbl = Table(
        [
            ["Course", "Credits", "Fee"],
            ["Algorithms", "4", "$450.00"],
            ["Databases", "3", "$390.50"],
        ],
        colWidths=[150, 80, 90],
    )
    tbl.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, colors.grey)]))
    SimpleDocTemplate(buf, pagesize=letter).build(
        [Paragraph("Semester Registration", styles["Title"]), Spacer(1, 10), tbl]
    )
    return buf.getvalue()


def _sample_scan_png_bytes() -> bytes:
    img = Image.new("RGB", (600, 180), "white")
    draw = ImageDraw.Draw(img)
    draw.text((24, 50), "EXAM HALL TICKET 2026", fill="black")
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


@pytest.mark.asyncio
async def test_phase2_convert_quality_report_extract_tables_and_ocr(
    phase2_client: AsyncClient,
) -> None:
    guest = await phase2_client.post("/api/v1/auth/guest")
    assert guest.status_code == 201
    headers = {"Authorization": f"Bearer {guest.json()['data']['access_token']}"}

    # 1. Upload table-heavy PDF
    pdf_bytes = _sample_table_pdf_bytes()
    up = await phase2_client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("registration.pdf", pdf_bytes, "application/pdf")},
    )
    assert up.status_code == 201
    doc_id = up.json()["data"]["id"]

    # 2. Extract tables JSON preview
    tbl_json = await phase2_client.post(
        "/api/v1/tools/extract-tables",
        headers=headers,
        json={"document_id": doc_id, "output_format": "json"},
    )
    assert tbl_json.status_code == 200
    tbl_data = tbl_json.json()["data"]
    assert tbl_data["tables_count"] >= 1
    assert tbl_data["tables"][0]["rows_count"] == 3

    # 3. Convert PDF -> DOCX (editable) & check ConversionQualityReport + page image preview
    c_docx = await phase2_client.post(
        "/api/v1/tools/convert",
        headers=headers,
        json={"document_id": doc_id, "target_format": "docx", "mode": "editable"},
    )
    assert c_docx.status_code == 202
    job_docx = await _wait_for_job(phase2_client, headers, c_docx.json()["data"]["id"])
    assert job_docx["status"] == "completed"
    assert job_docx["output_document_id"] is not None

    qrep = await phase2_client.get(
        f"/api/v1/jobs/{job_docx['id']}/quality-report", headers=headers
    )
    assert qrep.status_code == 200
    qdata = qrep.json()["data"]
    assert qdata["source_format"] == "pdf"
    assert qdata["target_format"] == "docx"
    assert qdata["char_similarity"] >= 75.0
    assert qdata["source_table_count"] >= 1
    assert qdata["converted_table_count"] >= 1
    assert 1 in qdata["available_preview_pages"]

    src_png = await phase2_client.get(
        f"/api/v1/jobs/{job_docx['id']}/quality-report/page/1/source", headers=headers
    )
    assert src_png.status_code == 200
    assert src_png.headers["content-type"] == "image/png"

    # 4. Convert PDF -> XLSX & download output workbook
    c_xlsx = await phase2_client.post(
        "/api/v1/tools/convert",
        headers=headers,
        json={"document_id": doc_id, "target_format": "xlsx"},
    )
    assert c_xlsx.status_code == 202
    job_xlsx = await _wait_for_job(phase2_client, headers, c_xlsx.json()["data"]["id"])
    assert job_xlsx["status"] == "completed"
    xlsx_dl = await phase2_client.get(
        f"/api/v1/documents/{job_xlsx['output_document_id']}/download", headers=headers
    )
    assert xlsx_dl.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_dl.content), data_only=True)
    assert wb.active["B2"].value == 4

    # 5. Round-trip XLSX -> PDF
    c_back = await phase2_client.post(
        "/api/v1/tools/convert",
        headers=headers,
        json={"document_id": job_xlsx["output_document_id"], "target_format": "pdf"},
    )
    assert c_back.status_code == 202
    job_back = await _wait_for_job(phase2_client, headers, c_back.json()["data"]["id"])
    assert job_back["status"] == "completed"

    # 6. Upload PNG image & run OCR -> searchable PDF
    up_img = await phase2_client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("hallticket.png", _sample_scan_png_bytes(), "image/png")},
    )
    assert up_img.status_code == 201
    img_id = up_img.json()["data"]["id"]

    ocr_req = await phase2_client.post(
        "/api/v1/tools/ocr",
        headers=headers,
        json={"document_id": img_id, "language": "eng"},
    )
    assert ocr_req.status_code == 202
    job_ocr = await _wait_for_job(phase2_client, headers, ocr_req.json()["data"]["id"])
    assert job_ocr["status"] == "completed"
    assert job_ocr["result_meta"]["pages_processed"] == 1
    assert job_ocr["output_document_id"] is not None

    # 7. Agent planner recognizes extract tables & OCR clauses cleanly
    plan_ocr = await phase2_client.post(
        "/api/v1/ai/agent/command",
        headers=headers,
        json={"command": "run tamil ocr", "document_id": img_id},
    )
    assert plan_ocr.status_code == 200
    assert plan_ocr.json()["data"]["steps"][0]["tool_name"] == "ocr_document"
    assert plan_ocr.json()["data"]["steps"][0]["params"]["language"] == "tam"
