from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ActorContext, get_current_actor
from app.db.models import ConversionJob
from app.db.session import get_db
from app.schemas.common import ok_response
from app.schemas.tools import JobOut
from app.services.job_runner import dispatch_job, progress_bus

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _job_dict(job: ConversionJob) -> dict:
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


async def _get_owned_job(db: AsyncSession, job_id: str, actor: ActorContext) -> ConversionJob:
    stmt = select(ConversionJob).where(ConversionJob.id == job_id)
    if actor.is_guest:
        stmt = stmt.where(ConversionJob.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(ConversionJob.user_id == actor.user_id)
    job = (await db.execute(stmt)).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return job


@router.get("")
async def list_jobs(
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    stmt = select(ConversionJob)
    if actor.is_guest:
        stmt = stmt.where(ConversionJob.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(ConversionJob.user_id == actor.user_id)
    rows = (
        (await db.execute(stmt.order_by(desc(ConversionJob.created_at)).limit(40))).scalars().all()
    )
    return ok_response([_job_dict(r) for r in rows])


@router.get("/{job_id}")
async def get_job(
    job_id: str,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    job = await _get_owned_job(db, job_id, actor)
    return ok_response(_job_dict(job))


@router.get("/{job_id}/events")
async def stream_job_events(
    job_id: str,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    job = await _get_owned_job(db, job_id, actor)

    async def event_stream() -> AsyncGenerator[str, None]:
        initial = {
            "job_id": job.id,
            "status": job.status,
            "progress": job.progress,
            "stage_message": job.stage_message,
            "output_document_id": job.output_document_id,
            "output_version_id": job.output_version_id,
            "result_meta": job.result_meta,
            "error_detail": job.error_detail,
        }
        yield f"data: {json.dumps(initial)}\n\n"
        if job.status in ("completed", "failed", "cancelled"):
            return

        q = progress_bus.subscribe(job.id)
        try:
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield f"data: {json.dumps(msg)}\n\n"
                    if msg.get("status") in ("completed", "failed", "cancelled"):
                        break
                except TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            progress_bus.unsubscribe(job.id, q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    job = await _get_owned_job(db, job_id, actor)
    if job.status in ("completed", "failed", "cancelled"):
        return ok_response(_job_dict(job))
    job.status = "cancelled"
    job.stage_message = "Cancelled by user"
    await db.commit()
    return ok_response(_job_dict(job))


@router.post("/{job_id}/retry")
async def retry_job(
    job_id: str,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    job = await _get_owned_job(db, job_id, actor)
    if job.status not in ("failed", "cancelled"):
        raise HTTPException(status_code=400, detail="Only failed or cancelled jobs can be retried.")
    job.status = "queued"
    job.progress = 0
    job.error_detail = None
    job.stage_message = "Re-queued"
    await db.commit()
    await dispatch_job(job.id)
    return ok_response(_job_dict(job))
