from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.db.models import Document, DocumentVersion
from app.db.session import AsyncSessionLocal
from app.services.storage import get_storage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


async def hard_delete_document(db: AsyncSession, doc: Document) -> None:
    """Permanently delete a document's stored objects (versions + thumbnails) and DB record."""
    storage = get_storage()
    stmt = (
        select(DocumentVersion)
        .where(DocumentVersion.document_id == doc.id)
        .options(selectinload(DocumentVersion.pages))
    )
    versions = (await db.execute(stmt)).scalars().all()
    keys_to_delete: list[str] = []
    for ver in versions:
        keys_to_delete.append(ver.storage_key)
        for page in ver.pages:
            if page.thumbnail_key:
                keys_to_delete.append(page.thumbnail_key)

    await db.delete(doc)
    await db.flush()

    for key in keys_to_delete:
        try:
            await storage.delete_object(key)
        except Exception:
            # Best-effort cleanup of backing object
            pass


async def purge_expired_guest_documents() -> int:
    """Delete all guest documents whose expires_at has passed, plus 30-day-old trashed docs."""
    now = datetime.now(UTC)
    trash_cutoff = now - timedelta(days=30)
    deleted_count = 0

    async with AsyncSessionLocal() as db:
        stmt = select(Document).where(
            ((Document.expires_at.is_not(None)) & (Document.expires_at <= now))
            | ((Document.deleted_at.is_not(None)) & (Document.deleted_at <= trash_cutoff))
        )
        docs = (await db.execute(stmt)).scalars().all()
        for doc in docs:
            await hard_delete_document(db, doc)
            deleted_count += 1
        await db.commit()
    return deleted_count
