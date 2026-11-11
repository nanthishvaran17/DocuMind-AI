from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ActorContext, get_current_actor
from app.db.models import Document
from app.db.session import get_db
from app.schemas.common import ok_response

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
async def search_library(
    q: str = Query(..., min_length=1, max_length=200),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Phase 1 filename search scoped strictly to the authenticated user or guest session."""
    stmt = select(Document).where(
        Document.deleted_at.is_(None), Document.name.ilike(f"%{q.strip()}%")
    )
    if actor.is_guest:
        stmt = stmt.where(Document.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(Document.owner_id == actor.user_id)
    docs = (await db.execute(stmt.order_by(desc(Document.updated_at)).limit(25))).scalars().all()
    return ok_response(
        [
            {
                "id": d.id,
                "name": d.name,
                "mime_type": d.mime_type,
                "size_bytes": d.size_bytes,
                "current_version_no": d.current_version_no,
                "updated_at": d.updated_at,
            }
            for d in docs
        ]
    )
