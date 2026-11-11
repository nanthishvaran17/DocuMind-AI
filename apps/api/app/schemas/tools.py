from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class MergeItem(BaseModel):
    document_id: str
    pages: str | None = None  # e.g., "1-3,5"


class MergeRequest(BaseModel):
    items: list[MergeItem] = Field(min_length=2, max_length=25)
    output_name: str = Field(default="merged_document.pdf", min_length=1, max_length=255)


class SplitRequest(BaseModel):
    document_id: str
    mode: Literal["ranges", "every_n"] = "ranges"
    ranges: list[str] | None = None  # e.g. ["1-2", "3-5"]
    every_n: int | None = Field(default=None, ge=1, le=500)


class PageTransformRequest(BaseModel):
    document_id: str
    action: Literal["rotate", "reorder", "delete", "extract"]
    angle: Literal[90, 180, 270, -90] | None = None
    pages: list[int] | None = None  # 1-based page numbers


class WatermarkRequest(BaseModel):
    document_id: str
    text: str = Field(min_length=1, max_length=80)
    opacity: float = Field(default=0.22, ge=0.05, le=0.85)
    angle: int = Field(default=45, ge=-180, le=180)
    font_size: int = Field(default=40, ge=10, le=120)


class PageNumbersRequest(BaseModel):
    document_id: str
    position: Literal[
        "bottom-left",
        "bottom-center",
        "bottom-right",
        "top-left",
        "top-center",
        "top-right",
    ] = "bottom-center"
    template: str = Field(default="Page {n} of {total}", max_length=64)
    start_no: int = Field(default=1, ge=1, le=10000)


class ProtectRequest(BaseModel):
    document_id: str
    password: str = Field(min_length=1, max_length=128)
    owner_password: str | None = Field(default=None, max_length=128)


class UnlockRequest(BaseModel):
    document_id: str
    password: str = Field(min_length=1, max_length=128)


class CompressRequest(BaseModel):
    document_id: str
    preset: Literal["low", "medium", "high"] = "medium"
    target_kb: int | None = Field(default=None, ge=10, le=51200)


class JobOut(BaseModel):
    id: str
    job_type: str
    status: str
    progress: int
    stage_message: str | None
    source_version_id: str
    output_document_id: str | None
    output_version_id: str | None
    result_meta: dict[str, Any] | None
    error_detail: dict[str, Any] | None
    created_at: datetime
    completed_at: datetime | None
