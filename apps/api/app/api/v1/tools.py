from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from app.api.deps import ActorContext, get_current_actor, get_owned_document
from app.core.config import get_settings
from app.db.models import ConversionJob, Document, DocumentVersion, UserSession
from app.db.session import get_db
from app.schemas.common import ok_response
from app.schemas.tools import (
    CompressRequest,
    ConvertRequest,
    ExtractTablesRequest,
    JobOut,
    MergeRequest,
    OcrRequest,
    PageNumbersRequest,
    PageTransformRequest,
    ProtectRequest,
    SplitRequest,
    UnlockRequest,
    WatermarkRequest,
)
from app.services.audit import record_audit_log
from app.services.clamav import scan_bytes_for_malware
from app.services.file_validation import validate_upload_bytes
from app.services.job_runner import (
    converter,
    dispatch_job,
    pdf_engine,
    populate_pdf_version_assets,
)
from app.services.storage import get_storage
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from worker import conversion_engine

router = APIRouter(prefix="/tools", tags=["tools"])


def _job_to_out(job: ConversionJob) -> dict[str, Any]:
    return JobOut(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        progress=job.progress,
        stage_message=job.stage_message,
        source_version_id=job.source_version_id,
        output_document_id=job.output_document_id,
        output_version_id=job.output_version_id,
        result_meta=job.result_meta,
        error_detail=job.error_detail,
        created_at=job.created_at,
        completed_at=job.completed_at,
    ).model_dump()


async def _get_latest_version(db: AsyncSession, doc: Document) -> DocumentVersion:
    ver = (
        await db.execute(
            select(DocumentVersion).where(
                DocumentVersion.document_id == doc.id,
                DocumentVersion.version_no == doc.current_version_no,
            )
        )
    ).scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="Current document version not found.")
    return ver


async def _enqueue_pdf_job(
    *,
    db: AsyncSession,
    actor: ActorContext,
    source_version: DocumentVersion,
    job_type: str,
    params: dict[str, Any],
    idempotency_key: str | None,
) -> ConversionJob:
    if idempotency_key and actor.user_id:
        existing = (
            await db.execute(
                select(ConversionJob).where(
                    ConversionJob.user_id == actor.user_id,
                    ConversionJob.idempotency_key == idempotency_key,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return existing

    job = ConversionJob(
        user_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        source_version_id=source_version.id,
        job_type=job_type,
        params=params,
        idempotency_key=idempotency_key if actor.user_id else None,
        status="queued",
        progress=0,
        stage_message="Queued",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    await dispatch_job(job.id)
    return job


@router.post("/pdf/merge", status_code=status.HTTP_202_ACCEPTED)
async def merge_pdf_tool(
    payload: MergeRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    version_ids: list[str] = []
    page_specs: list[list[int] | None] = []
    first_ver: DocumentVersion | None = None

    for item in payload.items:
        doc = await get_owned_document(db, item.document_id, actor)
        if doc.mime_type != "application/pdf":
            raise HTTPException(status_code=400, detail=f"'{doc.name}' is not a PDF.")
        ver = await _get_latest_version(db, doc)
        if first_ver is None:
            first_ver = ver
        version_ids.append(ver.id)
        if item.pages:
            total = ver.page_count or 1000
            try:
                page_specs.append(pdf_engine.parse_page_ranges(item.pages, total))
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        else:
            page_specs.append(None)

    assert first_ver is not None
    job = await _enqueue_pdf_job(
        db=db,
        actor=actor,
        source_version=first_ver,
        job_type="merge",
        params={
            "version_ids": version_ids,
            "page_specs": page_specs,
            "output_name": payload.output_name,
        },
        idempotency_key=idempotency_key,
    )
    return ok_response(_job_to_out(job))


@router.post("/pdf/split", status_code=status.HTTP_202_ACCEPTED)
async def split_pdf_tool(
    payload: SplitRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_owned_document(db, payload.document_id, actor)
    if doc.mime_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files can be split.")
    ver = await _get_latest_version(db, doc)
    total = ver.page_count or 1

    groups: list[list[int]] = []
    if payload.mode == "every_n":
        n = payload.every_n or 1
        for start in range(1, total + 1, n):
            groups.append(list(range(start, min(total, start + n - 1) + 1)))
    else:
        if not payload.ranges:
            raise HTTPException(status_code=400, detail="Provide at least one page range.")
        try:
            for spec in payload.ranges:
                groups.append(pdf_engine.parse_page_ranges(spec, total))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    job = await _enqueue_pdf_job(
        db=db,
        actor=actor,
        source_version=ver,
        job_type="split",
        params={"groups": groups},
        idempotency_key=idempotency_key,
    )
    return ok_response(_job_to_out(job))


@router.post("/pdf/pages", status_code=status.HTTP_202_ACCEPTED)
async def transform_pdf_pages(
    payload: PageTransformRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_owned_document(db, payload.document_id, actor)
    if doc.mime_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files support page operations.")
    ver = await _get_latest_version(db, doc)
    total = ver.page_count or 1

    if payload.action == "rotate":
        if payload.angle is None:
            raise HTTPException(
                status_code=400, detail="Rotation angle (90, 180, 270) is required."
            )
        job = await _enqueue_pdf_job(
            db=db,
            actor=actor,
            source_version=ver,
            job_type="rotate",
            params={"angle": payload.angle, "pages": payload.pages},
            idempotency_key=idempotency_key,
        )
        return ok_response(_job_to_out(job))

    if not payload.pages:
        raise HTTPException(status_code=400, detail="Specify target page numbers.")

    if payload.action == "delete":
        to_delete = set(payload.pages)
        remaining = [p for p in range(1, total + 1) if p not in to_delete]
        if not remaining:
            raise HTTPException(status_code=400, detail="Cannot delete every page of a PDF.")
        job = await _enqueue_pdf_job(
            db=db,
            actor=actor,
            source_version=ver,
            job_type="delete_pages",
            params={"pages": remaining},
            idempotency_key=idempotency_key,
        )
        return ok_response(_job_to_out(job))

    job_type = "reorder" if payload.action == "reorder" else "extract_pages"
    job = await _enqueue_pdf_job(
        db=db,
        actor=actor,
        source_version=ver,
        job_type=job_type,
        params={"pages": payload.pages},
        idempotency_key=idempotency_key,
    )
    return ok_response(_job_to_out(job))


@router.post("/pdf/watermark", status_code=status.HTTP_202_ACCEPTED)
async def watermark_pdf_tool(
    payload: WatermarkRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_owned_document(db, payload.document_id, actor)
    if doc.mime_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files can be watermarked here.")
    ver = await _get_latest_version(db, doc)
    job = await _enqueue_pdf_job(
        db=db,
        actor=actor,
        source_version=ver,
        job_type="watermark",
        params={
            "text": payload.text,
            "opacity": payload.opacity,
            "angle": payload.angle,
            "font_size": payload.font_size,
        },
        idempotency_key=idempotency_key,
    )
    return ok_response(_job_to_out(job))


@router.post("/pdf/page-numbers", status_code=status.HTTP_202_ACCEPTED)
async def page_numbers_pdf_tool(
    payload: PageNumbersRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_owned_document(db, payload.document_id, actor)
    if doc.mime_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files support page numbering.")
    ver = await _get_latest_version(db, doc)
    job = await _enqueue_pdf_job(
        db=db,
        actor=actor,
        source_version=ver,
        job_type="page_numbers",
        params={
            "position": payload.position,
            "template": payload.template,
            "start_no": payload.start_no,
        },
        idempotency_key=idempotency_key,
    )
    return ok_response(_job_to_out(job))


@router.post("/pdf/protect", status_code=status.HTTP_202_ACCEPTED)
async def protect_pdf_tool(
    payload: ProtectRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_owned_document(db, payload.document_id, actor)
    if doc.mime_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files can be password-protected.")
    ver = await _get_latest_version(db, doc)
    job = await _enqueue_pdf_job(
        db=db,
        actor=actor,
        source_version=ver,
        job_type="protect",
        params={"password": payload.password, "owner_password": payload.owner_password},
        idempotency_key=idempotency_key,
    )
    return ok_response(_job_to_out(job))


@router.post("/pdf/unlock", status_code=status.HTTP_202_ACCEPTED)
async def unlock_pdf_tool(
    payload: UnlockRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_owned_document(db, payload.document_id, actor)
    if doc.mime_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files can be unlocked.")
    ver = await _get_latest_version(db, doc)
    job = await _enqueue_pdf_job(
        db=db,
        actor=actor,
        source_version=ver,
        job_type="unlock",
        params={"password": payload.password},
        idempotency_key=idempotency_key,
    )
    return ok_response(_job_to_out(job))


@router.post("/compress-to-size", status_code=status.HTTP_202_ACCEPTED)
async def compress_pdf_tool(
    payload: CompressRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc = await get_owned_document(db, payload.document_id, actor)
    if doc.mime_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported here.")
    ver = await _get_latest_version(db, doc)
    job = await _enqueue_pdf_job(
        db=db,
        actor=actor,
        source_version=ver,
        job_type="compress",
        params={"preset": payload.preset, "target_kb": payload.target_kb},
        idempotency_key=idempotency_key,
    )
    return ok_response(_job_to_out(job))


@router.post("/image-resize", status_code=status.HTTP_201_CREATED)
async def resize_photo_signature(
    file: UploadFile = File(...),
    width_px: int = Form(..., ge=32, le=4000),
    height_px: int = Form(..., ge=32, le=4000),
    dpi: int = Form(default=300, ge=72, le=600),
    max_kb: int = Form(default=100, ge=5, le=5120),
    output_format: str = Form(default="JPEG"),
    enhance_background: bool = Form(default=False),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Student photo & signature resizer with exact pixel/DPI/KB presets."""
    settings = get_settings()
    raw_bytes = await file.read()
    try:
        validated = validate_upload_bytes(
            file.filename or "photo.jpg", raw_bytes, settings.max_upload_bytes
        )
        if validated.extension not in (".png", ".jpg", ".jpeg"):
            raise ValueError("Upload a PNG or JPG/JPEG image.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    av = await scan_bytes_for_malware(raw_bytes)
    if not av.clean:
        raise HTTPException(status_code=422, detail=f"Blocked by malware scanner: {av.detail}")

    try:
        out_bytes, metrics = await asyncio.to_thread(
            pdf_engine.resize_photo_or_signature,
            raw_bytes,
            width_px,
            height_px,
            dpi,
            max_kb,
            output_format,
            enhance_background,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ext = ".png" if output_format.upper() == "PNG" else ".jpg"
    mime = "image/png" if ext == ".png" else "image/jpeg"
    out_name = f"resized_{width_px}x{height_px}{ext}"

    expires_at = None
    if actor.is_guest:
        sess = await db.get(UserSession, actor.guest_session_id)
        expires_at = (
            sess.expires_at
            if sess
            else datetime.now(UTC) + timedelta(minutes=settings.guest_session_expire_minutes)
        )

    sha = hashlib.sha256(out_bytes).hexdigest()
    doc = Document(
        owner_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        name=out_name,
        mime_type=mime,
        size_bytes=len(out_bytes),
        sha256=sha,
        current_version_no=1,
        status="ready",
        expires_at=expires_at,
    )
    db.add(doc)
    await db.flush()

    ver_id = str(uuid.uuid4())
    key = f"documents/{doc.id}/v1_{ver_id}{ext}"
    await get_storage().put_bytes(key, out_bytes, mime)
    db.add(
        DocumentVersion(
            id=ver_id,
            document_id=doc.id,
            version_no=1,
            storage_key=key,
            mime_type=mime,
            size_bytes=len(out_bytes),
            sha256=sha,
            created_by=actor.user_id,
        )
    )
    await record_audit_log(
        db,
        action="tool.image_resize",
        resource_type="document",
        resource_id=doc.id,
        actor_user_id=actor.user_id,
        actor_guest_session_id=actor.guest_session_id,
        metadata=metrics,
    )
    await db.commit()

    return ok_response(
        {
            "document_id": doc.id,
            "name": doc.name,
            "download_url": f"/api/v1/documents/{doc.id}/download",
            "preview_url": f"/api/v1/documents/{doc.id}/preview",
            "metrics": metrics,
        }
    )


@router.post("/scan", status_code=status.HTTP_201_CREATED)
async def camera_scan_to_pdf(
    files: list[UploadFile] = File(...),
    enhance_mode: str = Form(default="document"),
    output_name: str = Form(default="scanned_notes.pdf"),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Convert one or more camera/gallery photos into an enhanced multi-page PDF."""
    if not files or len(files) > 30:
        raise HTTPException(status_code=400, detail="Provide between 1 and 30 images.")

    settings = get_settings()
    img_bytes_list: list[bytes] = []
    for f in files:
        raw = await f.read()
        try:
            validated = validate_upload_bytes(
                f.filename or "scan.jpg", raw, settings.max_upload_bytes
            )
            if validated.extension not in (".png", ".jpg", ".jpeg"):
                raise ValueError("Camera scan only accepts PNG/JPG/JPEG images.")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        av = await scan_bytes_for_malware(raw)
        if not av.clean:
            raise HTTPException(status_code=422, detail=f"Blocked by malware scanner: {av.detail}")
        img_bytes_list.append(raw)

    try:
        pdf_bytes, metrics = await asyncio.to_thread(
            pdf_engine.images_to_scanned_pdf, img_bytes_list, enhance_mode
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    safe_out = output_name.strip() or "scanned_notes.pdf"
    if not safe_out.lower().endswith(".pdf"):
        safe_out = f"{safe_out}.pdf"

    expires_at = None
    if actor.is_guest:
        sess = await db.get(UserSession, actor.guest_session_id)
        expires_at = (
            sess.expires_at
            if sess
            else datetime.now(UTC) + timedelta(minutes=settings.guest_session_expire_minutes)
        )

    sha = hashlib.sha256(pdf_bytes).hexdigest()
    doc = Document(
        owner_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        name=safe_out,
        mime_type="application/pdf",
        size_bytes=len(pdf_bytes),
        sha256=sha,
        current_version_no=1,
        status="ready",
        expires_at=expires_at,
    )
    db.add(doc)
    await db.flush()

    ver_id = str(uuid.uuid4())
    key = f"documents/{doc.id}/v1_{ver_id}.pdf"
    await get_storage().put_bytes(key, pdf_bytes, "application/pdf")
    ver = DocumentVersion(
        id=ver_id,
        document_id=doc.id,
        version_no=1,
        storage_key=key,
        mime_type="application/pdf",
        size_bytes=len(pdf_bytes),
        sha256=sha,
        created_by=actor.user_id,
    )
    db.add(ver)
    await db.flush()
    await populate_pdf_version_assets(db, ver, pdf_bytes)

    await record_audit_log(
        db,
        action="tool.scan_to_pdf",
        resource_type="document",
        resource_id=doc.id,
        actor_user_id=actor.user_id,
        actor_guest_session_id=actor.guest_session_id,
        metadata=json.loads(json.dumps(metrics)),
    )
    await db.commit()

    return ok_response(
        {
            "document_id": doc.id,
            "name": doc.name,
            "page_count": ver.page_count,
            "size_bytes": doc.size_bytes,
            "download_url": f"/api/v1/documents/{doc.id}/download",
            "metrics": metrics,
        }
    )


@router.get("/convert/supported")
async def get_supported_conversions() -> dict:
    """Return the supported format conversion matrix (Phase 3)."""
    return ok_response(
        {
            "matrix": converter.SUPPORTED_CONVERSION_MATRIX,
            "mime_types": converter.MIME_BY_FORMAT,
        }
    )


@router.post("/convert", status_code=status.HTTP_202_ACCEPTED)
async def convert_document_tool(
    payload: ConvertRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Convert DOCX / XLSX / PPTX / Markdown <-> PDF asynchronously via ConversionJob."""
    doc = await get_owned_document(db, payload.document_id, actor)
    ver = await _get_latest_version(db, doc)
    src_fmt = converter.infer_source_format(doc.name, ver.mime_type)
    allowed = converter.SUPPORTED_CONVERSION_MATRIX.get(src_fmt, [])
    if payload.target_format not in allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot convert '{src_fmt.upper()}' to '{payload.target_format.upper()}'. "
                f"Supported targets: {', '.join(t.upper() for t in allowed) or 'none'}."
            ),
        )

    job = await _enqueue_pdf_job(
        db=db,
        actor=actor,
        source_version=ver,
        job_type="convert",
        params={
            "source_format": src_fmt,
            "target_format": payload.target_format,
            "mode": payload.mode,
            "pptx_mode": payload.pptx_mode,
            "output_name": payload.output_name,
        },
        idempotency_key=idempotency_key,
    )
    return ok_response(_job_to_out(job))


@router.post("/ocr", status_code=status.HTTP_202_ACCEPTED)
async def run_ocr_tool(
    payload: OcrRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Run OCR (English / Tamil) on a PDF or image to produce a searchable PDF."""
    doc = await get_owned_document(db, payload.document_id, actor)
    if doc.mime_type != "application/pdf" and not doc.mime_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="OCR requires a PDF or image (PNG/JPG) document.",
        )
    ver = await _get_latest_version(db, doc)
    job = await _enqueue_pdf_job(
        db=db,
        actor=actor,
        source_version=ver,
        job_type="ocr",
        params={
            "language": payload.language,
            "force_ocr": payload.force_ocr,
            "output_name": payload.output_name,
        },
        idempotency_key=idempotency_key,
    )
    return ok_response(_job_to_out(job))


@router.post("/extract-tables")
async def extract_tables_tool(
    payload: ExtractTablesRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Extract structured tables from PDF either inline as JSON or asynchronously as XLSX/CSV."""
    doc = await get_owned_document(db, payload.document_id, actor)
    if doc.mime_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Table extraction supports PDF documents.")
    ver = await _get_latest_version(db, doc)

    if payload.output_format == "json":
        raw_bytes = await get_storage().get_bytes(ver.storage_key)
        tables = await asyncio.to_thread(conversion_engine.extract_tables_from_pdf, raw_bytes)
        return ok_response(
            {
                "document_id": doc.id,
                "document_name": doc.name,
                "tables_count": len(tables),
                "tables": [
                    {
                        "page_no": t["page"],
                        "table_index": t["table_index"],
                        "detection_strategy": t["strategy"],
                        "rows_count": t["rows_count"],
                        "cols_count": t["cols_count"],
                        "rows": t["rows"],
                    }
                    for t in tables
                ],
            }
        )

    job = await _enqueue_pdf_job(
        db=db,
        actor=actor,
        source_version=ver,
        job_type="extract_tables",
        params={
            "output_format": payload.output_format,
            "output_name": payload.output_name,
        },
        idempotency_key=idempotency_key,
    )
    return ok_response(_job_to_out(job))
