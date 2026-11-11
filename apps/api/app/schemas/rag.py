from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SemanticSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    document_ids: list[str] | None = None
    mode: Literal["hybrid", "semantic", "keyword"] = "hybrid"
    limit: int = Field(default=8, ge=1, le=30)


class QaAskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    document_id: str | None = None
    document_ids: list[str] | None = None
    thread_id: str | None = None
    top_k: int = Field(default=5, ge=1, le=15)
    response_style: Literal["balanced", "concise", "detailed", "academic"] | None = None
    custom_instructions: str | None = Field(default=None, max_length=1500)


class SummarizeRequest(BaseModel):
    focus: str | None = Field(default=None, max_length=300)
    response_style: Literal["balanced", "concise", "detailed", "academic"] | None = None
    custom_instructions: str | None = Field(default=None, max_length=1500)


class IndexDocumentRequest(BaseModel):
    force: bool = False
