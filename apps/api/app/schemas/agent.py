from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AgentCommandRequest(BaseModel):
    command: str = Field(min_length=2, max_length=1000)
    document_id: str | None = None
    document_ids: list[str] | None = None


class AgentPlanStepOut(BaseModel):
    step_no: int
    tool_name: str
    description: str
    params: dict[str, Any]
    requires_approval: bool


class AgentCommandResponse(BaseModel):
    run_id: str
    command_text: str
    status: Literal["awaiting_approval", "completed", "failed", "unsupported"]
    steps: list[AgentPlanStepOut]
    summary: str
    output_document_id: str | None = None
    job_id: str | None = None


class AgentApproveRequest(BaseModel):
    approve: bool = True
