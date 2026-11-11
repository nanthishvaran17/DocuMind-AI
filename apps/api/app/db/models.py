from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from app.db.types import PortableINET, PortableJSON, PortableUUID, PortableVector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Double,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'premium', 'staff', 'admin')", name="ck_users_role"),
        CheckConstraint("locale IN ('en', 'ta')", name="ck_users_locale"),
    )

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(24), default="user", nullable=False)
    locale: Mapped[str] = mapped_column(String(8), default="en", nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_student_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    student_email_domain: Mapped[str | None] = mapped_column(String(200), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserPreference(Base, TimestampMixin):
    __tablename__ = "user_preferences"

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        PortableUUID(),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    preferences: Mapped[dict[str, Any]] = mapped_column(
        PortableJSON(), default=dict, nullable=False
    )


class UserSession(Base, TimestampMixin):
    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    refresh_token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(PortableINET(), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OAuthAccount(Base, TimestampMixin):
    __tablename__ = "oauth_accounts"
    __table_args__ = (
        CheckConstraint("provider IN ('google')", name="ck_oauth_provider"),
        UniqueConstraint("provider", "provider_account_id", name="uq_oauth_provider_acct"),
    )

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        PortableUUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_account_id: Mapped[str] = mapped_column(String(255), nullable=False)


class Folder(Base, TimestampMixin):
    __tablename__ = "folders"

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    owner_id: Mapped[str] = mapped_column(
        PortableUUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Document(Base, TimestampMixin):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(
            "status IN ('uploading', 'scanning', 'ready', 'processing', 'quarantined', 'failed')",
            name="ck_documents_status",
        ),
        CheckConstraint("size_bytes >= 0", name="ck_documents_size"),
        CheckConstraint(
            "(owner_id IS NOT NULL) OR (guest_session_id IS NOT NULL)",
            name="ck_documents_actor",
        ),
        Index("ix_documents_owner_active", "owner_id", "deleted_at", "updated_at"),
    )

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    owner_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    guest_session_id: Mapped[str | None] = mapped_column(
        PortableUUID(),
        ForeignKey("user_sessions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    folder_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    current_version_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ready", nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    versions: Mapped[list[DocumentVersion]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentVersion.version_no.desc()",
    )


class DocumentOperation(Base, TimestampMixin):
    __tablename__ = "document_operations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed', 'undone')",
            name="ck_doc_ops_status",
        ),
    )

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(
        PortableUUID(), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    operation_type: Mapped[str] = mapped_column(String(64), nullable=False)
    params: Mapped[dict[str, Any]] = mapped_column(PortableJSON(), default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="pending", nullable=False)
    undoable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reverted_by_operation_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("document_operations.id", ondelete="SET NULL"), nullable=True
    )


class DocumentVersion(Base, TimestampMixin):
    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "version_no", name="uq_doc_version_no"),)

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(
        PortableUUID(), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    operation_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("document_operations.id", ondelete="SET NULL"), nullable=True
    )

    document: Mapped[Document] = relationship(back_populates="versions")
    pages: Mapped[list[DocumentPage]] = relationship(
        back_populates="version", cascade="all, delete-orphan", order_by="DocumentPage.page_no"
    )
    operation: Mapped[DocumentOperation | None] = relationship()


class DocumentPage(Base, TimestampMixin):
    __tablename__ = "document_pages"
    __table_args__ = (
        UniqueConstraint("version_id", "page_no", name="uq_doc_page_no"),
        CheckConstraint("page_no >= 1", name="ck_doc_page_positive"),
        CheckConstraint("rotation IN (0, 90, 180, 270)", name="ck_doc_page_rotation"),
    )

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    version_id: Mapped[str] = mapped_column(
        PortableUUID(),
        ForeignKey("document_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    page_no: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[float] = mapped_column(Double, nullable=False)
    height: Mapped[float] = mapped_column(Double, nullable=False)
    rotation: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    thumbnail_key: Mapped[str | None] = mapped_column(String(512), nullable=True)

    version: Mapped[DocumentVersion] = relationship(back_populates="pages")


class DocumentMetadata(Base, TimestampMixin):
    __tablename__ = "document_metadata"

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    version_id: Mapped[str] = mapped_column(
        PortableUUID(),
        ForeignKey("document_versions.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    author: Mapped[str | None] = mapped_column(String(500), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    raw_info: Mapped[dict[str, Any]] = mapped_column(PortableJSON(), default=dict, nullable=False)


class ConversionJob(Base, TimestampMixin):
    __tablename__ = "conversion_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'running', 'completed', 'failed', 'cancelled')",
            name="ck_jobs_status",
        ),
        CheckConstraint("progress >= 0 AND progress <= 100", name="ck_jobs_progress"),
        UniqueConstraint("user_id", "idempotency_key", name="uq_jobs_user_idempotency"),
        Index("ix_conversion_jobs_user_status", "user_id", "status", "created_at"),
    )

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    guest_session_id: Mapped[str | None] = mapped_column(
        PortableUUID(),
        ForeignKey("user_sessions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    source_version_id: Mapped[str] = mapped_column(
        PortableUUID(),
        ForeignKey("document_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    output_document_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    output_version_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("document_versions.id", ondelete="SET NULL"), nullable=True
    )
    job_type: Mapped[str] = mapped_column(String(64), nullable=False)
    params: Mapped[dict[str, Any]] = mapped_column(PortableJSON(), default=dict, nullable=False)
    result_meta: Mapped[dict[str, Any] | None] = mapped_column(PortableJSON(), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="queued", nullable=False)
    progress: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    stage_message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_detail: Mapped[dict[str, Any] | None] = mapped_column(PortableJSON(), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentRun(Base, TimestampMixin):
    __tablename__ = "agent_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('planning', 'awaiting_approval', 'running', "
            "'completed', 'failed', 'cancelled')",
            name="ck_agent_runs_status",
        ),
    )

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    guest_session_id: Mapped[str | None] = mapped_column(
        PortableUUID(),
        ForeignKey("user_sessions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    command_text: Mapped[str] = mapped_column(Text, nullable=False)
    document_ids: Mapped[list[str]] = mapped_column(PortableJSON(), default=list, nullable=False)
    plan: Mapped[list[dict[str, Any]]] = mapped_column(PortableJSON(), default=list, nullable=False)
    current_step_no: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    execution_log: Mapped[list[dict[str, Any]]] = mapped_column(
        PortableJSON(), default=list, nullable=False
    )
    status: Mapped[str] = mapped_column(String(24), default="awaiting_approval", nullable=False)
    final_summary: Mapped[str | None] = mapped_column(Text, nullable=True)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        UniqueConstraint("version_id", "chunk_index", name="uq_doc_chunk_version_idx"),
        Index("ix_document_chunks_doc_ver", "document_id", "version_id"),
    )

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(
        PortableUUID(), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_id: Mapped[str] = mapped_column(
        PortableUUID(),
        ForeignKey("document_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    page_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section_title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    char_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    char_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    embedding: Mapped[list[float]] = mapped_column(PortableVector(384), nullable=False)
    embedding_model: Mapped[str] = mapped_column(
        String(120), default="local-semantic-hash-384", nullable=False
    )
    meta: Mapped[dict[str, Any]] = mapped_column(PortableJSON(), default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class QaThread(Base, TimestampMixin):
    __tablename__ = "qa_threads"

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    user_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    guest_session_id: Mapped[str | None] = mapped_column(
        PortableUUID(),
        ForeignKey("user_sessions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    document_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("documents.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), default="Document Q&A", nullable=False)

    messages: Mapped[list[QaMessage]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
        order_by="QaMessage.created_at.asc()",
    )


class QaMessage(Base):
    __tablename__ = "qa_messages"

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    thread_id: Mapped[str] = mapped_column(
        PortableUUID(), ForeignKey("qa_threads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(24), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    citations: Mapped[list[dict[str, Any]]] = mapped_column(
        PortableJSON(), default=list, nullable=False
    )
    model_used: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    thread: Mapped[QaThread] = relationship(back_populates="messages")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_actor", "actor_user_id", "created_at"),
        Index("ix_audit_logs_resource", "resource_type", "resource_id"),
    )

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    actor_user_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_guest_session_id: Mapped[str | None] = mapped_column(
        PortableUUID(), ForeignKey("user_sessions.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(PortableUUID(), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(PortableINET(), nullable=True)
    meta: Mapped[dict[str, Any]] = mapped_column(
        "metadata", PortableJSON(), default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class ConversionQualityReport(Base, TimestampMixin):
    __tablename__ = "conversion_quality_reports"

    id: Mapped[str] = mapped_column(PortableUUID(), primary_key=True, default=new_uuid)
    job_id: Mapped[str] = mapped_column(
        PortableUUID(),
        ForeignKey("conversion_jobs.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    source_version_id: Mapped[str] = mapped_column(
        PortableUUID(), ForeignKey("document_versions.id", ondelete="CASCADE"), nullable=False
    )
    output_version_id: Mapped[str] = mapped_column(
        PortableUUID(), ForeignKey("document_versions.id", ondelete="CASCADE"), nullable=False
    )
    source_format: Mapped[str] = mapped_column(String(24), nullable=False)
    target_format: Mapped[str] = mapped_column(String(24), nullable=False)
    conversion_mode: Mapped[str] = mapped_column(String(32), default="editable", nullable=False)
    source_page_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    converted_page_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    page_count_match: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    char_similarity: Mapped[float] = mapped_column(Double, default=0.0, nullable=False)
    word_similarity: Mapped[float] = mapped_column(Double, default=0.0, nullable=False)
    mean_ssim: Mapped[float | None] = mapped_column(Double, nullable=True)
    ssim_status: Mapped[str] = mapped_column(
        String(48), default="unavailable", nullable=False
    )
    source_table_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    converted_table_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    source_image_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    converted_image_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    missing_text_snippets: Mapped[list[str]] = mapped_column(
        PortableJSON(), default=list, nullable=False
    )
    font_warnings: Mapped[list[dict[str, Any]]] = mapped_column(
        PortableJSON(), default=list, nullable=False
    )
    warnings: Mapped[list[str]] = mapped_column(PortableJSON(), default=list, nullable=False)
    page_metrics: Mapped[list[dict[str, Any]]] = mapped_column(
        PortableJSON(), default=list, nullable=False
    )
    page_image_keys: Mapped[dict[str, Any]] = mapped_column(
        PortableJSON(), default=dict, nullable=False
    )
