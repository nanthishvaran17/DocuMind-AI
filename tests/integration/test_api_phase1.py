from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


@pytest.fixture()
async def api_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_file = tmp_path / "test_api.db"
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
    for _ in range(40):
        resp = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
        assert resp.status_code == 200
        job = resp.json()["data"]
        if job["status"] in ("completed", "failed", "cancelled"):
            return job
        await asyncio.sleep(0.05)
    raise AssertionError("Timed out waiting for inline job completion.")


@pytest.mark.asyncio
async def test_health_auth_acl_and_version_immutability(api_client: AsyncClient) -> None:
    health = await api_client.get("/api/v1/health")
    assert health.status_code == 200
    assert health.json()["data"]["status"] == "ok"

    # Register User A (.edu.in triggers student verified flag)
    reg_a = await api_client.post(
        "/api/v1/auth/register",
        json={
            "email": "studentA@annauniv.edu.in",
            "password": "StrongPassword123!",
            "full_name": "Arjun Kumar",
            "locale": "ta",
        },
    )
    assert reg_a.status_code == 201
    token_a = reg_a.json()["data"]["access_token"]
    assert reg_a.json()["data"]["user"]["is_student_verified"] is True
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Register User B
    reg_b = await api_client.post(
        "/api/v1/auth/register",
        json={
            "email": "userB@example.com",
            "password": "StrongPassword123!",
            "full_name": "User B",
        },
    )
    assert reg_b.status_code == 201
    headers_b = {"Authorization": f"Bearer {reg_b.json()['data']['access_token']}"}

    # Upload PDF as User A
    pdf_bytes = (FIXTURES / "sample_multipage.pdf").read_bytes()
    up = await api_client.post(
        "/api/v1/documents/upload",
        headers=headers_a,
        files={"file": ("notes.pdf", pdf_bytes, "application/pdf")},
    )
    assert up.status_code == 201
    doc = up.json()["data"]
    doc_id = doc["id"]
    assert doc["page_count"] == 5
    assert doc["current_version_no"] == 1

    # Cross-user IDOR isolation check: User B must receive 404
    forbidden = await api_client.get(f"/api/v1/documents/{doc_id}", headers=headers_b)
    assert forbidden.status_code == 404

    # Compress to 200 KB via Student tool (must create v2 without overwriting v1)
    comp = await api_client.post(
        "/api/v1/tools/compress-to-size",
        headers=headers_a,
        json={"document_id": doc_id, "target_kb": 200},
    )
    assert comp.status_code == 202
    job = await _wait_for_job(api_client, headers_a, comp.json()["data"]["id"])
    assert job["status"] == "completed"
    assert job["result_meta"]["before_bytes"] == doc["size_bytes"]

    detail = await api_client.get(f"/api/v1/documents/{doc_id}", headers=headers_a)
    assert detail.status_code == 200
    assert detail.json()["data"]["current_version_no"] == 2
    assert len(detail.json()["data"]["versions"]) == 2

    # Original v1 download matches uploaded byte size exactly
    v1_dl = await api_client.get(f"/api/v1/documents/{doc_id}/download?v=1", headers=headers_a)
    assert v1_dl.status_code == 200
    assert len(v1_dl.content) > job["result_meta"]["after_bytes"]

    # One-box command bar: plan -> approve -> execute
    plan_resp = await api_client.post(
        "/api/v1/ai/agent/command",
        headers=headers_a,
        json={"command": "add page numbers", "document_id": doc_id},
    )
    assert plan_resp.status_code == 200
    plan_data = plan_resp.json()["data"]
    assert plan_data["status"] == "awaiting_approval"

    approve_resp = await api_client.post(
        f"/api/v1/ai/agent/runs/{plan_data['run_id']}/approve",
        headers=headers_a,
        json={"approve": True},
    )
    assert approve_resp.status_code == 200
    job2 = await _wait_for_job(api_client, headers_a, approve_resp.json()["data"]["job_id"])
    assert job2["status"] == "completed"

    # Multi-step AI agent workflow: plan 2 steps -> approve -> execute sequentially
    pipe_plan = await api_client.post(
        "/api/v1/ai/agent/command",
        headers=headers_a,
        json={"command": "compress to 200 kb and add page numbers", "document_id": doc_id},
    )
    assert pipe_plan.status_code == 200
    pipe_data = pipe_plan.json()["data"]
    assert len(pipe_data["steps"]) == 2
    pipe_approve = await api_client.post(
        f"/api/v1/ai/agent/runs/{pipe_data['run_id']}/approve",
        headers=headers_a,
        json={"approve": True, "mode": "all"},
    )
    assert pipe_approve.status_code == 200
    run_state = pipe_approve.json()["data"]
    for _ in range(120):
        if run_state["status"] in ("completed", "failed", "cancelled"):
            break
        await asyncio.sleep(0.05)
        r = await api_client.get(
            f"/api/v1/ai/agent/runs/{pipe_data['run_id']}", headers=headers_a
        )
        assert r.status_code == 200
        run_state = r.json()["data"]
    assert run_state["status"] == "completed"
    assert all(s["execution_status"] == "completed" for s in run_state["steps"])
    assert run_state["output_document_id"] is not None


@pytest.mark.asyncio
async def test_guest_mode_student_tools_and_delete_now(api_client: AsyncClient) -> None:
    guest = await api_client.post("/api/v1/auth/guest")
    assert guest.status_code == 201
    g_data = guest.json()["data"]
    assert g_data["is_guest"] is True
    assert g_data["guest_expires_at"] is not None
    headers_g = {"Authorization": f"Bearer {g_data['access_token']}"}

    # Photo & Signature Resizer
    photo = (FIXTURES / "sample_photo.jpg").read_bytes()
    resize = await api_client.post(
        "/api/v1/tools/image-resize",
        headers=headers_g,
        files={"file": ("passport.jpg", photo, "image/jpeg")},
        data={
            "width_px": "413",
            "height_px": "531",
            "dpi": "300",
            "max_kb": "100",
            "output_format": "JPEG",
        },
    )
    assert resize.status_code == 201
    resized_doc_id = resize.json()["data"]["document_id"]
    assert resize.json()["data"]["metrics"]["target_met"] is True

    # Camera scan to PDF
    scan = await api_client.post(
        "/api/v1/tools/scan",
        headers=headers_g,
        files=[("files", ("p1.jpg", photo, "image/jpeg"))],
        data={"enhance_mode": "document", "output_name": "lab_record.pdf"},
    )
    assert scan.status_code == 201
    assert scan.json()["data"]["page_count"] == 1

    # Immediate "Delete now"
    del_resp = await api_client.delete(
        f"/api/v1/documents/{resized_doc_id}?permanent=true", headers=headers_g
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["data"]["permanent"] is True
    missing = await api_client.get(f"/api/v1/documents/{resized_doc_id}", headers=headers_g)
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_library_folders_trash_merge_split_protect(api_client: AsyncClient) -> None:
    reg = await api_client.post(
        "/api/v1/auth/register",
        json={
            "email": "me@example.com",
            "password": "StrongPassword123!",
            "full_name": "Priya Nair",
        },
    )
    assert reg.status_code == 201

    login = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "me@example.com", "password": "StrongPassword123!"},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['data']['access_token']}"}

    me = await api_client.get("/api/v1/users/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["data"]["full_name"] == "Priya Nair"

    folder = await api_client.post("/api/v1/folders", headers=headers, json={"name": "Semester 5"})
    assert folder.status_code == 201
    folder_id = folder.json()["data"]["id"]

    p1 = (FIXTURES / "sample_english.pdf").read_bytes()
    p2 = (FIXTURES / "sample_multipage.pdf").read_bytes()
    u1 = await api_client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("unit1.pdf", p1, "application/pdf")},
        data={"folder_id": folder_id},
    )
    u2 = await api_client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("unit2.pdf", p2, "application/pdf")},
        data={"folder_id": folder_id},
    )
    assert u1.status_code == 201 and u2.status_code == 201
    id1 = u1.json()["data"]["id"]
    id2 = u2.json()["data"]["id"]

    # Search
    srch = await api_client.get("/api/v1/search?q=unit1", headers=headers)
    assert srch.status_code == 200
    assert len(srch.json()["data"]) == 1

    # Merge
    merge_resp = await api_client.post(
        "/api/v1/tools/pdf/merge",
        headers=headers,
        json={"items": [{"document_id": id1}, {"document_id": id2, "pages": "1-2"}]},
    )
    assert merge_resp.status_code == 202
    merge_job = await _wait_for_job(api_client, headers, merge_resp.json()["data"]["id"])
    assert merge_job["status"] == "completed"
    merged_id = merge_job["output_document_id"]

    # Split
    split_resp = await api_client.post(
        "/api/v1/tools/pdf/split",
        headers=headers,
        json={"document_id": merged_id, "mode": "every_n", "every_n": 1},
    )
    assert split_resp.status_code == 202
    split_job = await _wait_for_job(api_client, headers, split_resp.json()["data"]["id"])
    assert split_job["status"] == "completed"
    assert split_job["result_meta"]["parts_count"] == 3

    # Protect & Unlock
    prot = await api_client.post(
        "/api/v1/tools/pdf/protect",
        headers=headers,
        json={"document_id": id1, "password": "MySecret99"},
    )
    assert prot.status_code == 202
    prot_job = await _wait_for_job(api_client, headers, prot.json()["data"]["id"])
    assert prot_job["status"] == "completed"

    bad_unlock = await api_client.post(
        "/api/v1/tools/pdf/unlock",
        headers=headers,
        json={"document_id": id1, "password": "Wrong"},
    )
    bad_job = await _wait_for_job(api_client, headers, bad_unlock.json()["data"]["id"])
    assert bad_job["status"] == "failed"

    ok_unlock = await api_client.post(
        "/api/v1/tools/pdf/unlock",
        headers=headers,
        json={"document_id": id1, "password": "MySecret99"},
    )
    ok_job = await _wait_for_job(api_client, headers, ok_unlock.json()["data"]["id"])
    assert ok_job["status"] == "completed"

    # Trash & Restore
    trash = await api_client.delete(f"/api/v1/documents/{id1}", headers=headers)
    assert trash.status_code == 200
    assert trash.json()["data"]["permanent"] is False
    restored = await api_client.post(f"/api/v1/documents/{id1}/restore", headers=headers)
    assert restored.status_code == 200

    # Thumbnail & History
    thumb = await api_client.get(f"/api/v1/documents/{id2}/pages/1/thumbnail", headers=headers)
    assert thumb.status_code == 200
    assert thumb.content.startswith(b"\x89PNG")
    hist = await api_client.get(f"/api/v1/documents/{id1}/history", headers=headers)
    assert hist.status_code == 200
    assert len(hist.json()["data"]) >= 3


@pytest.mark.asyncio
async def test_auth_lifecycle_chunked_upload_and_tools_coverage(api_client: AsyncClient) -> None:
    # Register + verify email + forgot/reset password + refresh + logout
    reg = await api_client.post(
        "/api/v1/auth/register",
        json={
            "email": "deep@example.com",
            "password": "OldPassword123!",
            "full_name": "Deep Tester",
        },
    )
    assert reg.status_code == 201
    verify_tok = reg.json()["data"]["dev_verification_token"]

    v_resp = await api_client.post("/api/v1/auth/verify-email", json={"token": verify_tok})
    assert v_resp.status_code == 200

    fp = await api_client.post("/api/v1/auth/forgot-password", json={"email": "deep@example.com"})
    assert fp.status_code == 200
    reset_tok = fp.json()["data"]["dev_reset_token"]
    rp = await api_client.post(
        "/api/v1/auth/reset-password",
        json={"token": reset_tok, "new_password": "NewPassword456!"},
    )
    assert rp.status_code == 200

    ref = await api_client.post("/api/v1/auth/refresh")
    assert ref.status_code == 200
    new_headers = {"Authorization": f"Bearer {ref.json()['data']['access_token']}"}

    # Update profile
    upd = await api_client.patch(
        "/api/v1/users/me", headers=new_headers, json={"full_name": "Deep Updated", "locale": "ta"}
    )
    assert upd.status_code == 200
    assert upd.json()["data"]["locale"] == "ta"

    # Folders CRUD
    f1 = await api_client.post("/api/v1/folders", headers=new_headers, json={"name": "Notes"})
    assert f1.status_code == 201
    fid = f1.json()["data"]["id"]
    f_list = await api_client.get("/api/v1/folders", headers=new_headers)
    assert len(f_list.json()["data"]) == 1
    assert (
        await api_client.patch(f"/api/v1/folders/{fid}", headers=new_headers, json={"name": "Lab"})
    ).status_code == 200

    # Chunked upload
    pdf_bytes = (FIXTURES / "sample_multipage.pdf").read_bytes()
    half = len(pdf_bytes) // 2
    init_r = await api_client.post(
        "/api/v1/documents/upload/init",
        headers=new_headers,
        data={"filename": "chunked.pdf", "total_chunks": "2", "folder_id": fid},
    )
    assert init_r.status_code == 201
    up_id = init_r.json()["data"]["upload_id"]
    assert (
        await api_client.post(
            f"/api/v1/documents/upload/{up_id}/chunk",
            headers=new_headers,
            data={"chunk_index": "0"},
            files={"chunk": ("c0", pdf_bytes[:half], "application/octet-stream")},
        )
    ).status_code == 200
    assert (
        await api_client.post(
            f"/api/v1/documents/upload/{up_id}/chunk",
            headers=new_headers,
            data={"chunk_index": "1"},
            files={"chunk": ("c1", pdf_bytes[half:], "application/octet-stream")},
        )
    ).status_code == 200
    comp = await api_client.post(f"/api/v1/documents/upload/{up_id}/complete", headers=new_headers)
    assert comp.status_code == 201
    doc_id = comp.json()["data"]["id"]

    # Patch document, preview, watermark, rotate, extract, delete pages
    assert (
        await api_client.patch(
            f"/api/v1/documents/{doc_id}",
            headers=new_headers,
            json={"is_favorite": True, "name": "renamed.pdf"},
        )
    ).status_code == 200
    prev = await api_client.get(f"/api/v1/documents/{doc_id}/preview", headers=new_headers)
    assert prev.status_code == 200
    assert prev.content.startswith(b"%PDF-")

    wm = await api_client.post(
        "/api/v1/tools/pdf/watermark",
        headers=new_headers,
        json={"document_id": doc_id, "text": "DRAFT"},
    )
    wm_job = await _wait_for_job(api_client, new_headers, wm.json()["data"]["id"])
    assert wm_job["status"] == "completed"

    # Exercise SSE event stream on completed job + invalid cancel/retry guards
    sse = await api_client.get(f"/api/v1/jobs/{wm_job['id']}/events", headers=new_headers)
    assert sse.status_code == 200
    assert "completed" in sse.text
    retry_err = await api_client.post(f"/api/v1/jobs/{wm_job['id']}/retry", headers=new_headers)
    assert retry_err.status_code == 400

    rot = await api_client.post(
        "/api/v1/tools/pdf/pages",
        headers=new_headers,
        json={"document_id": doc_id, "action": "rotate", "angle": 90, "pages": [1]},
    )
    assert (
        await _wait_for_job(api_client, new_headers, rot.json()["data"]["id"])
    )["status"] == "completed"

    d_pages = await api_client.post(
        "/api/v1/tools/pdf/pages",
        headers=new_headers,
        json={"document_id": doc_id, "action": "delete", "pages": [5]},
    )
    assert (
        await _wait_for_job(api_client, new_headers, d_pages.json()["data"]["id"])
    )["status"] == "completed"

    ext_pages = await api_client.post(
        "/api/v1/tools/pdf/pages",
        headers=new_headers,
        json={"document_id": doc_id, "action": "extract", "pages": [1, 2]},
    )
    assert (
        await _wait_for_job(api_client, new_headers, ext_pages.json()["data"]["id"])
    )["status"] == "completed"

    # Search, soft delete -> restore -> soft delete -> empty trash
    srch = await api_client.get("/api/v1/search?q=renamed", headers=new_headers)
    assert srch.status_code == 200
    assert len(srch.json()["data"]) >= 1

    assert (
        await api_client.delete(f"/api/v1/documents/{doc_id}", headers=new_headers)
    ).status_code == 200
    assert (
        await api_client.post(f"/api/v1/documents/{doc_id}/restore", headers=new_headers)
    ).status_code == 200

    # Agent command reject path
    cmd = await api_client.post(
        "/api/v1/ai/agent/command",
        headers=new_headers,
        json={"command": "add watermark EXAM", "document_id": doc_id},
    )
    assert cmd.status_code == 200
    run_id = cmd.json()["data"]["run_id"]
    rej = await api_client.post(
        f"/api/v1/ai/agent/runs/{run_id}/approve",
        headers=new_headers,
        json={"approve": False},
    )
    assert rej.status_code == 200
    assert rej.json()["data"]["summary"] == "Action cancelled by user."

    jobs_list = await api_client.get("/api/v1/jobs", headers=new_headers)
    assert jobs_list.status_code == 200
    assert len(jobs_list.json()["data"]) >= 4

    google_start = await api_client.get("/api/v1/auth/google")
    assert google_start.status_code == 501

    metrics = await api_client.get("/api/v1/metrics")
    assert metrics.status_code == 200

    # Delete folder, logout, then test hard-delete requires valid auth; re-login & delete
    assert (
        await api_client.delete(f"/api/v1/folders/{fid}", headers=new_headers)
    ).status_code == 200
    assert (await api_client.post("/api/v1/auth/logout", headers=new_headers)).status_code == 200
    login2 = await api_client.post(
        "/api/v1/auth/login",
        json={"email": "deep@example.com", "password": "NewPassword456!"},
    )
    assert login2.status_code == 200
    del_headers = {"Authorization": f"Bearer {login2.json()['data']['access_token']}"}
    assert (await api_client.delete("/api/v1/users/me", headers=del_headers)).status_code == 200
