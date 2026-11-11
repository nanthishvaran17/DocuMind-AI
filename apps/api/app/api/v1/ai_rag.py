from __future__ import annotations

from app.api.deps import ActorContext, get_current_actor, get_owned_document
from app.db.models import DocumentChunk, DocumentVersion, QaThread
from app.db.session import get_db
from app.schemas.common import ok_response
from app.schemas.rag import (
    IndexDocumentRequest,
    QaAskRequest,
    SemanticSearchRequest,
    SummarizeRequest,
)
from app.services.rag import (
    answer_question_with_citations,
    ensure_document_indexed,
    semantic_search,
    summarize_document,
)
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/ai", tags=["ai-rag"])


async def _get_current_version(db: AsyncSession, doc_id: str, ver_no: int) -> DocumentVersion:
    ver = (
        await db.execute(
            select(DocumentVersion).where(
                DocumentVersion.document_id == doc_id,
                DocumentVersion.version_no == ver_no,
            )
        )
    ).scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="Current document version not found.")
    return ver


@router.post("/search")
async def semantic_search_endpoint(
    payload: SemanticSearchRequest,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Hybrid pgvector + lexical semantic search across actor-owned documents."""
    if payload.document_ids:
        for did in payload.document_ids:
            await get_owned_document(db, did, actor)

    hits = await semantic_search(
        db,
        actor=actor,
        query=payload.query,
        document_ids=payload.document_ids,
        limit=payload.limit,
        mode=payload.mode,
    )
    clean_hits = [{k: v for k, v in h.items() if k != "full_text"} for h in hits]
    return ok_response(clean_hits)


@router.get("/documents/{document_id}/index")
async def get_document_index_status(
    document_id: str,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return RAG chunk indexing status and sample chunks for a document's latest version."""
    doc = await get_owned_document(db, document_id, actor)
    ver = await _get_current_version(db, doc.id, doc.current_version_no)

    total_chunks = int(
        (
            await db.execute(
                select(func.count())
                .select_from(DocumentChunk)
                .where(DocumentChunk.version_id == ver.id)
            )
        ).scalar_one()
    )
    sample_rows = list(
        (
            await db.execute(
                select(DocumentChunk)
                .where(DocumentChunk.version_id == ver.id)
                .order_by(DocumentChunk.chunk_index.asc())
                .limit(6)
            )
        )
        .scalars()
        .all()
    )

    return ok_response(
        {
            "document_id": doc.id,
            "version_id": ver.id,
            "version_no": ver.version_no,
            "indexed": total_chunks > 0,
            "chunk_count": total_chunks,
            "embedding_model": sample_rows[0].embedding_model if sample_rows else None,
            "sample_chunks": [
                {
                    "id": c.id,
                    "chunk_index": c.chunk_index,
                    "page_no": c.page_no,
                    "section_title": c.section_title,
                    "token_count": c.token_count,
                    "preview": c.content[:220],
                }
                for c in sample_rows
            ],
        }
    )


@router.post("/documents/{document_id}/index")
async def index_document_endpoint(
    document_id: str,
    payload: IndexDocumentRequest | None = None,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Index (or re-index) a document's latest version into vector chunks."""
    doc = await get_owned_document(db, document_id, actor)
    ver = await _get_current_version(db, doc.id, doc.current_version_no)
    force = payload.force if payload else True
    count = await ensure_document_indexed(db, doc, ver, force=force)
    return ok_response(
        {
            "document_id": doc.id,
            "version_id": ver.id,
            "version_no": ver.version_no,
            "chunk_count": count,
            "indexed": count > 0,
        }
    )


@router.post("/documents/{document_id}/summarize")
async def summarize_document_endpoint(
    document_id: str,
    payload: SummarizeRequest | None = None,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate a citation-backed summary for a single document."""
    doc = await get_owned_document(db, document_id, actor)
    ver = await _get_current_version(db, doc.id, doc.current_version_no)
    result = await summarize_document(
        db,
        actor=actor,
        doc=doc,
        ver=ver,
        focus=payload.focus if payload else None,
        response_style=payload.response_style if payload else None,
        custom_instructions=payload.custom_instructions if payload else None,
    )
    return ok_response(result)


@router.post("/qa/ask")
async def ask_documents_qa(
    payload: QaAskRequest,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Ask a natural-language question with inline [n] citations over 1..N or all documents."""
    target_ids: list[str] = []
    if payload.document_id:
        target_ids.append(payload.document_id)
    if payload.document_ids:
        for did in payload.document_ids:
            if did not in target_ids:
                target_ids.append(did)

    for did in target_ids:
        await get_owned_document(db, did, actor)

    res = await answer_question_with_citations(
        db,
        actor=actor,
        question=payload.question,
        document_ids=target_ids or None,
        thread_id=payload.thread_id,
        top_k=payload.top_k,
        response_style=payload.response_style,
        custom_instructions=payload.custom_instructions,
    )
    return ok_response(res)


@router.get("/qa/threads")
async def list_qa_threads(
    document_id: str | None = None,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    stmt = select(QaThread)
    if actor.is_guest:
        stmt = stmt.where(QaThread.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(QaThread.user_id == actor.user_id)
    if document_id:
        stmt = stmt.where(QaThread.document_id == document_id)
    threads = list(
        (await db.execute(stmt.order_by(desc(QaThread.updated_at)).limit(30))).scalars().all()
    )
    return ok_response(
        [
            {
                "id": t.id,
                "document_id": t.document_id,
                "title": t.title,
                "created_at": t.created_at,
                "updated_at": t.updated_at,
            }
            for t in threads
        ]
    )


@router.get("/qa/threads/{thread_id}")
async def get_qa_thread(
    thread_id: str,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    stmt = (
        select(QaThread)
        .where(QaThread.id == thread_id)
        .options(selectinload(QaThread.messages))
    )
    if actor.is_guest:
        stmt = stmt.where(QaThread.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(QaThread.user_id == actor.user_id)
    thread = (await db.execute(stmt)).scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Q&A thread not found.")

    return ok_response(
        {
            "id": thread.id,
            "document_id": thread.document_id,
            "title": thread.title,
            "created_at": thread.created_at,
            "updated_at": thread.updated_at,
            "messages": [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "citations": m.citations,
                    "model_used": m.model_used,
                    "created_at": m.created_at,
                }
                for m in thread.messages
            ],
        }
    )


@router.delete("/qa/threads/{thread_id}")
async def delete_qa_thread(
    thread_id: str,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    stmt = select(QaThread).where(QaThread.id == thread_id)
    if actor.is_guest:
        stmt = stmt.where(QaThread.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(QaThread.user_id == actor.user_id)
    thread = (await db.execute(stmt)).scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Q&A thread not found.")
    await db.delete(thread)
    await db.commit()
    return ok_response({"deleted": True, "thread_id": thread_id})
