from __future__ import annotations

import asyncio
import json
from typing import Any

from app.api.deps import ActorContext, get_current_actor, get_owned_document
from app.db.models import AgentRun, DocumentVersion
from app.db.session import get_db
from app.schemas.agent import (
    AgentApproveRequest,
    AgentCommandRequest,
    AgentCommandResponse,
    AgentExecutionLogEntryOut,
    AgentPlanStepOut,
)
from app.schemas.common import ok_response
from app.services.agent_executor import (
    agent_progress_bus,
    create_job_for_step,
    execute_agent_workflow,
)
from app.services.agent_planner import ALLOWED_AGENT_TOOLS, plan_command_workflow
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from worker import converter

router = APIRouter(prefix="/ai/agent", tags=["agent"])


def _run_to_response(
    run: AgentRun,
    *,
    status_override: str | None = None,
    job_id: str | None = None,
    output_document_id: str | None = None,
) -> dict[str, Any]:
    steps_raw = list(run.plan or [])
    first_job_id = job_id
    latest_doc_id = output_document_id
    for s in steps_raw:
        if not first_job_id and s.get("job_id"):
            first_job_id = str(s["job_id"])
        if s.get("output_document_id"):
            latest_doc_id = str(s["output_document_id"])

    return AgentCommandResponse(
        run_id=run.id,
        command_text=run.command_text,
        status=status_override or run.status,  # type: ignore[arg-type]
        steps=[
            AgentPlanStepOut(
                **{k: v for k, v in s.items() if k in AgentPlanStepOut.model_fields}
            )
            for s in steps_raw
        ],
        summary=run.final_summary or "",
        current_step_no=run.current_step_no or 0,
        document_ids=list(run.document_ids or []),
        execution_log=[
            AgentExecutionLogEntryOut(**entry)
            for entry in (run.execution_log or [])
            if isinstance(entry, dict)
        ],
        output_document_id=latest_doc_id,
        job_id=first_job_id,
        created_at=run.created_at,
        updated_at=run.updated_at,
    ).model_dump()


@router.post("/command")
async def plan_agent_command(
    payload: AgentCommandRequest,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc_ids: list[str] = []
    if payload.document_id:
        doc_ids.append(payload.document_id)
    if payload.document_ids:
        for did in payload.document_ids:
            if did not in doc_ids:
                doc_ids.append(did)

    if not doc_ids:
        raise HTTPException(
            status_code=400,
            detail="Select or upload a document first so I know which file to operate on.",
        )

    primary_doc = await get_owned_document(db, doc_ids[0], actor)
    for extra_id in doc_ids[1:]:
        await get_owned_document(db, extra_id, actor)

    ver = (
        await db.execute(
            select(DocumentVersion).where(
                DocumentVersion.document_id == primary_doc.id,
                DocumentVersion.version_no == primary_doc.current_version_no,
            )
        )
    ).scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="Document version not found.")

    src_format = converter.infer_source_format(primary_doc.name, ver.mime_type)
    try:
        steps = await plan_command_workflow(
            payload.command,
            total_pages=ver.page_count or 1,
            doc_ids=doc_ids,
            source_format=src_format,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not steps:
        run = AgentRun(
            user_id=actor.user_id,
            guest_session_id=actor.guest_session_id,
            command_text=payload.command,
            document_ids=doc_ids,
            plan=[],
            status="failed",
            final_summary=(
                "Could not map that command into tool steps. Try e.g. "
                "'compress to 200 kb, add page numbers', "
                "'convert to docx', 'watermark CONFIDENTIAL', or 'summarize this document'."
            ),
        )
        db.add(run)
        await db.commit()
        return ok_response(_run_to_response(run, status_override="unsupported"))

    for s in steps:
        s["document_id"] = primary_doc.id
        s["source_version_id"] = ver.id
        if payload.auto_approve_readonly:
            tool_meta = ALLOWED_AGENT_TOOLS.get(s["tool_name"], {})
            if tool_meta.get("kind") == "ai":
                s["requires_approval"] = False
                s["approval_status"] = "approved"

    run = AgentRun(
        user_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        command_text=payload.command,
        document_ids=doc_ids,
        plan=steps,
        current_step_no=0,
        execution_log=[
            {
                "timestamp": primary_doc.updated_at.isoformat(),
                "step_no": None,
                "event": "plan_created",
                "message": f"Planned {len(steps)} chained step(s) for '{primary_doc.name}'.",
                "meta": {"doc_ids": doc_ids},
            }
        ],
        status="awaiting_approval",
        final_summary=(
            f"Planned {len(steps)} step(s) on '{primary_doc.name}'. "
            "Inspect parameters and approve all or step-by-step."
        ),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    return ok_response(_run_to_response(run))


@router.get("/runs")
async def list_agent_runs(
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    stmt = select(AgentRun)
    if actor.is_guest:
        stmt = stmt.where(AgentRun.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(AgentRun.user_id == actor.user_id)
    runs = list((await db.execute(stmt.order_by(desc(AgentRun.created_at)).limit(30))).scalars())
    return ok_response([_run_to_response(r) for r in runs])


@router.get("/runs/{run_id}")
async def get_agent_run(
    run_id: str,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    stmt = select(AgentRun).where(AgentRun.id == run_id)
    if actor.is_guest:
        stmt = stmt.where(AgentRun.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(AgentRun.user_id == actor.user_id)
    run = (await db.execute(stmt)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent run not found.")
    return ok_response(_run_to_response(run))


@router.get("/runs/{run_id}/events")
async def stream_agent_run_events(
    run_id: str,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    stmt = select(AgentRun).where(AgentRun.id == run_id)
    if actor.is_guest:
        stmt = stmt.where(AgentRun.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(AgentRun.user_id == actor.user_id)
    run = (await db.execute(stmt)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent run not found.")

    async def event_stream():
        queue = agent_progress_bus.subscribe(run_id)
        try:
            initial = {
                "run_id": run.id,
                "status": run.status,
                "current_step_no": run.current_step_no,
                "summary": run.final_summary,
                "steps": run.plan,
                "execution_log": run.execution_log,
            }
            yield f"data: {json.dumps(initial, default=str)}\n\n"
            if run.status in ("completed", "failed", "cancelled"):
                return

            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {json.dumps(msg, default=str)}\n\n"
                    if msg.get("status") in ("completed", "failed", "cancelled"):
                        break
                except TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            agent_progress_bus.unsubscribe(run_id, queue)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/runs/{run_id}/approve")
async def approve_agent_run(
    run_id: str,
    payload: AgentApproveRequest,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    stmt = select(AgentRun).where(AgentRun.id == run_id)
    if actor.is_guest:
        stmt = stmt.where(AgentRun.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(AgentRun.user_id == actor.user_id)
    run = (await db.execute(stmt)).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent run not found.")

    if run.status not in ("awaiting_approval", "running"):
        raise HTTPException(status_code=400, detail=f"Run is already '{run.status}'.")

    if not payload.approve:
        run.status = "cancelled"
        run.final_summary = "Action cancelled by user."
        await db.commit()
        return ok_response(_run_to_response(run, status_override="failed"))

    plan = [dict(s) for s in (run.plan or [])]
    if not plan:
        raise HTTPException(status_code=400, detail="Agent run has no executable steps.")

    # Apply granular step overrides & per-step approval/skip choices
    overrides = payload.step_overrides or {}
    step_approvals = payload.step_approvals or {}
    next_pending_assigned = False

    for idx, step in enumerate(plan):
        sno = int(step["step_no"])
        if step.get("execution_status") in ("completed", "skipped"):
            continue
        if sno in overrides and isinstance(overrides[sno], dict):
            merged_params = dict(step.get("params") or {})
            merged_params.update(overrides[sno])
            step["params"] = merged_params

        if sno in step_approvals:
            step["approval_status"] = "approved" if step_approvals[sno] else "skipped"
        elif payload.mode == "all":
            if step.get("approval_status") == "pending":
                step["approval_status"] = "approved"
        elif payload.mode == "next_step":
            if not next_pending_assigned and step.get("approval_status") == "pending":
                step["approval_status"] = "approved"
                next_pending_assigned = True
        plan[idx] = step

    run.plan = plan
    run.status = "running"

    # Pre-create ConversionJob for the first approved job-based pending step so callers
    # immediately receive a job_id (preserving Phase 1 contract & enabling direct job SSE).
    first_job_id: str | None = None
    doc_ids = list(run.document_ids or [])
    active_doc_id = doc_ids[0] if doc_ids else (plan[0].get("document_id"))
    active_ver_id = plan[0].get("source_version_id")
    for s in plan:
        if s.get("execution_status") == "completed" and s.get("output_document_id"):
            active_doc_id = s["output_document_id"]
            active_ver_id = s.get("output_version_id")

    for idx, s in enumerate(plan):
        if s.get("execution_status") == "pending" and s.get("approval_status") == "approved":
            tmeta = ALLOWED_AGENT_TOOLS.get(str(s["tool_name"]), {})
            if tmeta.get("kind") == "job" and active_doc_id and active_ver_id:
                job = await create_job_for_step(
                    db,
                    actor=actor,
                    step=s,
                    active_doc_id=str(active_doc_id),
                    active_ver_id=str(active_ver_id),
                    doc_ids=doc_ids,
                )
                first_job_id = job.id
                s["job_id"] = job.id
                plan[idx] = s
                run.plan = plan
            break

    run.final_summary = f"Executing {len(plan)} workflow step(s)..."
    await db.commit()
    await db.refresh(run)

    asyncio.create_task(
        execute_agent_workflow(
            run.id,
            actor=actor,
            mode=payload.mode,
            precreated_first_job_id=first_job_id,
        )
    )

    return ok_response(_run_to_response(run, job_id=first_job_id))
