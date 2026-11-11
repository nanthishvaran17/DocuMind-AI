from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ActorContext, get_current_actor, get_owned_document
from app.db.models import AgentRun, ConversionJob, DocumentVersion
from app.db.session import get_db
from app.schemas.agent import (
    AgentApproveRequest,
    AgentCommandRequest,
    AgentCommandResponse,
    AgentPlanStepOut,
)
from app.schemas.common import ok_response
from app.services.job_runner import dispatch_job, pdf_engine

router = APIRouter(prefix="/ai/agent", tags=["agent"])


def _parse_command_to_plan(command: str, total_pages: int) -> list[dict[str, Any]]:
    """
    Phase 1 deterministic command planner for the 'Tell me what you want' hero box.
    Full LLM-driven multi-tool agent lands in Phase 5; in Phase 1 this safely maps
    common PDF intents into executable tool steps with mandatory approval.
    """
    text = command.strip()
    lower = text.lower()
    steps: list[dict[str, Any]] = []

    # 1. Compress to target size (e.g., "compress to 200 kb" or "compress to 1 mb")
    kb_match = re.search(r"(?:compress|shrink|reduce).*?(\d+(?:\.\d+)?)\s*(kb|mb)", lower)
    if kb_match:
        val = float(kb_match.group(1))
        unit = kb_match.group(2)
        target_kb = int(val * 1024) if unit == "mb" else int(val)
        steps.append(
            {
                "step_no": 1,
                "tool_name": "compress_pdf",
                "description": f"Compress PDF to under {target_kb} KB (creates a new version).",
                "params": {"preset": "medium", "target_kb": max(10, target_kb)},
                "requires_approval": True,
            }
        )
    elif "compress" in lower or "smaller" in lower:
        steps.append(
            {
                "step_no": 1,
                "tool_name": "compress_pdf",
                "description": "Compress PDF using balanced medium preset (creates a new version).",
                "params": {"preset": "medium", "target_kb": None},
                "requires_approval": True,
            }
        )

    # 2. Rotate pages
    rot_match = re.search(r"rotate(?:\s+\w+)*?\s+(90|180|270)", lower)
    if rot_match:
        angle = int(rot_match.group(1))
        steps.append(
            {
                "step_no": len(steps) + 1,
                "tool_name": "rotate_pdf",
                "description": f"Rotate pages by {angle} degrees clockwise.",
                "params": {"angle": angle, "pages": None},
                "requires_approval": True,
            }
        )

    # 3. Remove / delete pages (e.g., "remove pages 3-5" or "delete page 2")
    del_match = re.search(r"(?:remove|delete)\s+pages?\s+([\d,\-\s]+)", lower)
    if del_match:
        spec = del_match.group(1).strip()
        to_delete = set(pdf_engine.parse_page_ranges(spec, total_pages))
        remaining = [p for p in range(1, total_pages + 1) if p not in to_delete]
        if not remaining:
            raise ValueError("Cannot delete all pages from the document.")
        steps.append(
            {
                "step_no": len(steps) + 1,
                "tool_name": "delete_pages",
                "description": f"Remove page(s) {spec} while keeping original version intact.",
                "params": {"pages": remaining},
                "requires_approval": True,
            }
        )

    # 4. Extract pages
    ext_match = re.search(r"extract\s+pages?\s+([\d,\-\s]+)", lower)
    if ext_match:
        spec = ext_match.group(1).strip()
        selected = pdf_engine.parse_page_ranges(spec, total_pages)
        steps.append(
            {
                "step_no": len(steps) + 1,
                "tool_name": "extract_pages",
                "description": f"Extract page(s) {spec} into a new PDF document.",
                "params": {"pages": selected},
                "requires_approval": True,
            }
        )

    # 5. Add page numbers
    if "page number" in lower or "number pages" in lower:
        steps.append(
            {
                "step_no": len(steps) + 1,
                "tool_name": "page_numbers",
                "description": "Add 'Page N of Total' numbering to the bottom center of each page.",
                "params": {
                    "position": "bottom-center",
                    "template": "Page {n} of {total}",
                    "start_no": 1,
                },
                "requires_approval": True,
            }
        )

    # 6. Watermark
    wm_match = re.search(
        r"watermark\s+(?:with\s+)?['\"]?([^'\"]+)['\"]?", text, flags=re.IGNORECASE
    )
    if wm_match:
        wm_text = wm_match.group(1).strip()[:80]
        steps.append(
            {
                "step_no": len(steps) + 1,
                "tool_name": "watermark",
                "description": f"Stamp diagonal watermark '{wm_text}' on every page.",
                "params": {"text": wm_text, "opacity": 0.22, "angle": 45, "font_size": 40},
                "requires_approval": True,
            }
        )

    return steps


@router.post("/command")
async def plan_agent_command(
    payload: AgentCommandRequest,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    doc_id = payload.document_id or (payload.document_ids[0] if payload.document_ids else None)
    if not doc_id:
        raise HTTPException(
            status_code=400,
            detail="Select or upload a PDF document first so I know which file to operate on.",
        )

    doc = await get_owned_document(db, doc_id, actor)
    ver = (
        await db.execute(
            select(DocumentVersion).where(
                DocumentVersion.document_id == doc.id,
                DocumentVersion.version_no == doc.current_version_no,
            )
        )
    ).scalar_one_or_none()
    if not ver:
        raise HTTPException(status_code=404, detail="Document version not found.")

    try:
        steps = _parse_command_to_plan(payload.command, ver.page_count or 1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not steps:
        run = AgentRun(
            user_id=actor.user_id,
            guest_session_id=actor.guest_session_id,
            command_text=payload.command,
            plan=[],
            status="failed",
            final_summary=(
                "In Phase 1, the command box supports: compress (e.g. 'compress to 200 kb'), "
                "rotate ('rotate 90'), delete/extract pages ('remove pages 2-3'), "
                "add page numbers, and watermark ('watermark CONFIDENTIAL'). "
                "AI chat, Word/Excel conversion, and report generation arrive in Phases 2-5."
            ),
        )
        db.add(run)
        await db.commit()
        return ok_response(
            AgentCommandResponse(
                run_id=run.id,
                command_text=payload.command,
                status="unsupported",
                steps=[],
                summary=run.final_summary or "",
            ).model_dump()
        )

    for s in steps:
        s["document_id"] = doc.id
        s["source_version_id"] = ver.id

    run = AgentRun(
        user_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        command_text=payload.command,
        plan=steps,
        status="awaiting_approval",
        final_summary=(
            f"Ready to apply {len(steps)} step(s) on '{doc.name}'. Please review and approve."
        ),
    )
    db.add(run)
    await db.commit()

    return ok_response(
        AgentCommandResponse(
            run_id=run.id,
            command_text=payload.command,
            status="awaiting_approval",
            steps=[
                AgentPlanStepOut(
                    **{k: v for k, v in s.items() if k in AgentPlanStepOut.model_fields}
                )
                for s in steps
            ],
            summary=run.final_summary or "",
        ).model_dump()
    )


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

    if run.status != "awaiting_approval":
        raise HTTPException(status_code=400, detail=f"Run is already '{run.status}'.")

    if not payload.approve:
        run.status = "cancelled"
        run.final_summary = "Action cancelled by user."
        await db.commit()
        return ok_response(
            AgentCommandResponse(
                run_id=run.id,
                command_text=run.command_text,
                status="failed",
                steps=[],
                summary=run.final_summary,
            ).model_dump()
        )

    # Execute first planned step (and chain sequentially in future phases)
    step = run.plan[0]
    tool_map = {
        "compress_pdf": "compress",
        "rotate_pdf": "rotate",
        "delete_pages": "delete_pages",
        "extract_pages": "extract_pages",
        "page_numbers": "page_numbers",
        "watermark": "watermark",
    }
    job_type = tool_map.get(step["tool_name"])
    if not job_type:
        raise HTTPException(status_code=400, detail="Unsupported planned tool.")

    job = ConversionJob(
        user_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        source_version_id=step["source_version_id"],
        job_type=job_type,
        params=step["params"],
        status="queued",
        progress=0,
        stage_message="Approved via command bar",
    )
    db.add(job)
    run.status = "completed"
    run.final_summary = f"Dispatched '{job_type}' job."
    await db.commit()
    await db.refresh(job)
    await dispatch_job(job.id)

    return ok_response(
        AgentCommandResponse(
            run_id=run.id,
            command_text=run.command_text,
            status="completed",
            steps=[],
            summary=run.final_summary,
            job_id=job.id,
        ).model_dump()
    )
