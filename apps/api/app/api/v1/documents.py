from __future__ import annotations

import asyncio
import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from app.api.deps import ActorContext, get_current_actor, get_owned_document
from app.core.config import get_settings
from app.db.models import (
    AuditLog,
    Document,
    DocumentMetadata,
    DocumentPage,
    DocumentVersion,
    Folder,
    UserSession,
)
from app.db.session import get_db
from app.schemas.common import ok_response
from app.schemas.documents import (
    DocumentDetailOut,
    DocumentOut,
    DocumentPageOut,
    DocumentPatch,
    DocumentVersionOut,
)
from app.services.audit import record_audit_log
from app.services.clamav import scan_bytes_for_malware
from app.services.file_validation import validate_upload_bytes
from app.services.job_runner import pdf_engine, populate_pdf_version_assets
from app.services.retention import hard_delete_document
from app.services.storage import get_storage
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/documents", tags=["documents"])

# In-memory chunked upload staging registry (backed by storage chunks)
_CHUNK_UPLOADS: dict[str, dict[str, Any]] = {}


def _doc_to_out(
    doc: Document,
    *,
    is_duplicate: bool = False,
    latest_ver: DocumentVersion | None = None,
) -> dict:
    thumb_url = None
    page_count = latest_ver.page_count if latest_ver else None
    if latest_ver and latest_ver.pages:
        first_page = latest_ver.pages[0]
        if first_page.thumbnail_key:
            thumb_url = f"/api/v1/documents/{doc.id}/pages/1/thumbnail?v={latest_ver.version_no}"

    return DocumentOut(
        id=doc.id,
        folder_id=doc.folder_id,
        name=doc.name,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        sha256=doc.sha256,
        current_version_no=doc.current_version_no,
        is_favorite=doc.is_favorite,
        is_duplicate=is_duplicate,
        status=doc.status,
        expires_at=doc.expires_at,
        deleted_at=doc.deleted_at,
        page_count=page_count,
        thumbnail_url=thumb_url,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    ).model_dump()


async def _ingest_uploaded_bytes(
    *,
    db: AsyncSession,
    actor: ActorContext,
    raw_name: str,
    raw_bytes: bytes,
    folder_id: str | None,
    ip_address: str | None,
) -> tuple[Document, bool]:
    settings = get_settings()
    validated = validate_upload_bytes(raw_name, raw_bytes, settings.max_upload_bytes)

    av = await scan_bytes_for_malware(raw_bytes)
    if not av.clean:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Upload blocked by malware scanner ({av.engine}): {av.detail}",
        )

    processed_bytes = raw_bytes
    if validated.extension == ".pdf":
        # Strip potentially dangerous PDF JavaScript actions before storage
        try:
            processed_bytes, _ = await asyncio.to_thread(pdf_engine.strip_pdf_javascript, raw_bytes)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded PDF appears corrupted or unreadable.",
            ) from exc

    sha = hashlib.sha256(processed_bytes).hexdigest()

    # Duplicate detection per actor
    dup_stmt = select(Document.id).where(Document.sha256 == sha, Document.deleted_at.is_(None))
    if actor.is_guest:
        dup_stmt = dup_stmt.where(Document.guest_session_id == actor.guest_session_id)
    else:
        dup_stmt = dup_stmt.where(Document.owner_id == actor.user_id)
    is_dup = (await db.execute(dup_stmt.limit(1))).scalar_one_or_none() is not None

    if folder_id and not actor.is_guest:
        folder = (
            await db.execute(
                select(Folder).where(
                    Folder.id == folder_id,
                    Folder.owner_id == actor.user_id,
                    Folder.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if not folder:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found.")

    expires_at: datetime | None = None
    if actor.is_guest:
        sess = await db.get(UserSession, actor.guest_session_id)
        expires_at = (
            sess.expires_at
            if sess
            else datetime.now(UTC) + timedelta(minutes=settings.guest_session_expire_minutes)
        )

    doc = Document(
        owner_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        folder_id=folder_id if not actor.is_guest else None,
        name=validated.safe_filename,
        mime_type=validated.mime_type,
        size_bytes=len(processed_bytes),
        sha256=sha,
        current_version_no=1,
        status="ready",
        expires_at=expires_at,
    )
    db.add(doc)
    await db.flush()

    ver_id = str(uuid.uuid4())
    storage_key = f"documents/{doc.id}/v1_{ver_id}{validated.extension}"
    storage = get_storage()
    await storage.put_bytes(storage_key, processed_bytes, validated.mime_type)

    ver = DocumentVersion(
        id=ver_id,
        document_id=doc.id,
        version_no=1,
        storage_key=storage_key,
        mime_type=validated.mime_type,
        size_bytes=len(processed_bytes),
        sha256=sha,
        created_by=actor.user_id,
    )
    db.add(ver)
    await db.flush()

    if validated.extension == ".pdf":
        await populate_pdf_version_assets(db, ver, processed_bytes)

    if validated.extension in (".pdf", ".docx", ".xlsx", ".pptx", ".md", ".markdown", ".txt"):
        try:
            from app.services.rag import index_document_version

            await index_document_version(
                db,
                document_id=doc.id,
                version_id=ver.id,
                raw_bytes=processed_bytes,
                mime_type=validated.mime_type,
                filename=doc.name,
                force=True,
            )
        except Exception:
            pass

    await record_audit_log(
        db,
        action="document.upload",
        resource_type="document",
        resource_id=doc.id,
        actor_user_id=actor.user_id,
        actor_guest_session_id=actor.guest_session_id,
        ip_address=ip_address,
        metadata={"name": doc.name, "size_bytes": doc.size_bytes, "mime_type": doc.mime_type},
    )
    await db.commit()
    return doc, is_dup


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    folder_id: str | None = Form(default=None),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    raw_bytes = await file.read()
    try:
        doc, is_dup = await _ingest_uploaded_bytes(
            db=db,
            actor=actor,
            raw_name=file.filename or "document.pdf",
            raw_bytes=raw_bytes,
            folder_id=folder_id,
            ip_address=request.client.host if request.client else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    ver = (
        await db.execute(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == doc.id, DocumentVersion.version_no == 1)
            .options(selectinload(DocumentVersion.pages))
        )
    ).scalar_one()
    return ok_response(_doc_to_out(doc, is_duplicate=is_dup, latest_ver=ver))


@router.post("/upload/init", status_code=status.HTTP_201_CREATED)
async def init_chunked_upload(
    filename: str = Form(...),
    total_chunks: int = Form(..., ge=1, le=500),
    folder_id: str | None = Form(default=None),
    actor: ActorContext = Depends(get_current_actor),
) -> dict:
    upload_id = str(uuid.uuid4())
    _CHUNK_UPLOADS[upload_id] = {
        "actor_key": actor.user_id or actor.guest_session_id,
        "filename": filename,
        "total_chunks": total_chunks,
        "folder_id": folder_id,
        "chunks": {},
    }
    return ok_response({"upload_id": upload_id, "total_chunks": total_chunks})


@router.post("/upload/{upload_id}/chunk")
async def upload_chunk(
    upload_id: str,
    chunk_index: int = Form(..., ge=0),
    chunk: UploadFile = File(...),
    actor: ActorContext = Depends(get_current_actor),
) -> dict:
    session = _CHUNK_UPLOADS.get(upload_id)
    actor_key = actor.user_id or actor.guest_session_id
    if not session or session["actor_key"] != actor_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found."
        )
    if chunk_index >= session["total_chunks"]:
        raise HTTPException(status_code=400, detail="Chunk index out of range.")
    data = await chunk.read()
    key = f"tmp_chunks/{upload_id}/{chunk_index}"
    await get_storage().put_bytes(key, data)
    session["chunks"][chunk_index] = key
    return ok_response({"upload_id": upload_id, "received_chunks": len(session["chunks"])})


@router.post("/upload/{upload_id}/complete", status_code=status.HTTP_201_CREATED)
async def complete_chunked_upload(
    upload_id: str,
    request: Request,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    session = _CHUNK_UPLOADS.get(upload_id)
    actor_key = actor.user_id or actor.guest_session_id
    if not session or session["actor_key"] != actor_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found."
        )
    if len(session["chunks"]) != session["total_chunks"]:
        raise HTTPException(status_code=400, detail="Not all chunks have been uploaded yet.")

    storage = get_storage()
    parts: list[bytes] = []
    for idx in range(session["total_chunks"]):
        key = session["chunks"][idx]
        parts.append(await storage.get_bytes(key))
        await storage.delete_object(key)
    _CHUNK_UPLOADS.pop(upload_id, None)

    combined = b"".join(parts)
    try:
        doc, is_dup = await _ingest_uploaded_bytes(
            db=db,
            actor=actor,
            raw_name=session["filename"],
            raw_bytes=combined,
            folder_id=session["folder_id"],
            ip_address=request.client.host if request.client else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    ver = (
        await db.execute(
            select(DocumentVersion)
            .where(DocumentVersion.document_id == doc.id, DocumentVersion.version_no == 1)
            .options(selectinload(DocumentVersion.pages))
        )
    ).scalar_one()
    return ok_response(_doc_to_out(doc, is_duplicate=is_dup, latest_ver=ver))


@router.get("")
async def list_documents(
    folder_id: str | None = Query(default=None),
    trashed: bool = Query(default=False),
    favorites_only: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=200),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=24, ge=1, le=100),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    conditions = []
    if actor.is_guest:
        conditions.append(Document.guest_session_id == actor.guest_session_id)
    else:
        conditions.append(Document.owner_id == actor.user_id)

    if trashed:
        conditions.append(Document.deleted_at.is_not(None))
    else:
        conditions.append(Document.deleted_at.is_(None))
        if folder_id:
            conditions.append(Document.folder_id == folder_id)
    if favorites_only:
        conditions.append(Document.is_favorite.is_(True))
    if q:
        conditions.append(Document.name.ilike(f"%{q.strip()}%"))

    total_stmt = select(func.count()).select_from(Document).where(and_(*conditions))
    total = int((await db.execute(total_stmt)).scalar_one())

    offset = 0
    if cursor and cursor.isdigit():
        offset = int(cursor)

    stmt = (
        select(Document)
        .where(and_(*conditions))
        .order_by(desc(Document.updated_at))
        .offset(offset)
        .limit(limit + 1)
    )
    docs = list((await db.execute(stmt)).scalars().all())
    has_more = len(docs) > limit
    docs = docs[:limit]

    items: list[dict] = []
    for d in docs:
        ver = (
            await db.execute(
                select(DocumentVersion)
                .where(
                    DocumentVersion.document_id == d.id,
                    DocumentVersion.version_no == d.current_version_no,
                )
                .options(selectinload(DocumentVersion.pages))
            )
        ).scalar_one_or_none()
        items.append(_doc_to_out(d, latest_ver=ver))

    next_cursor = str(offset + limit) if has_more else None
    return ok_response(
        items, cursor=cursor, next_cursor=next_cursor, has_more=has_more, total=total
    )


@router.get("/{document_id}")
async def get_document_detail(
    document_id: str,
    version_no: int | None = Query(default=None),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_owned_document(db, document_id, actor, allow_trashed=True)
    versions = (
        (
            await db.execute(
                select(DocumentVersion)
                .where(DocumentVersion.document_id == doc.id)
                .options(
                    selectinload(DocumentVersion.operation), selectinload(DocumentVersion.pages)
                )
                .order_by(DocumentVersion.version_no.desc())
            )
        )
        .scalars()
        .all()
    )

    target_no = version_no or doc.current_version_no
    active_ver = next(
        (v for v in versions if v.version_no == target_no), versions[0] if versions else None
    )
    meta_row = (
        await db.execute(
            select(DocumentMetadata).where(DocumentMetadata.version_id == active_ver.id)
        )
        if active_ver
        else None
    )
    meta = meta_row.scalar_one_or_none() if meta_row else None

    detail = DocumentDetailOut(
        **_doc_to_out(doc, latest_ver=active_ver),
        versions=[
            DocumentVersionOut(
                id=v.id,
                version_no=v.version_no,
                mime_type=v.mime_type,
                size_bytes=v.size_bytes,
                sha256=v.sha256,
                page_count=v.page_count,
                operation_type=v.operation.operation_type if v.operation else "upload",
                created_at=v.created_at,
            )
            for v in versions
        ],
        pages=[
            DocumentPageOut(
                id=p.id,
                page_no=p.page_no,
                width=p.width,
                height=p.height,
                rotation=p.rotation,
                thumbnail_url=(
                    f"/api/v1/documents/{doc.id}/pages/{p.page_no}/thumbnail?v={active_ver.version_no}"
                    if p.thumbnail_key and active_ver
                    else None
                ),
            )
            for p in (active_ver.pages if active_ver else [])
        ],
        metadata=meta.raw_info if meta else {},
    )
    return ok_response(detail.model_dump())


@router.patch("/{document_id}")
async def patch_document(
    document_id: str,
    payload: DocumentPatch,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_owned_document(db, document_id, actor)
    if payload.name is not None:
        doc.name = payload.name.strip()
    if payload.is_favorite is not None:
        doc.is_favorite = payload.is_favorite
    if payload.folder_id is not None and not actor.is_guest:
        folder = (
            await db.execute(
                select(Folder).where(
                    Folder.id == payload.folder_id,
                    Folder.owner_id == actor.user_id,
                    Folder.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if not folder:
            raise HTTPException(status_code=404, detail="Target folder not found.")
        doc.folder_id = payload.folder_id

    await record_audit_log(
        db,
        action="document.update",
        resource_type="document",
        resource_id=doc.id,
        actor_user_id=actor.user_id,
        actor_guest_session_id=actor.guest_session_id,
    )
    await db.commit()
    await db.refresh(doc)
    return ok_response(_doc_to_out(doc))


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    permanent: bool = Query(default=False),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_owned_document(db, document_id, actor, allow_trashed=True)
    if permanent or actor.is_guest:
        await hard_delete_document(db, doc)
        await record_audit_log(
            db,
            action="document.hard_delete",
            resource_type="document",
            resource_id=document_id,
            actor_user_id=actor.user_id,
            actor_guest_session_id=actor.guest_session_id,
        )
        await db.commit()
        return ok_response({"deleted": True, "permanent": True})

    doc.deleted_at = datetime.now(UTC)
    await record_audit_log(
        db,
        action="document.trash",
        resource_type="document",
        resource_id=doc.id,
        actor_user_id=actor.user_id,
    )
    await db.commit()
    return ok_response({"deleted": True, "permanent": False})


@router.post("/{document_id}/restore")
async def restore_document(
    document_id: str,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_owned_document(db, document_id, actor, allow_trashed=True)
    doc.deleted_at = None
    await record_audit_log(
        db,
        action="document.restore",
        resource_type="document",
        resource_id=doc.id,
        actor_user_id=actor.user_id,
    )
    await db.commit()
    await db.refresh(doc)
    return ok_response(_doc_to_out(doc))


@router.get("/{document_id}/preview")
async def preview_document(
    document_id: str,
    v: int | None = Query(default=None),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> Response:
    doc = await get_owned_document(db, document_id, actor, allow_trashed=True)
    target_v = v or doc.current_version_no
    ver = (
        await db.execute(
            select(DocumentVersion).where(
                DocumentVersion.document_id == doc.id,
                DocumentVersion.version_no == target_v,
            )
        )
    ).scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="Document version not found.")
    data = await get_storage().get_bytes(ver.storage_key)
    return Response(
        content=data,
        media_type=ver.mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{doc.name}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{document_id}/download")
async def download_document(
    document_id: str,
    v: int | None = Query(default=None),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> Response:
    doc = await get_owned_document(db, document_id, actor, allow_trashed=True)
    target_v = v or doc.current_version_no
    ver = (
        await db.execute(
            select(DocumentVersion).where(
                DocumentVersion.document_id == doc.id,
                DocumentVersion.version_no == target_v,
            )
        )
    ).scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="Document version not found.")
    data = await get_storage().get_bytes(ver.storage_key)
    return Response(
        content=data,
        media_type=ver.mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{doc.name}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{document_id}/pages/{page_no}/thumbnail")
async def get_page_thumbnail(
    document_id: str,
    page_no: int,
    v: int | None = Query(default=None),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> Response:
    doc = await get_owned_document(db, document_id, actor, allow_trashed=True)
    target_v = v or doc.current_version_no
    ver = (
        await db.execute(
            select(DocumentVersion).where(
                DocumentVersion.document_id == doc.id,
                DocumentVersion.version_no == target_v,
            )
        )
    ).scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found.")
    page = (
        await db.execute(
            select(DocumentPage).where(
                DocumentPage.version_id == ver.id,
                DocumentPage.page_no == page_no,
            )
        )
    ).scalar_one_or_none()
    if not page or not page.thumbnail_key:
        raise HTTPException(status_code=404, detail="Thumbnail not found.")
    png_bytes = await get_storage().get_bytes(page.thumbnail_key)
    return Response(content=png_bytes, media_type="image/png")


@router.get("/{document_id}/history")
async def get_document_history(
    document_id: str,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_owned_document(db, document_id, actor, allow_trashed=True)
    logs = (
        (
            await db.execute(
                select(AuditLog)
                .where(AuditLog.resource_type == "document", AuditLog.resource_id == doc.id)
                .order_by(desc(AuditLog.created_at))
                .limit(50)
            )
        )
        .scalars()
        .all()
    )
    return ok_response(
        [
            {
                "id": log.id,
                "action": log.action,
                "metadata": log.meta,
                "created_at": log.created_at,
            }
            for log in logs
        ]
    )
