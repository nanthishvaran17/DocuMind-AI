from __future__ import annotations

from datetime import UTC, datetime

from app.api.deps import ActorContext, get_current_actor, require_authenticated_user
from app.core.security import hash_password, verify_password
from app.db.models import Document, Folder, QaThread, UserPreference, UserSession
from app.db.session import get_db
from app.schemas.auth import (
    ChangePasswordRequest,
    UserOut,
    UserPreferencesData,
    UserPreferencesUpdate,
    UserSessionOut,
    UserUpdateRequest,
)
from app.schemas.common import ok_response
from app.services.audit import record_audit_log
from app.services.retention import hard_delete_document
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/users", tags=["users"])


def _merge_preferences(stored: dict | None) -> dict:
    defaults = UserPreferencesData().model_dump()
    if not stored:
        return defaults
    valid_keys = set(defaults.keys())
    merged = {**defaults, **{k: v for k, v in stored.items() if k in valid_keys}}
    return UserPreferencesData(**merged).model_dump()


@router.get("/me")
async def get_me(actor: ActorContext = Depends(require_authenticated_user)) -> dict:
    assert actor.user is not None
    u = actor.user
    return ok_response(
        UserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            locale=u.locale,
            is_student_verified=u.is_student_verified,
            email_verified_at=u.email_verified_at,
            created_at=u.created_at,
        ).model_dump()
    )


@router.patch("/me")
async def update_me(
    payload: UserUpdateRequest,
    actor: ActorContext = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    assert actor.user is not None
    if payload.full_name is not None:
        actor.user.full_name = payload.full_name.strip()
    if payload.locale is not None:
        actor.user.locale = payload.locale
    await db.commit()
    await db.refresh(actor.user)
    u = actor.user
    return ok_response(
        UserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            locale=u.locale,
            is_student_verified=u.is_student_verified,
            email_verified_at=u.email_verified_at,
            created_at=u.created_at,
        ).model_dump()
    )


@router.get("/me/preferences")
async def get_my_preferences(
    actor: ActorContext = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    assert actor.user_id is not None
    pref_row = (
        await db.execute(
            select(UserPreference).where(UserPreference.user_id == actor.user_id)
        )
    ).scalar_one_or_none()
    return ok_response(_merge_preferences(pref_row.preferences if pref_row else None))


@router.patch("/me/preferences")
async def update_my_preferences(
    payload: UserPreferencesUpdate,
    actor: ActorContext = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    assert actor.user_id is not None
    pref_row = (
        await db.execute(
            select(UserPreference).where(UserPreference.user_id == actor.user_id)
        )
    ).scalar_one_or_none()
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    current = dict(pref_row.preferences) if pref_row else {}
    current.update(updates)
    validated = _merge_preferences(current)
    if pref_row is None:
        pref_row = UserPreference(user_id=actor.user_id, preferences=validated)
        db.add(pref_row)
    else:
        pref_row.preferences = validated
    await db.commit()
    return ok_response(validated)


@router.post("/me/password")
async def change_my_password(
    payload: ChangePasswordRequest,
    actor: ActorContext = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    assert actor.user is not None
    if not actor.user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses Google Sign-In and does not have a local password.",
        )
    if not verify_password(payload.current_password, actor.user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    actor.user.password_hash = hash_password(payload.new_password)
    await record_audit_log(
        db,
        action="auth.password_change",
        resource_type="user",
        resource_id=actor.user.id,
        actor_user_id=actor.user.id,
    )
    await db.commit()
    return ok_response({"updated": True})


@router.get("/me/sessions")
async def list_my_sessions(
    actor: ActorContext = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    assert actor.user_id is not None
    now = datetime.now(UTC)
    rows = (
        (
            await db.execute(
                select(UserSession)
                .where(
                    UserSession.user_id == actor.user_id,
                    UserSession.revoked_at.is_(None),
                )
                .order_by(desc(UserSession.updated_at))
                .limit(20)
            )
        )
        .scalars()
        .all()
    )
    active: list[dict] = []
    for s in rows:
        exp = s.expires_at if s.expires_at.tzinfo else s.expires_at.replace(tzinfo=UTC)
        if exp <= now:
            continue
        active.append(
            UserSessionOut(
                id=s.id,
                user_agent=s.user_agent,
                ip_address=str(s.ip_address) if s.ip_address is not None else None,
                created_at=s.created_at,
                updated_at=s.updated_at,
                expires_at=s.expires_at,
                is_current=(s.id == actor.session_id),
            ).model_dump()
        )
    return ok_response(active)


@router.delete("/me/sessions/{session_id}")
async def revoke_my_session(
    session_id: str,
    actor: ActorContext = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    assert actor.user_id is not None
    sess = (
        await db.execute(
            select(UserSession).where(
                UserSession.id == session_id,
                UserSession.user_id == actor.user_id,
            )
        )
    ).scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    sess.revoked_at = datetime.now(UTC)
    await db.commit()
    return ok_response({"revoked": True, "session_id": session_id})


@router.post("/me/sessions/revoke-others")
async def revoke_other_sessions(
    actor: ActorContext = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    assert actor.user_id is not None
    rows = (
        (
            await db.execute(
                select(UserSession).where(
                    UserSession.user_id == actor.user_id,
                    UserSession.revoked_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    now = datetime.now(UTC)
    revoked_count = 0
    for s in rows:
        if actor.session_id and s.id == actor.session_id:
            continue
        s.revoked_at = now
        revoked_count += 1
    await db.commit()
    return ok_response({"revoked_count": revoked_count})


@router.get("/me/export")
async def export_my_data(
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Export workspace metadata, preferences, documents, and Q&A history as JSON."""
    doc_stmt = select(Document)
    thread_stmt = select(QaThread).options(selectinload(QaThread.messages))
    if actor.is_guest:
        doc_stmt = doc_stmt.where(Document.guest_session_id == actor.guest_session_id)
        thread_stmt = thread_stmt.where(QaThread.guest_session_id == actor.guest_session_id)
        folders: list[Folder] = []
        pref_data = _merge_preferences(None)
        profile = {"mode": "guest", "guest_session_id": actor.guest_session_id}
    else:
        assert actor.user is not None
        doc_stmt = doc_stmt.where(Document.owner_id == actor.user_id)
        thread_stmt = thread_stmt.where(QaThread.user_id == actor.user_id)
        folders = list(
            (
                await db.execute(
                    select(Folder).where(
                        Folder.owner_id == actor.user_id, Folder.deleted_at.is_(None)
                    )
                )
            )
            .scalars()
            .all()
        )
        pref_row = (
            await db.execute(
                select(UserPreference).where(UserPreference.user_id == actor.user_id)
            )
        ).scalar_one_or_none()
        pref_data = _merge_preferences(pref_row.preferences if pref_row else None)
        u = actor.user
        profile = UserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            locale=u.locale,
            is_student_verified=u.is_student_verified,
            email_verified_at=u.email_verified_at,
            created_at=u.created_at,
        ).model_dump()

    docs = list((await db.execute(doc_stmt)).scalars().all())
    threads = list((await db.execute(thread_stmt)).scalars().all())

    return ok_response(
        {
            "exported_at": datetime.now(UTC).isoformat(),
            "profile": profile,
            "preferences": pref_data,
            "folders": [
                {
                    "id": f.id,
                    "name": f.name,
                    "parent_id": f.parent_id,
                    "created_at": f.created_at.isoformat(),
                }
                for f in folders
            ],
            "documents": [
                {
                    "id": d.id,
                    "name": d.name,
                    "mime_type": d.mime_type,
                    "size_bytes": d.size_bytes,
                    "current_version_no": d.current_version_no,
                    "is_favorite": d.is_favorite,
                    "created_at": d.created_at.isoformat(),
                }
                for d in docs
            ],
            "qa_threads": [
                {
                    "id": t.id,
                    "title": t.title,
                    "document_id": t.document_id,
                    "created_at": t.created_at.isoformat(),
                    "messages": [
                        {
                            "role": m.role,
                            "content": m.content,
                            "model_used": m.model_used,
                            "created_at": m.created_at.isoformat(),
                        }
                        for m in t.messages
                    ],
                }
                for t in threads
            ],
        }
    )


@router.delete("/me/qa-history")
async def clear_my_qa_history(
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    stmt = select(QaThread)
    if actor.is_guest:
        stmt = stmt.where(QaThread.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(QaThread.user_id == actor.user_id)
    threads = list((await db.execute(stmt)).scalars().all())
    for thread in threads:
        await db.delete(thread)
    await db.commit()
    return ok_response({"deleted_threads": len(threads)})


@router.delete("/me/documents")
async def purge_my_workspace_documents(
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    stmt = select(Document)
    if actor.is_guest:
        stmt = stmt.where(Document.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(Document.owner_id == actor.user_id)
    docs = list((await db.execute(stmt)).scalars().all())
    for doc in docs:
        await hard_delete_document(db, doc)
    await db.commit()
    return ok_response({"deleted_documents": len(docs)})


@router.delete("/me")
async def delete_my_account(
    actor: ActorContext = Depends(require_authenticated_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """GDPR/DPDP account deletion: hard-deletes all user documents, storage, and account."""
    assert actor.user is not None
    docs = (
        (await db.execute(select(Document).where(Document.owner_id == actor.user.id)))
        .scalars()
        .all()
    )
    for doc in docs:
        await hard_delete_document(db, doc)

    actor.user.deleted_at = datetime.now(UTC)
    await db.delete(actor.user)
    await db.commit()
    return ok_response({"deleted": True})
