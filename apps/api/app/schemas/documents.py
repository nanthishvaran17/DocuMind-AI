from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: str | None = None


class FolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: str | None = None


class FolderOut(BaseModel):
    id: str
    parent_id: str | None
    name: str
    created_at: datetime
    updated_at: datetime


class DocumentPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=500)
    folder_id: str | None = None
    is_favorite: bool | None = None


class DocumentPageOut(BaseModel):
    id: str
    page_no: int
    width: float
    height: float
    rotation: int
    thumbnail_url: str | None


class DocumentVersionOut(BaseModel):
    id: str
    version_no: int
    mime_type: str
    size_bytes: int
    sha256: str
    page_count: int | None
    operation_type: str | None = None
    created_at: datetime


class DocumentOut(BaseModel):
    id: str
    folder_id: str | None
    name: str
    mime_type: str
    size_bytes: int
    sha256: str
    current_version_no: int
    is_favorite: bool
    is_duplicate: bool = False
    status: str
    expires_at: datetime | None
    deleted_at: datetime | None
    page_count: int | None = None
    thumbnail_url: str | None = None
    created_at: datetime
    updated_at: datetime


class DocumentDetailOut(DocumentOut):
    versions: list[DocumentVersionOut]
    pages: list[DocumentPageOut]
    metadata: dict[str, Any] = Field(default_factory=dict)
