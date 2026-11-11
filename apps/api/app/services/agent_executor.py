from __future__ import annotations

import asyncio
import copy
import logging
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from app.api.deps import ActorContext
from app.db.models import AgentRun, ConversionJob, Document, DocumentVersion
from app.db.session import AsyncSessionLocal
from app.services.agent_planner import ALLOWED_AGENT_TOOLS
from app.services.audit import record_audit_log
from app.services.job_runner import execute_job_by_id
from app.services.rag import (
    answer_question_with_citations,
    semantic_search,
    summarize_document,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

logger = logging.getLogger(__name__)


class AgentProgressBus:
    """In-process pub/sub for live Phase 4 multi-step agent plan SSE updates."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[dict[str, Any]]]] = defaultdict(list)

    def subscribe(self, run_id: str) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers[run_id].append(q)
        return q

    def unsubscribe(self, run_id: str, q: asyncio.Queue[dict[str, Any]]) -> None:
        if run_id in self._subscribers and q in self._subscribers[run_id]:
            self._subscribers[run_id].remove(q)

    async def publish(self, run_id: str, payload: dict[str, Any]) -> None:
        for q in list(self._subscribers.get(run_id, [])):
            await q.put(payload)


agent_progress_bus = AgentProgressBus()


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _append_log(
    run: AgentRun,
    *,
    step_no: int | None,
    event: str,
    message: str,
    meta: dict[str, Any] | None = None,
) -> None:
    logs = list(run.execution_log or [])
    logs.append(
        {
            "timestamp": _now_iso(),
            "step_no": step_no,
            "event": event,
            "message": message,
            "meta": meta or {},
        }
    )
    run.execution_log = logs


async def _publish_run_state(run: AgentRun) -> None:
    await agent_progress_bus.publish(
        run.id,
        {
            "run_id": run.id,
            "status": run.status,
            "current_step_no": run.current_step_no,
            "summary": run.final_summary,
            "steps": run.plan,
            "execution_log": run.execution_log,
        },
    )


async def _get_latest_doc_and_version(
    db: AsyncSession, doc_id: str
) -> tuple[Document, DocumentVersion]:
    doc = await db.get(Document, doc_id)
    if not doc:
        raise ValueError(f"Document {doc_id} not found.")
    ver = (
        await db.execute(
            select(DocumentVersion).where(
                DocumentVersion.document_id == doc.id,
                DocumentVersion.version_no == doc.current_version_no,
            )
        )
    ).scalar_one_or_none()
    if not ver:
        raise ValueError(f"Current version for document {doc_id} not found.")
    return doc, ver


async def create_job_for_step(
    db: AsyncSession,
    *,
    actor: ActorContext,
    step: dict[str, Any],
    active_doc_id: str,
    active_ver_id: str,
    doc_ids: list[str],
) -> ConversionJob:
    """Create a ConversionJob row for a job-based agent plan step."""
    tool_name = str(step["tool_name"])
    tool_meta = ALLOWED_AGENT_TOOLS.get(tool_name)
    if not tool_meta or not tool_meta.get("job_type"):
        raise ValueError(f"Tool '{tool_name}' is not a job-based tool.")
    job_type = str(tool_meta["job_type"])
    params = dict(step.get("params") or {})

    if job_type == "merge":
        target_ids = list(params.get("document_ids") or doc_ids)
        version_ids: list[str] = []
        for did in target_ids:
            _, v = await _get_latest_doc_and_version(db, did)
            version_ids.append(v.id)
        if not version_ids:
            raise ValueError("No documents available for merge.")
        params["version_ids"] = version_ids
        active_ver_id = version_ids[0]
    elif job_type == "split" and "groups" not in params:
        _, ver = await _get_latest_doc_and_version(db, active_doc_id)
        total = ver.page_count or 1
        every_n = int(params.get("every_n") or 1)
        params["groups"] = [
            list(range(start, min(total, start + every_n - 1) + 1))
            for start in range(1, total + 1, every_n)
        ]

    job = ConversionJob(
        user_id=actor.user_id,
        guest_session_id=actor.guest_session_id,
        source_version_id=active_ver_id,
        job_type=job_type,
        params=params,
        status="queued",
        progress=0,
        stage_message=f"Agent step {step['step_no']}: {tool_name}",
    )
    db.add(job)
    await db.flush()
    return job


async def execute_agent_workflow(
    run_id: str,
    *,
    actor: ActorContext,
    mode: str = "all",
    precreated_first_job_id: str | None = None,
) -> None:
    """
    Execute approved steps in an AgentRun sequentially, chaining each step's
    output document/version into the subsequent step.
    """
    async with AsyncSessionLocal() as db:
        run = await db.get(AgentRun, run_id)
        if not run:
            return

        plan = [dict(s) for s in (run.plan or [])]
        doc_ids = list(run.document_ids or [])
        if not doc_ids and plan and plan[0].get("document_id"):
            doc_ids = [str(plan[0]["document_id"])]

        # Determine active document/version from the latest completed step or initial target
        active_doc_id: str | None = doc_ids[0] if doc_ids else None
        active_ver_id: str | None = None
        for prev in plan:
            if prev.get("execution_status") == "completed" and prev.get("output_document_id"):
                active_doc_id = str(prev["output_document_id"])
                active_ver_id = (
                    str(prev["output_version_id"]) if prev.get("output_version_id") else None
                )

        if active_doc_id and not active_ver_id:
            _, latest_v = await _get_latest_doc_and_version(db, active_doc_id)
            active_ver_id = latest_v.id

        run.status = "running"
        _append_log(
            run,
            step_no=None,
            event="workflow_started",
            message=f"Executing workflow ({mode} mode).",
        )
        await db.commit()
        await _publish_run_state(run)

        ran_any_in_step_mode = False
        first_precreated_used = False

        try:
            for idx, step in enumerate(plan):
                if step.get("execution_status") in ("completed", "skipped"):
                    continue

                if step.get("approval_status") in ("rejected", "skipped"):
                    step["execution_status"] = "skipped"
                    plan[idx] = dict(step)
                    run.plan = copy.deepcopy(plan)
                    flag_modified(run, "plan")
                    _append_log(
                        run,
                        step_no=step["step_no"],
                        event="step_skipped",
                        message=f"Skipped step {step['step_no']} ({step['tool_name']}).",
                    )
                    await db.commit()
                    await _publish_run_state(run)
                    continue

                if step.get("approval_status") != "approved":
                    # Pause waiting for granular approval of this step
                    run.status = "awaiting_approval"
                    run.final_summary = (
                        f"Paused before step {step['step_no']} ({step['tool_name']}). "
                        "Approve or skip to continue."
                    )
                    _append_log(
                        run,
                        step_no=step["step_no"],
                        event="awaiting_step_approval",
                        message=run.final_summary,
                    )
                    await db.commit()
                    await _publish_run_state(run)
                    return

                if mode == "next_step" and ran_any_in_step_mode:
                    run.status = "awaiting_approval"
                    run.final_summary = (
                        f"Completed step {run.current_step_no}. "
                        f"Review output before approving step {step['step_no']}."
                    )
                    _append_log(
                        run,
                        step_no=step["step_no"],
                        event="step_checkpoint",
                        message=run.final_summary,
                    )
                    await db.commit()
                    await _publish_run_state(run)
                    return

                step["execution_status"] = "running"
                step["started_at"] = _now_iso()
                run.current_step_no = int(step["step_no"])
                plan[idx] = dict(step)
                run.plan = copy.deepcopy(plan)
                flag_modified(run, "plan")
                _append_log(
                    run,
                    step_no=step["step_no"],
                    event="step_started",
                    message=f"Running step {step['step_no']}: {step['description']}",
                )
                await db.commit()
                await _publish_run_state(run)

                tool_name = str(step["tool_name"])
                tool_meta = ALLOWED_AGENT_TOOLS.get(tool_name)
                if not tool_meta:
                    raise ValueError(f"Unsupported agent tool '{tool_name}'.")

                if tool_meta["kind"] == "job":
                    if not active_doc_id or not active_ver_id:
                        raise ValueError("No target document available for step execution.")

                    if precreated_first_job_id and not first_precreated_used:
                        job_id = precreated_first_job_id
                        first_precreated_used = True
                    else:
                        job = await create_job_for_step(
                            db,
                            actor=actor,
                            step=step,
                            active_doc_id=active_doc_id,
                            active_ver_id=active_ver_id,
                            doc_ids=doc_ids,
                        )
                        job_id = job.id

                    step["job_id"] = job_id
                    plan[idx] = dict(step)
                    run.plan = copy.deepcopy(plan)
                    flag_modified(run, "plan")
                    await db.commit()

                    await execute_job_by_id(job_id)
                    finished_job = await db.get(ConversionJob, job_id, populate_existing=True)
                    if not finished_job or finished_job.status != "completed":
                        err_msg = (
                            (finished_job.error_detail or {}).get("message")
                            if finished_job
                            else "Job execution failed."
                        )
                        raise RuntimeError(str(err_msg or "Step job failed."))

                    step["output_document_id"] = finished_job.output_document_id
                    step["output_version_id"] = finished_job.output_version_id
                    step["output_preview"] = (
                        f"Produced version {finished_job.output_version_id[:8]}"
                        if finished_job.output_version_id
                        else "Job completed"
                    )
                    if finished_job.output_document_id:
                        active_doc_id = finished_job.output_document_id
                    if finished_job.output_version_id:
                        active_ver_id = finished_job.output_version_id

                else:
                    # Phase 2 AI / RAG intelligence step
                    target_scope = [active_doc_id] if active_doc_id else (doc_ids or None)
                    params = dict(step.get("params") or {})
                    if tool_name == "rag_qa":
                        qa = await answer_question_with_citations(
                            db,
                            actor=actor,
                            question=str(params.get("question") or run.command_text),
                            document_ids=target_scope,
                            top_k=int(params.get("top_k") or 5),
                        )
                        step["output_preview"] = qa["answer"][:600]
                        step["output_document_id"] = active_doc_id
                        step["output_version_id"] = active_ver_id
                    elif tool_name == "qa_summarize":
                        if not active_doc_id:
                            raise ValueError("Select a document to summarize.")
                        doc, ver = await _get_latest_doc_and_version(db, active_doc_id)
                        summ = await summarize_document(
                            db,
                            actor=actor,
                            doc=doc,
                            ver=ver,
                            focus=params.get("focus"),
                        )
                        step["output_preview"] = summ["summary"][:600]
                        step["output_document_id"] = doc.id
                        step["output_version_id"] = ver.id
                    elif tool_name == "semantic_search":
                        hits = await semantic_search(
                            db,
                            actor=actor,
                            query=str(params.get("query") or run.command_text),
                            document_ids=target_scope,
                            limit=int(params.get("limit") or 5),
                        )
                        step["output_preview"] = (
                            "\n".join(
                                f"- [{h['document_name']} p.{h.get('page_no') or '-'}] "
                                f"{h['snippet'][:140]}"
                                for h in hits
                            )
                            or "No matching passages found."
                        )
                        step["output_document_id"] = active_doc_id
                        step["output_version_id"] = active_ver_id

                step["execution_status"] = "completed"
                step["completed_at"] = _now_iso()
                plan[idx] = dict(step)
                run.plan = copy.deepcopy(plan)
                flag_modified(run, "plan")
                ran_any_in_step_mode = True
                _append_log(
                    run,
                    step_no=step["step_no"],
                    event="step_completed",
                    message=f"Completed step {step['step_no']} ({tool_name}).",
                    meta={
                        "output_document_id": step.get("output_document_id"),
                        "output_version_id": step.get("output_version_id"),
                    },
                )
                await db.commit()
                await _publish_run_state(run)

            completed_cnt = sum(1 for s in plan if s.get("execution_status") == "completed")
            skipped_cnt = sum(1 for s in plan if s.get("execution_status") == "skipped")
            run.status = "completed"
            run.final_summary = (
                f"Workflow completed: {completed_cnt} step(s) executed"
                + (f", {skipped_cnt} skipped." if skipped_cnt else ".")
            )
            _append_log(
                run,
                step_no=None,
                event="workflow_completed",
                message=run.final_summary,
                meta={"final_document_id": active_doc_id},
            )
            await record_audit_log(
                db,
                action="agent.workflow.completed",
                resource_type="agent_run",
                resource_id=run.id,
                actor_user_id=actor.user_id,
                actor_guest_session_id=actor.guest_session_id,
                metadata={"completed": completed_cnt, "skipped": skipped_cnt},
            )
            await db.commit()
            await _publish_run_state(run)

        except Exception as exc:
            logger.exception("Agent workflow %s failed", run_id)
            cur_no = run.current_step_no
            for idx, s in enumerate(plan):
                if s.get("step_no") == cur_no and s.get("execution_status") == "running":
                    s["execution_status"] = "failed"
                    s["error"] = str(exc)
                    s["completed_at"] = _now_iso()
                    plan[idx] = s
                    break
            run.plan = copy.deepcopy(plan)
            flag_modified(run, "plan")
            run.status = "failed"
            run.final_summary = f"Workflow failed at step {cur_no}: {exc}"
            _append_log(
                run,
                step_no=cur_no,
                event="workflow_failed",
                message=str(exc),
            )
            await db.commit()
            await _publish_run_state(run)
