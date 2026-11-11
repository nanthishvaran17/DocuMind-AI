from __future__ import annotations

from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from app.core.config import get_settings
from app.db import session as db_session
from app.db.models import Base
from app.main import app
from app.services import agent_executor, job_runner
from app.services import storage as storage_service
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


@pytest_asyncio.fixture()
async def settings_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_file = tmp_path / "test_settings.db"
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

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_user_preferences_password_sessions_export_and_cleanup(
    settings_client: AsyncClient,
) -> None:
    # 1. Register user
    reg = await settings_client.post(
        "/api/v1/auth/register",
        json={
            "email": "settings.user@annauniv.edu.in",
            "password": "InitialPassword123!",
            "full_name": "Kavya S",
            "locale": "en",
        },
    )
    assert reg.status_code == 201
    token1 = reg.json()["data"]["access_token"]
    headers1 = {"Authorization": f"Bearer {token1}"}

    # 2. Fetch default preferences
    pref_get = await settings_client.get("/api/v1/users/me/preferences", headers=headers1)
    assert pref_get.status_code == 200
    assert pref_get.json()["data"]["ai_response_style"] == "balanced"
    assert pref_get.json()["data"]["default_compress_kb"] == 200

    # 3. Update preferences
    pref_patch = await settings_client.patch(
        "/api/v1/users/me/preferences",
        headers=headers1,
        json={
            "theme": "light",
            "density": "compact",
            "ai_response_style": "concise",
            "custom_instructions": "Answer in brief exam bullet points.",
            "default_ocr_lang": "eng+tam",
            "default_compress_kb": 100,
        },
    )
    assert pref_patch.status_code == 200
    assert pref_patch.json()["data"]["theme"] == "light"
    assert pref_patch.json()["data"]["ai_response_style"] == "concise"
    assert pref_patch.json()["data"]["default_ocr_lang"] == "eng+tam"

    # 4. Upload document and run Q&A using concise personalization
    pdf_bytes = (FIXTURES / "sample_english.pdf").read_bytes()
    up = await settings_client.post(
        "/api/v1/documents/upload",
        headers=headers1,
        files={"file": ("syllabus.pdf", pdf_bytes, "application/pdf")},
    )
    assert up.status_code == 201
    doc_id = up.json()["data"]["id"]

    qa = await settings_client.post(
        "/api/v1/ai/qa/ask",
        headers=headers1,
        json={"question": "What is in this document?", "document_id": doc_id},
    )
    assert qa.status_code == 200
    assert qa.json()["data"]["thread_id"]

    # 5. Export workspace data
    export = await settings_client.get("/api/v1/users/me/export", headers=headers1)
    assert export.status_code == 200
    exp_data = export.json()["data"]
    assert exp_data["preferences"]["ai_response_style"] == "concise"
    assert len(exp_data["documents"]) == 1
    assert len(exp_data["qa_threads"]) == 1

    # 6. Clear Q&A history and purge documents
    clear_qa = await settings_client.delete("/api/v1/users/me/qa-history", headers=headers1)
    assert clear_qa.status_code == 200
    assert clear_qa.json()["data"]["deleted_threads"] == 1

    purge_docs = await settings_client.delete("/api/v1/users/me/documents", headers=headers1)
    assert purge_docs.status_code == 200
    assert purge_docs.json()["data"]["deleted_documents"] == 1

    # 7. Change password (wrong current password rejected, valid succeeds)
    bad_pw = await settings_client.post(
        "/api/v1/users/me/password",
        headers=headers1,
        json={"current_password": "WrongPassword!", "new_password": "NewPassword456!"},
    )
    assert bad_pw.status_code == 400

    ok_pw = await settings_client.post(
        "/api/v1/users/me/password",
        headers=headers1,
        json={"current_password": "InitialPassword123!", "new_password": "NewPassword456!"},
    )
    assert ok_pw.status_code == 200

    # 8. Login creates a second session; test listing & revoking other sessions
    login2 = await settings_client.post(
        "/api/v1/auth/login",
        json={"email": "settings.user@annauniv.edu.in", "password": "NewPassword456!"},
    )
    assert login2.status_code == 200
    headers2 = {"Authorization": f"Bearer {login2.json()['data']['access_token']}"}

    sess_list = await settings_client.get("/api/v1/users/me/sessions", headers=headers2)
    assert sess_list.status_code == 200
    assert len(sess_list.json()["data"]) >= 2

    revoke_others = await settings_client.post(
        "/api/v1/users/me/sessions/revoke-others", headers=headers2
    )
    assert revoke_others.status_code == 200
    assert revoke_others.json()["data"]["revoked_count"] >= 1


@pytest.mark.asyncio
async def test_guest_mode_data_controls(settings_client: AsyncClient) -> None:
    guest = await settings_client.post("/api/v1/auth/guest")
    assert guest.status_code == 201
    headers = {"Authorization": f"Bearer {guest.json()['data']['access_token']}"}

    # Guest cannot persist account preferences to DB
    pref_get = await settings_client.get("/api/v1/users/me/preferences", headers=headers)
    assert pref_get.status_code == 403

    # Guest can export and purge their guest workspace
    pdf_bytes = (FIXTURES / "sample_english.pdf").read_bytes()
    up = await settings_client.post(
        "/api/v1/documents/upload",
        headers=headers,
        files={"file": ("guest_notes.pdf", pdf_bytes, "application/pdf")},
    )
    assert up.status_code == 201

    export = await settings_client.get("/api/v1/users/me/export", headers=headers)
    assert export.status_code == 200
    assert export.json()["data"]["profile"]["mode"] == "guest"
    assert len(export.json()["data"]["documents"]) == 1

    purge = await settings_client.delete("/api/v1/users/me/documents", headers=headers)
    assert purge.status_code == 200
    assert purge.json()["data"]["deleted_documents"] == 1

