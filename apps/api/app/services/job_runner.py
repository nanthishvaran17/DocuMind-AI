from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import uuid
import zipfile
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.db.models import (
    ConversionJob,
    ConversionQualityReport,
    Document,
    DocumentMetadata,
    DocumentOperation,
    DocumentPage,
    DocumentVersion,
)
from app.db.session import AsyncSessionLocal
from app.services.audit import record_audit_log
from app.services.storage import get_storage
from sqlalchemy.ext.asyncio import AsyncSession
from worker import converter, ocr_engine, pdf_engine, quality_verifier

logger = logging.getLogger(__name__)


class JobProgressBus:
    """In-process pub/sub for SSE job progress events (Redis pubsub ready for multi-worker)."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[dict[str, Any]]]] = defaultdict(list)

    def subscribe(self, job_id: str) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers[job_id].append(q)
        return q

    def unsubscribe(self, job_id: str, q: asyncio.Queue[dict[str, Any]]) -> None:
        if job_id in self._subscribers and q in self._subscribers[job_id]:
            self._subscribers[job_id].remove(q)

    async def publish(self, job_id: str, payload: dict[str, Any]) -> None:
        for q in list(self._subscribers.get(job_id, [])):
            await q.put(payload)


progress_bus = JobProgressBus()


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


async def populate_pdf_version_assets(
    db: AsyncSession,
    version: DocumentVersion,
    pdf_bytes: bytes,
) -> tuple[int, bool]:
    """Inspect PDF pages and store PNG thumbnails + metadata for a DocumentVersion."""
    settings = get_settings()
    storage = get_storage()
    inspection = await asyncio.to_thread(pdf_engine.inspect_pdf, pdf_bytes, settings.max_pdf_pages)

    meta = DocumentMetadata(
        version_id=version.id,
        title=inspection.metadata.get("title"),
        author=inspection.metadata.get("author"),
        subject=inspection.metadata.get("subject"),
        is_encrypted=inspection.is_encrypted,
        raw_info=inspection.metadata,
    )
    db.add(meta)

    if inspection.is_encrypted:
        version.page_count = None
        return 0, True

    version.page_count = inspection.page_count
    thumbs = await asyncio.to_thread(pdf_engine.render_page_thumbnails, pdf_bytes, 50, 260)
    thumb_map = dict(thumbs)

    for p in inspection.pages:
        thumb_key: str | None = None
        if p.page_no in thumb_map:
            thumb_key = f"thumbnails/{version.document_id}/{version.id}/page_{p.page_no}.png"
            await storage.put_bytes(thumb_key, thumb_map[p.page_no], "image/png")

        db.add(
            DocumentPage(
                version_id=version.id,
                page_no=p.page_no,
                width=p.width,
                height=p.height,
                rotation=p.rotation,
                thumbnail_key=thumb_key,
            )
        )
    return inspection.page_count, False


async def _update_job_progress(
    db: AsyncSession,
    job: ConversionJob,
    *,
    status: str,
    progress: int,
    stage: str,
) -> None:
    job.status = status
    job.progress = progress
    job.stage_message = stage
    if status == "running" and job.started_at is None:
        job.started_at = datetime.now(UTC)
    if status in ("completed", "failed", "cancelled"):
        job.completed_at = datetime.now(UTC)
    await db.commit()
    await progress_bus.publish(
        job.id,
        {
            "job_id": job.id,
            "status": job.status,
            "progress": job.progress,
            "stage_message": job.stage_message,
            "output_document_id": job.output_document_id,
            "output_version_id": job.output_version_id,
            "result_meta": job.result_meta,
            "error_detail": job.error_detail,
        },
    )


async def dispatch_job(job_id: str) -> None:
    settings = get_settings()
    if settings.task_runner == "celery":
        from worker.tasks import run_pdf_job  # noqa: PLC0415

        run_pdf_job.delay(job_id)
    else:
        asyncio.create_task(execute_job_by_id(job_id))


async def _run_job_step(
    db: AsyncSession,
    job_type: str,
    raw_bytes: bytes,
    params: dict[str, Any],
    src_doc: Document,
    src_mime_type: str,
) -> tuple[bytes, str, bool, str, dict[str, Any]]:
    """Execute one PDF or converter step and return (bytes, mime, create_new_doc, name, meta)."""
    result_meta: dict[str, Any] = {}
    out_bytes: bytes = b""
    out_mime = "application/pdf"
    create_new_doc = False
    new_doc_name = src_doc.name

    if job_type == "compress":
        out_bytes, result_meta = await asyncio.to_thread(
            pdf_engine.compress_pdf,
            raw_bytes,
            preset=str(params.get("preset", "medium")),
            target_kb=params.get("target_kb"),
        )
    elif job_type == "rotate":
        out_bytes = await asyncio.to_thread(
            pdf_engine.rotate_pdf,
            raw_bytes,
            int(params["angle"]),
            params.get("pages"),
        )
        result_meta = {"angle": params["angle"], "pages": params.get("pages")}
    elif job_type in ("reorder", "delete_pages", "extract_pages"):
        ordered = [int(p) for p in params["pages"]]
        out_bytes = await asyncio.to_thread(
            pdf_engine.select_or_reorder_pages, raw_bytes, ordered
        )
        create_new_doc = job_type == "extract_pages"
        if create_new_doc:
            stem = Path(src_doc.name).stem
            new_doc_name = f"{stem}_extracted.pdf"
        result_meta = {"pages": ordered}
    elif job_type == "watermark":
        out_bytes = await asyncio.to_thread(
            pdf_engine.add_watermark,
            raw_bytes,
            str(params["text"]),
            float(params.get("opacity", 0.22)),
            int(params.get("angle", 45)),
            int(params.get("font_size", 40)),
        )
        result_meta = {"text": params["text"]}
    elif job_type == "page_numbers":
        out_bytes = await asyncio.to_thread(
            pdf_engine.add_page_numbers,
            raw_bytes,
            str(params.get("position", "bottom-center")),
            str(params.get("template", "Page {n} of {total}")),
            int(params.get("start_no", 1)),
        )
        result_meta = {"position": params.get("position", "bottom-center")}
    elif job_type == "protect":
        out_bytes = await asyncio.to_thread(
            pdf_engine.protect_pdf,
            raw_bytes,
            str(params["password"]),
            params.get("owner_password"),
        )
        result_meta = {"encrypted": True}
    elif job_type == "unlock":
        out_bytes = await asyncio.to_thread(
            pdf_engine.unlock_pdf,
            raw_bytes,
            str(params["password"]),
        )
        result_meta = {"unlocked": True}
    elif job_type == "merge":
        storage = get_storage()
        version_ids: list[str] = list(params["version_ids"])
        page_specs: list[list[int] | None] = params.get("page_specs") or [None] * len(version_ids)
        merge_inputs: list[tuple[bytes, list[int] | None]] = []
        for vid, pspec in zip(version_ids, page_specs, strict=False):
            ver = await db.get(DocumentVersion, vid)
            if not ver:
                raise ValueError(f"Version {vid} not found for merge.")
            vbytes = await storage.get_bytes(ver.storage_key)
            merge_inputs.append((vbytes, pspec))
        out_bytes = await asyncio.to_thread(pdf_engine.merge_pdfs, merge_inputs)
        create_new_doc = True
        new_doc_name = str(params.get("output_name") or "merged_document.pdf")
        result_meta = {"merged_count": len(merge_inputs)}
    elif job_type == "split":
        groups: list[list[int]] = params["groups"]
        parts = await asyncio.to_thread(pdf_engine.split_pdf, raw_bytes, groups)
        if len(parts) == 1:
            out_bytes = parts[0]
            create_new_doc = True
            new_doc_name = f"{Path(src_doc.name).stem}_split.pdf"
        else:
            zip_buf = io.BytesIO()
            with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
                stem = Path(src_doc.name).stem
                for idx, part_bytes in enumerate(parts, start=1):
                    zf.writestr(f"{stem}_part_{idx}.pdf", part_bytes)
            out_bytes = zip_buf.getvalue()
            out_mime = "application/zip"
            create_new_doc = True
            new_doc_name = f"{Path(src_doc.name).stem}_split_parts.zip"
        result_meta = {"parts_count": len(parts)}
    elif job_type == "convert":
        src_fmt = converter.infer_source_format(src_doc.name, src_mime_type)
        target_fmt = str(params["target_format"]).lower()
        out_bytes, out_ext, out_mime, conv_meta = await asyncio.to_thread(
            converter.convert_document_bytes,
            raw_bytes,
            src_fmt,
            target_fmt,
            params,
        )
        create_new_doc = True
        custom_name = params.get("output_name")
        if custom_name:
            safe_stem = Path(str(custom_name).strip()).stem or Path(src_doc.name).stem
        else:
            safe_stem = Path(src_doc.name).stem
        new_doc_name = f"{safe_stem}{out_ext}"
        result_meta = conv_meta
    elif job_type == "ocr":
        is_pdf = src_mime_type == "application/pdf"
        lang = str(params.get("language") or "eng")
        force_ocr = bool(params.get("force_ocr", False))
        ocr_res = await asyncio.to_thread(
            ocr_engine.run_ocr,
            raw_bytes,
            is_pdf=is_pdf,
            language=lang,
            force_ocr=force_ocr,
        )
        out_bytes = ocr_res.searchable_pdf_bytes
        out_mime = "application/pdf"
        create_new_doc = True
        custom_name = params.get("output_name")
        safe_stem = (
            Path(str(custom_name).strip()).stem
            if custom_name
            else f"{Path(src_doc.name).stem}_ocr"
        )
        new_doc_name = f"{safe_stem}.pdf"
        result_meta = {
            "pages_processed": ocr_res.pages_processed,
            "pages_ocr_applied": ocr_res.pages_ocr_applied,
            "engine_used": ocr_res.engine_used,
            "language": ocr_res.language,
            "mean_confidence": ocr_res.mean_confidence,
            "warnings": ocr_res.warnings,
            "extracted_text_preview": ocr_res.extracted_text[:4000],
            "extracted_char_count": len(ocr_res.extracted_text),
        }
    elif job_type == "extract_tables":
        if src_mime_type != "application/pdf":
            raise ValueError("Table extraction requires a PDF source document.")
        target_fmt = str(params.get("output_format") or "xlsx").lower()
        if target_fmt not in ("xlsx", "csv", "json"):
            target_fmt = "xlsx"
        out_bytes, out_ext, out_mime, conv_meta = await asyncio.to_thread(
            converter.convert_document_bytes,
            raw_bytes,
            "pdf",
            target_fmt,
            {"mode": "editable"},
        )
        create_new_doc = True
        custom_name = params.get("output_name")
        safe_stem = (
            Path(str(custom_name).strip()).stem
            if custom_name
            else f"{Path(src_doc.name).stem}_tables"
        )
        new_doc_name = f"{safe_stem}{out_ext}"
        result_meta = conv_meta
    else:
        raise ValueError(f"Unsupported job_type '{job_type}'.")

    return out_bytes, out_mime, create_new_doc, new_doc_name, result_meta


async def _persist_step_output(
    db: AsyncSession,
    *,
    src_doc: Document,
    create_new_doc: bool,
    new_doc_name: str,
    out_bytes: bytes,
    out_mime: str,
    job_type: str,
    params: dict[str, Any],
    job: ConversionJob,
    result_meta: dict[str, Any],
) -> tuple[Document, DocumentVersion]:
    storage = get_storage()
    out_sha = _sha256(out_bytes)
    if create_new_doc:
        target_doc = Document(
            owner_id=src_doc.owner_id,
            guest_session_id=src_doc.guest_session_id,
            folder_id=src_doc.folder_id,
            name=new_doc_name,
            mime_type=out_mime,
            size_bytes=len(out_bytes),
            sha256=out_sha,
            current_version_no=1,
            status="ready",
            expires_at=src_doc.expires_at,
        )
        db.add(target_doc)
        await db.flush()
        new_ver_no = 1
    else:
        target_doc = src_doc
        new_ver_no = target_doc.current_version_no + 1
        target_doc.current_version_no = new_ver_no
        target_doc.size_bytes = len(out_bytes)
        target_doc.sha256 = out_sha

    op = DocumentOperation(
        document_id=target_doc.id,
        actor_id=job.user_id,
        operation_type=job_type,
        params={k: v for k, v in params.items() if "password" not in k.lower()},
        status="completed",
        undoable=not create_new_doc,
    )
    db.add(op)
    await db.flush()

    ext_by_mime = {
        "application/pdf": ".pdf",
        "application/zip": ".zip",
        "text/markdown": ".md",
        "text/plain": ".txt",
        "text/html": ".html",
        "text/csv": ".csv",
        "application/json": ".json",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    }
    ext = ext_by_mime.get(out_mime, Path(new_doc_name).suffix.lower() or ".bin")
    ver_id = str(uuid.uuid4())
    storage_key = f"documents/{target_doc.id}/v{new_ver_no}_{ver_id}{ext}"
    await storage.put_bytes(storage_key, out_bytes, out_mime)

    new_ver = DocumentVersion(
        id=ver_id,
        document_id=target_doc.id,
        version_no=new_ver_no,
        storage_key=storage_key,
        mime_type=out_mime,
        size_bytes=len(out_bytes),
        sha256=out_sha,
        created_by=job.user_id,
        operation_id=op.id,
    )
    db.add(new_ver)
    await db.flush()

    if out_mime == "application/pdf":
        await populate_pdf_version_assets(db, new_ver, out_bytes)

    if out_mime != "application/zip" and not out_mime.startswith("image/"):
        try:
            from app.services.rag import index_document_version

            await index_document_version(
                db,
                document_id=target_doc.id,
                version_id=new_ver.id,
                raw_bytes=out_bytes,
                mime_type=out_mime,
                filename=target_doc.name,
                force=True,
            )
        except Exception:
            logger.warning("RAG indexing skipped for job %s output", job.id)

    await record_audit_log(
        db,
        action=f"document.{job_type}",
        resource_type="document",
        resource_id=target_doc.id,
        actor_user_id=job.user_id,
        actor_guest_session_id=job.guest_session_id,
        metadata={"job_id": job.id, "version_no": new_ver_no, **result_meta},
    )
    return target_doc, new_ver


async def execute_job_by_id(job_id: str) -> None:
    storage = get_storage()
    async with AsyncSessionLocal() as db:
        job = await db.get(ConversionJob, job_id)
        if not job or job.status == "cancelled":
            return

        src_version = await db.get(DocumentVersion, job.source_version_id)
        if not src_version:
            job.error_detail = {"message": "Source document version not found."}
            await _update_job_progress(
                db, job, status="failed", progress=100, stage="Source missing"
            )
            return

        src_doc = await db.get(Document, src_version.document_id)
        if not src_doc:
            job.error_detail = {"message": "Source document not found."}
            await _update_job_progress(
                db, job, status="failed", progress=100, stage="Document missing"
            )
            return

        try:
            await _update_job_progress(
                db, job, status="running", progress=15, stage="Loading source document"
            )
            raw_bytes = await storage.get_bytes(src_version.storage_key)

            params = job.params or {}
            job_type = job.job_type

            if job_type == "pipeline":
                steps = list(params.get("steps") or [])
                if not steps:
                    raise ValueError("Pipeline job has no steps.")
                current_bytes = raw_bytes
                current_doc = src_doc
                current_mime = src_version.mime_type
                last_ver = src_version
                combined_meta: list[dict[str, Any]] = []
                total_steps = len(steps)

                for idx, step in enumerate(steps, start=1):
                    step_type = str(step["job_type"])
                    step_params = dict(step.get("params") or {})
                    pct = 15 + int((idx - 0.5) / total_steps * 70)
                    await _update_job_progress(
                        db,
                        job,
                        status="running",
                        progress=pct,
                        stage=f"Step {idx}/{total_steps}: {step_type.replace('_', ' ')}",
                    )
                    (
                        out_bytes,
                        out_mime,
                        create_new_doc,
                        new_doc_name,
                        step_meta,
                    ) = await _run_job_step(
                        db, step_type, current_bytes, step_params, current_doc, current_mime
                    )
                    target_doc, new_ver = await _persist_step_output(
                        db,
                        src_doc=current_doc,
                        create_new_doc=create_new_doc,
                        new_doc_name=new_doc_name,
                        out_bytes=out_bytes,
                        out_mime=out_mime,
                        job_type=step_type,
                        params=step_params,
                        job=job,
                        result_meta=step_meta,
                    )
                    current_bytes = out_bytes
                    current_doc = target_doc
                    current_mime = out_mime
                    last_ver = new_ver
                    combined_meta.append({"step": idx, "job_type": step_type, **step_meta})

                job.output_document_id = current_doc.id
                job.output_version_id = last_ver.id
                job.result_meta = {"steps_executed": total_steps, "steps": combined_meta}
            else:
                await _update_job_progress(
                    db,
                    job,
                    status="running",
                    progress=45,
                    stage=f"Running {job_type.replace('_', ' ')}",
                )
                (
                    out_bytes,
                    out_mime,
                    create_new_doc,
                    new_doc_name,
                    result_meta,
                ) = await _run_job_step(
                    db, job_type, raw_bytes, params, src_doc, src_version.mime_type
                )

                await _update_job_progress(
                    db, job, status="running", progress=80, stage="Saving immutable output version"
                )
                target_doc, new_ver = await _persist_step_output(
                    db,
                    src_doc=src_doc,
                    create_new_doc=create_new_doc,
                    new_doc_name=new_doc_name,
                    out_bytes=out_bytes,
                    out_mime=out_mime,
                    job_type=job_type,
                    params=params,
                    job=job,
                    result_meta=result_meta,
                )
                job.output_document_id = target_doc.id
                job.output_version_id = new_ver.id

                if job_type == "convert" and out_mime != "application/zip":
                    src_fmt = converter.infer_source_format(src_doc.name, src_version.mime_type)
                    tgt_fmt = str(params.get("target_format") or "").lower()
                    conv_mode = str(
                        params.get("mode") or params.get("conversion_mode") or "editable"
                    )
                    if tgt_fmt not in ("png", "jpg", "jpeg"):
                        try:
                            await _update_job_progress(
                                db,
                                job,
                                status="running",
                                progress=92,
                                stage="Verifying conversion fidelity & metrics",
                            )
                            qres = await asyncio.to_thread(
                                quality_verifier.verify_conversion_quality,
                                source_bytes=raw_bytes,
                                source_ext=src_fmt,
                                target_bytes=out_bytes,
                                target_format=tgt_fmt,
                                artifact_warnings=list(result_meta.get("warnings") or []),
                                font_warnings=list(result_meta.get("font_warnings") or []),
                            )
                            storage = get_storage()
                            image_keys: dict[str, str] = {}
                            for page_no, png_bytes in qres.source_page_pngs.items():
                                s_key = f"quality/{job.id}/page_{page_no}_source.png"
                                await storage.put_bytes(s_key, png_bytes, "image/png")
                                image_keys[f"{page_no}:source"] = s_key
                            for page_no, png_bytes in qres.converted_page_pngs.items():
                                c_key = f"quality/{job.id}/page_{page_no}_converted.png"
                                await storage.put_bytes(c_key, png_bytes, "image/png")
                                image_keys[f"{page_no}:converted"] = c_key

                            report = ConversionQualityReport(
                                job_id=job.id,
                                source_version_id=src_version.id,
                                output_version_id=new_ver.id,
                                source_format=src_fmt,
                                target_format=tgt_fmt,
                                conversion_mode=conv_mode,
                                source_page_count=qres.source_page_count,
                                converted_page_count=qres.converted_page_count or 0,
                                page_count_match=bool(
                                    qres.page_count_match
                                    if qres.page_count_match is not None
                                    else False
                                ),
                                char_similarity=qres.char_similarity,
                                word_similarity=qres.word_similarity,
                                mean_ssim=qres.mean_ssim,
                                ssim_status=qres.ssim_status,
                                source_table_count=qres.source_table_count,
                                converted_table_count=qres.converted_table_count or 0,
                                source_image_count=qres.source_image_count,
                                converted_image_count=qres.converted_image_count or 0,
                                missing_text_snippets=qres.missing_text_snippets,
                                font_warnings=qres.font_warnings,
                                warnings=qres.warnings,
                                page_metrics=qres.page_metrics,
                                page_image_keys=image_keys,
                            )
                            db.add(report)
                            await db.flush()
                            result_meta = {
                                **result_meta,
                                "quality_report_id": report.id,
                                "char_similarity": qres.char_similarity,
                                "word_similarity": qres.word_similarity,
                                "mean_ssim": qres.mean_ssim,
                                "ssim_status": qres.ssim_status,
                            }
                        except Exception:
                            logger.warning(
                                "Conversion quality verification skipped for job %s",
                                job_id,
                                exc_info=True,
                            )

                job.result_meta = result_meta

            await _update_job_progress(db, job, status="completed", progress=100, stage="Completed")
        except Exception as exc:
            logger.exception("Document job %s failed", job_id)
            job.error_detail = {"message": str(exc)}
            await _update_job_progress(
                db, job, status="failed", progress=100, stage=f"Failed: {str(exc)[:180]}"
            )
