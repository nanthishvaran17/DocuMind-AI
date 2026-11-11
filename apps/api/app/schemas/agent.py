from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class AgentCommandRequest(BaseModel):
    command: str = Field(min_length=2, max_length=2000)
    document_id: str | None = None
    document_ids: list[str] | None = None
    auto_approve_readonly: bool = False


class AgentPlanStepOut(BaseModel):
    id: str | None = None
    step_no: int
    tool_name: str
    description: str
    params: dict[str, Any]
    requires_approval: bool
    approval_status: Literal["pending", "approved", "rejected", "skipped"] = "pending"
    execution_status: Literal["pending", "running", "completed", "failed", "skipped"] = "pending"
    job_id: str | None = None
    output_document_id: str | None = None
    output_version_id: str | None = None
    output_preview: str | None = None
    error: str | None = None
    started_at: str | None = None
    completed_at: str | None = None


class AgentExecutionLogEntryOut(BaseModel):
    timestamp: str
    step_no: int | None = None
    event: str
    message: str
    meta: dict[str, Any] = Field(default_factory=dict)


class AgentCommandResponse(BaseModel):
    run_id: str
    command_text: str
    status: Literal[
        "planning",
        "awaiting_approval",
        "running",
        "completed",
        "failed",
        "cancelled",
        "unsupported",
    ]
    steps: list[AgentPlanStepOut]
    summary: str
    current_step_no: int = 0
    document_ids: list[str] = Field(default_factory=list)
    execution_log: list[AgentExecutionLogEntryOut] = Field(default_factory=list)
    output_document_id: str | None = None
    job_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AgentApproveRequest(BaseModel):
    approve: bool = True
    mode: Literal["all", "next_step"] = "all"
    step_approvals: dict[int, bool] | None = None
    step_overrides: dict[int, dict[str, Any]] | None = None
