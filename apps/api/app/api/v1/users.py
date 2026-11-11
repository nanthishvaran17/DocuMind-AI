from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ActorContext, require_authenticated_user
from app.db.models import Document
from app.db.session import get_db
from app.schemas.auth import UserOut, UserUpdateRequest
from app.schemas.common import ok_response
from app.services.retention import hard_delete_document

router = APIRouter(prefix="/users", tags=["users"])


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
