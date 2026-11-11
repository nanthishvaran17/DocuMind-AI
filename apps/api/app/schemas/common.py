from __future__ import annotations

from typing import Any

from app.core.logging import request_id_ctx
from pydantic import BaseModel, Field


class FieldError(BaseModel):
    field: str
    message: str


class ProblemDetails(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str
    instance: str | None = None
    code: str | None = None
    errors: list[FieldError] | None = None


class ApiMeta(BaseModel):
    request_id: str = Field(default_factory=lambda: request_id_ctx.get("-"))
    cursor: str | None = None
    next_cursor: str | None = None
    has_more: bool | None = None
    total: int | None = None


class ApiResponse[T](BaseModel):
    data: T | None = None
    error: ProblemDetails | None = None
    meta: ApiMeta = Field(default_factory=ApiMeta)


def ok_response(
    data: Any,
    *,
    cursor: str | None = None,
    next_cursor: str | None = None,
    has_more: bool | None = None,
    total: int | None = None,
) -> dict[str, Any]:
    return {
        "data": data,
        "error": None,
        "meta": ApiMeta(
            request_id=request_id_ctx.get("-"),
            cursor=cursor,
            next_cursor=next_cursor,
            has_more=has_more,
            total=total,
        ).model_dump(),
    }
