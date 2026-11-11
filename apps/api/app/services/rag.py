from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from app.api.deps import ActorContext
from app.core.config import get_settings
from app.db.models import (
    Document,
    DocumentChunk,
    DocumentVersion,
    QaMessage,
    QaThread,
    UserPreference,
)
from app.services.audit import record_audit_log
from app.services.embeddings import (
    cosine_similarity,
    generate_embeddings,
    tokenize_for_search,
)
from app.services.llm import (
    call_chat_completion,
    synthesize_grounded_answer,
    synthesize_local_summary,
)
from app.services.storage import get_storage
from app.services.text_extractor import ExtractedSegment, extract_document_segments
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ChunkDraft:
    chunk_index: int
    page_no: int | None
    section_title: str | None
    content: str
    token_count: int
    char_start: int
    char_end: int


def chunk_segments(
    segments: list[ExtractedSegment],
    chunk_size: int = 700,
    overlap: int = 120,
) -> list[ChunkDraft]:
    """Split extracted document segments into overlapping, sentence-friendly chunks."""
    drafts: list[ChunkDraft] = []
    chunk_idx = 0

    for seg in segments:
        raw_text = re.sub(r"\n{3,}", "\n\n", seg.text.strip())
        if not raw_text:
            continue

        if len(raw_text) <= chunk_size:
            drafts.append(
                ChunkDraft(
                    chunk_index=chunk_idx,
                    page_no=seg.page_no,
                    section_title=seg.section_title,
                    content=raw_text,
                    token_count=len(tokenize_for_search(raw_text)) or len(raw_text.split()),
                    char_start=0,
                    char_end=len(raw_text),
                )
            )
            chunk_idx += 1
            continue

        start = 0
        n = len(raw_text)
        while start < n:
            end = min(n, start + chunk_size)
            if end < n:
                # Prefer breaking at newline or sentence boundary
                boundary = max(
                    raw_text.rfind("\n", start + chunk_size // 2, end),
                    raw_text.rfind(". ", start + chunk_size // 2, end),
                    raw_text.rfind(" ", start + chunk_size // 2, end),
                )
                if boundary > start:
                    end = boundary + 1

            piece = raw_text[start:end].strip()
            if piece:
                drafts.append(
                    ChunkDraft(
                        chunk_index=chunk_idx,
                        page_no=seg.page_no,
                        section_title=seg.section_title,
                        content=piece,
                        token_count=len(tokenize_for_search(piece)) or len(piece.split()),
                        char_start=start,
                        char_end=end,
                    )
                )
                chunk_idx += 1
            if end >= n:
                break
            start = max(start + 1, end - overlap)

    return drafts


async def index_document_version(
    db: AsyncSession,
    *,
    document_id: str,
    version_id: str,
    raw_bytes: bytes,
    mime_type: str,
    filename: str,
    force: bool = False,
) -> int:
    """Extract text, chunk, embed, and persist DocumentChunk rows for a DocumentVersion."""
    if not force:
        existing_count = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(DocumentChunk)
                    .where(DocumentChunk.version_id == version_id)
                )
            ).scalar_one()
        )
        if existing_count > 0:
            return existing_count

    settings = get_settings()
    segments = extract_document_segments(raw_bytes, mime_type, filename)
    drafts = chunk_segments(
        segments,
        chunk_size=settings.rag_chunk_size,
        overlap=settings.rag_chunk_overlap,
    )

    await db.execute(delete(DocumentChunk).where(DocumentChunk.version_id == version_id))
    if not drafts:
        return 0

    texts = [d.content for d in drafts]
    vectors, model_name = await generate_embeddings(texts)

    for draft, vec in zip(drafts, vectors, strict=True):
        db.add(
            DocumentChunk(
                document_id=document_id,
                version_id=version_id,
                chunk_index=draft.chunk_index,
                page_no=draft.page_no,
                section_title=draft.section_title,
                content=draft.content,
                token_count=draft.token_count,
                char_start=draft.char_start,
                char_end=draft.char_end,
                embedding=vec,
                embedding_model=model_name,
                meta={"filename": filename},
            )
        )
    await db.flush()
    return len(drafts)


async def ensure_document_indexed(
    db: AsyncSession,
    doc: Document,
    ver: DocumentVersion,
    *,
    force: bool = False,
) -> int:
    """Ensure a DocumentVersion has indexed chunks, reading bytes from storage if needed."""
    if not force:
        existing_count = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(DocumentChunk)
                    .where(DocumentChunk.version_id == ver.id)
                )
            ).scalar_one()
        )
        if existing_count > 0:
            return existing_count

    storage = get_storage()
    raw_bytes = await storage.get_bytes(ver.storage_key)
    count = await index_document_version(
        db,
        document_id=doc.id,
        version_id=ver.id,
        raw_bytes=raw_bytes,
        mime_type=ver.mime_type,
        filename=doc.name,
        force=force,
    )
    await db.commit()
    return count


def _lexical_score(query: str, content: str) -> float:
    q_tokens = tokenize_for_search(query)
    if not q_tokens:
        return 0.0
    c_tokens = tokenize_for_search(content)
    if not c_tokens:
        return 0.0
    c_set = set(c_tokens)
    hits = sum(1 for tok in set(q_tokens) if tok in c_set)
    coverage = hits / len(set(q_tokens))
    tf_boost = sum(min(3, c_tokens.count(tok)) for tok in set(q_tokens)) / (
        3.0 * len(set(q_tokens))
    )
    phrase_bonus = 0.25 if query.strip().lower() in content.lower() else 0.0
    return min(1.0, (0.55 * coverage) + (0.30 * tf_boost) + phrase_bonus)


def _extract_best_snippet(query: str, content: str, max_len: int = 280) -> str:
    if len(content) <= max_len:
        return content
    q_tokens = tokenize_for_search(query)
    lower = content.lower()
    best_pos = 0
    for tok in q_tokens:
        pos = lower.find(tok)
        if pos != -1:
            best_pos = max(0, pos - 60)
            break
    snippet = content[best_pos : best_pos + max_len].strip()
    if best_pos > 0:
        snippet = "..." + snippet
    if best_pos + max_len < len(content):
        snippet = snippet + "..."
    return snippet


async def semantic_search(
    db: AsyncSession,
    *,
    actor: ActorContext,
    query: str,
    document_ids: list[str] | None = None,
    limit: int = 8,
    mode: str = "hybrid",
) -> list[dict[str, Any]]:
    """
    Execute actor-scoped pgvector / cosine + lexical hybrid search over current document versions.
    """
    q_clean = query.strip()
    if not q_clean:
        return []

    [query_vec], _ = await generate_embeddings([q_clean])

    # Auto-index any unindexed text-capable documents owned by actor in scope
    doc_stmt = select(Document).where(Document.deleted_at.is_(None))
    if actor.is_guest:
        doc_stmt = doc_stmt.where(Document.guest_session_id == actor.guest_session_id)
    else:
        doc_stmt = doc_stmt.where(Document.owner_id == actor.user_id)
    if document_ids:
        doc_stmt = doc_stmt.where(Document.id.in_(document_ids))

    docs = list((await db.execute(doc_stmt)).scalars().all())
    if not docs:
        return []

    ver_ids: list[str] = []
    doc_by_id = {d.id: d for d in docs}
    for d in docs:
        ver = (
            await db.execute(
                select(DocumentVersion).where(
                    DocumentVersion.document_id == d.id,
                    DocumentVersion.version_no == d.current_version_no,
                )
            )
        ).scalar_one_or_none()
        if ver:
            ver_ids.append(ver.id)
            if not d.mime_type.startswith("image/"):
                try:
                    await ensure_document_indexed(db, d, ver, force=False)
                except Exception:
                    logger.warning("Auto-index skipped for doc %s", d.id)

    if not ver_ids:
        return []

    bind = db.get_bind()
    is_pg = bind is not None and bind.dialect.name == "postgresql"

    candidates: list[tuple[DocumentChunk, DocumentVersion, float | None]] = []
    if is_pg:
        distance_expr = DocumentChunk.embedding.cosine_distance(query_vec)
        stmt = (
            select(DocumentChunk, DocumentVersion, distance_expr.label("dist"))
            .join(DocumentVersion, DocumentChunk.version_id == DocumentVersion.id)
            .where(DocumentChunk.version_id.in_(ver_ids))
            .order_by(distance_expr.asc())
            .limit(max(limit * 4, 30))
        )
        for chunk, ver, dist in (await db.execute(stmt)).all():
            candidates.append((chunk, ver, float(dist) if dist is not None else None))
    else:
        stmt = (
            select(DocumentChunk, DocumentVersion)
            .join(DocumentVersion, DocumentChunk.version_id == DocumentVersion.id)
            .where(DocumentChunk.version_id.in_(ver_ids))
        )
        for chunk, ver in (await db.execute(stmt)).all():
            candidates.append((chunk, ver, None))

    scored: list[dict[str, Any]] = []
    for chunk, ver, pg_dist in candidates:
        doc = doc_by_id.get(chunk.document_id)
        if not doc:
            continue
        if pg_dist is not None:
            vec_score = max(0.0, 1.0 - pg_dist)
        else:
            vec_score = max(0.0, cosine_similarity(query_vec, chunk.embedding))

        lex_score = _lexical_score(q_clean, chunk.content)
        if mode == "semantic":
            combined = vec_score
        elif mode == "keyword":
            combined = lex_score
        else:
            combined = (0.55 * vec_score) + (0.45 * lex_score)

        # Boost exact document name match slightly
        if any(tok in doc.name.lower() for tok in tokenize_for_search(q_clean)):
            combined = min(1.0, combined + 0.08)

        if mode == "keyword" and lex_score <= 0.0:
            continue

        scored.append(
            {
                "chunk_id": chunk.id,
                "document_id": doc.id,
                "document_name": doc.name,
                "mime_type": doc.mime_type,
                "version_no": ver.version_no,
                "page_no": chunk.page_no,
                "section_title": chunk.section_title,
                "snippet": _extract_best_snippet(q_clean, chunk.content),
                "full_text": chunk.content,
                "score": round(float(combined), 4),
                "vector_score": round(float(vec_score), 4),
                "lexical_score": round(float(lex_score), 4),
            }
        )

    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:limit]


async def _resolve_ai_personalization(
    db: AsyncSession,
    actor: ActorContext,
    response_style: str | None,
    custom_instructions: str | None,
) -> tuple[str, str]:
    style = response_style or "balanced"
    instructions = (custom_instructions or "").strip()
    if (response_style is None or custom_instructions is None) and actor.user_id:
        pref_row = (
            await db.execute(
                select(UserPreference).where(UserPreference.user_id == actor.user_id)
            )
        ).scalar_one_or_none()
        if pref_row and isinstance(pref_row.preferences, dict):
            if response_style is None and isinstance(
                pref_row.preferences.get("ai_response_style"), str
            ):
                style = pref_row.preferences["ai_response_style"]
            if custom_instructions is None and isinstance(
                pref_row.preferences.get("custom_instructions"), str
            ):
                instructions = pref_row.preferences["custom_instructions"].strip()
    return style, instructions


def _style_instruction_line(style: str) -> str:
    return {
        "concise": "Respond concisely with brief bullet points and direct facts.",
        "detailed": "Provide a thorough, step-by-step explanation with full supporting context.",
        "academic": "Use formal academic tone with precise terminology and clear structure.",
    }.get(style, "Use a clear, balanced, and helpful tone.")


async def answer_question_with_citations(
    db: AsyncSession,
    *,
    actor: ActorContext,
    question: str,
    document_ids: list[str] | None = None,
    thread_id: str | None = None,
    top_k: int = 5,
    response_style: str | None = None,
    custom_instructions: str | None = None,
) -> dict[str, Any]:
    """Retrieve cited document chunks and synthesize a grounded answer persisted in QaThread."""
    style, instructions = await _resolve_ai_personalization(
        db, actor, response_style, custom_instructions
    )

    hits = await semantic_search(
        db,
        actor=actor,
        query=question,
        document_ids=document_ids,
        limit=top_k,
        mode="hybrid",
    )

    citations_for_llm: list[dict[str, Any]] = []
    citations_out: list[dict[str, Any]] = []
    for idx, hit in enumerate(hits, start=1):
        cit = {
            "index": idx,
            "chunk_id": hit["chunk_id"],
            "document_id": hit["document_id"],
            "document_name": hit["document_name"],
            "version_no": hit["version_no"],
            "page_no": hit["page_no"],
            "section_title": hit["section_title"],
            "snippet": hit["snippet"],
            "score": hit["score"],
        }
        citations_out.append(cit)
        citations_for_llm.append({**cit, "full_text": hit["full_text"]})

    answer_text: str | None = None
    model_used = "documind-extractive-rag-v1"
    if citations_for_llm:
        context_block = "\n\n".join(
            f"[{c['index']}] File: {c['document_name']} | "
            f"Page: {c['page_no'] or '-'} | Section: {c['section_title'] or '-'}\n"
            f"{c['full_text']}"
            for c in citations_for_llm
        )
        system_prompt = (
            "You are DocuMind AI. Answer the user's question ONLY using the provided "
            "document excerpts. Cite facts inline using [1], [2], etc. matching the excerpt "
            "numbers. If the excerpts do not contain the answer, say so honestly. "
            + _style_instruction_line(style)
        )
        if instructions:
            system_prompt += f"\nUser custom instructions: {instructions}"
        user_prompt = f"Question: {question}\n\nExcerpts:\n{context_block}"
        answer_text, model_used = await call_chat_completion(system_prompt, user_prompt)

    if not answer_text:
        answer_text = synthesize_grounded_answer(
            question, citations_for_llm, response_style=style
        )
        model_used = "documind-extractive-rag-v1"

    # Load or create QaThread
    thread: QaThread | None = None
    if thread_id:
        t_stmt = select(QaThread).where(QaThread.id == thread_id)
        if actor.is_guest:
            t_stmt = t_stmt.where(QaThread.guest_session_id == actor.guest_session_id)
        else:
            t_stmt = t_stmt.where(QaThread.user_id == actor.user_id)
        thread = (await db.execute(t_stmt)).scalar_one_or_none()

    if thread is None:
        primary_doc = document_ids[0] if document_ids and len(document_ids) == 1 else None
        thread = QaThread(
            user_id=actor.user_id,
            guest_session_id=actor.guest_session_id,
            document_id=primary_doc,
            title=question.strip()[:120] or "Document Q&A",
        )
        db.add(thread)
        await db.flush()

    user_msg = QaMessage(
        thread_id=thread.id,
        role="user",
        content=question.strip(),
        citations=[],
    )
    assistant_msg = QaMessage(
        thread_id=thread.id,
        role="assistant",
        content=answer_text,
        citations=citations_out,
        model_used=model_used,
    )
    db.add(user_msg)
    db.add(assistant_msg)
    await db.flush()

    await record_audit_log(
        db,
        action="ai.qa.ask",
        resource_type="qa_thread",
        resource_id=thread.id,
        actor_user_id=actor.user_id,
        actor_guest_session_id=actor.guest_session_id,
        metadata={"citations_count": len(citations_out), "model": model_used},
    )
    await db.commit()

    return {
        "thread_id": thread.id,
        "message_id": assistant_msg.id,
        "answer": answer_text,
        "citations": citations_out,
        "model_used": model_used,
        "retrieved_count": len(citations_out),
    }


async def summarize_document(
    db: AsyncSession,
    *,
    actor: ActorContext,
    doc: Document,
    ver: DocumentVersion,
    focus: str | None = None,
    response_style: str | None = None,
    custom_instructions: str | None = None,
) -> dict[str, Any]:
    """Summarize a document with inline page/section citations."""
    style, instructions = await _resolve_ai_personalization(
        db, actor, response_style, custom_instructions
    )
    await ensure_document_indexed(db, doc, ver, force=False)
    rows = list(
        (
            await db.execute(
                select(DocumentChunk)
                .where(DocumentChunk.version_id == ver.id)
                .order_by(DocumentChunk.chunk_index.asc())
            )
        )
        .scalars()
        .all()
    )

    chunk_dicts = [
        {
            "id": ch.id,
            "document_id": doc.id,
            "version_no": ver.version_no,
            "page_no": ch.page_no,
            "section_title": ch.section_title,
            "content": ch.content,
        }
        for ch in rows
    ]

    summary, key_points, citations = synthesize_local_summary(doc.name, chunk_dicts)
    model_used = "documind-extractive-rag-v1"

    if chunk_dicts:
        sample = chunk_dicts[:8]
        context = "\n\n".join(
            f"[{i}] (Page {c.get('page_no') or '-'}): {c['content']}"
            for i, c in enumerate(sample, start=1)
        )
        focus_note = f" Focus specifically on: {focus}." if focus else ""
        sys_sum = (
            "Summarize the document accurately using ONLY the excerpts. Cite with [1], [2], etc. "
            + _style_instruction_line(style)
        )
        if instructions:
            sys_sum += f"\nUser custom instructions: {instructions}"
        llm_resp, llm_model = await call_chat_completion(
            sys_sum,
            f"Document: {doc.name}.{focus_note}\n\n{context}",
        )
        if llm_resp:
            summary = llm_resp
            model_used = llm_model
            citations = [
                {
                    "index": i,
                    "chunk_id": c["id"],
                    "document_id": doc.id,
                    "document_name": doc.name,
                    "version_no": ver.version_no,
                    "page_no": c.get("page_no"),
                    "section_title": c.get("section_title"),
                    "snippet": str(c["content"])[:260],
                    "score": 1.0,
                }
                for i, c in enumerate(sample, start=1)
            ]

    await record_audit_log(
        db,
        action="ai.document.summarize",
        resource_type="document",
        resource_id=doc.id,
        actor_user_id=actor.user_id,
        actor_guest_session_id=actor.guest_session_id,
        metadata={"chunks": len(chunk_dicts), "model": model_used},
    )
    await db.commit()

    return {
        "document_id": doc.id,
        "document_name": doc.name,
        "summary": summary,
        "key_points": key_points,
        "citations": citations,
        "model_used": model_used,
    }
