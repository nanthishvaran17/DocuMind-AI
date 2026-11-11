from __future__ import annotations

from typing import Literal

from app.api.deps import ActorContext, get_current_actor
from app.db.models import Document
from app.db.session import get_db
from app.schemas.common import ok_response
from app.services.rag import semantic_search
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
async def search_library(
    q: str = Query(..., min_length=1, max_length=200),
    mode: Literal["filename", "hybrid", "semantic"] = Query(default="filename"),
    document_id: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=50),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Search user/guest library.
    - mode='filename' (default, Phase 1 compatible): filename ilike search.
    - mode='hybrid' | 'semantic': pgvector + lexical chunk search with page/snippet hits.
    """
    if mode in ("hybrid", "semantic"):
        doc_ids = [document_id] if document_id else None
        hits = await semantic_search(
            db,
            actor=actor,
            query=q,
            document_ids=doc_ids,
            limit=limit,
            mode=mode,
        )
        return ok_response(
            [
                {
                    "id": h["document_id"],
                    "chunk_id": h["chunk_id"],
                    "document_id": h["document_id"],
                    "name": h["document_name"],
                    "mime_type": h["mime_type"],
                    "version_no": h["version_no"],
                    "page_no": h["page_no"],
                    "section_title": h["section_title"],
                    "snippet": h["snippet"],
                    "score": h["score"],
                }
                for h in hits
            ]
        )

    stmt = select(Document).where(
        Document.deleted_at.is_(None), Document.name.ilike(f"%{q.strip()}%")
    )
    if actor.is_guest:
        stmt = stmt.where(Document.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(Document.owner_id == actor.user_id)
    docs = (
        (await db.execute(stmt.order_by(desc(Document.updated_at)).limit(limit))).scalars().all()
    )
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
