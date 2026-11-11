"""phase2 rag and phase4 agent

Revision ID: b2c3d4e5f601
Revises: 09413a5b416e
Create Date: 2026-11-11 20:10:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import app.db.types
import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f601"
down_revision: str | None = "09413a5b416e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    if is_pg:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.add_column(
        "agent_runs",
        sa.Column(
            "document_ids",
            app.db.types.PortableJSON(),
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "agent_runs",
        sa.Column("current_step_no", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "agent_runs",
        sa.Column(
            "execution_log",
            app.db.types.PortableJSON(),
            nullable=False,
            server_default="[]",
        ),
    )

    op.create_table(
        "document_chunks",
        sa.Column("id", app.db.types.PortableUUID(length=36), nullable=False),
        sa.Column("document_id", app.db.types.PortableUUID(length=36), nullable=False),
        sa.Column("version_id", app.db.types.PortableUUID(length=36), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("page_no", sa.Integer(), nullable=True),
        sa.Column("section_title", sa.String(length=300), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("char_start", sa.Integer(), nullable=True),
        sa.Column("char_end", sa.Integer(), nullable=True),
        sa.Column("embedding", app.db.types.PortableVector(384), nullable=False),
        sa.Column("embedding_model", sa.String(length=120), nullable=False),
        sa.Column("meta", app.db.types.PortableJSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["version_id"], ["document_versions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("version_id", "chunk_index", name="uq_doc_chunk_version_idx"),
    )
    op.create_index(
        "ix_document_chunks_doc_ver",
        "document_chunks",
        ["document_id", "version_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_document_chunks_document_id"),
        "document_chunks",
        ["document_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_document_chunks_version_id"),
        "document_chunks",
        ["version_id"],
        unique=False,
    )

    op.create_table(
        "qa_threads",
        sa.Column("id", app.db.types.PortableUUID(length=36), nullable=False),
        sa.Column("user_id", app.db.types.PortableUUID(length=36), nullable=True),
        sa.Column("guest_session_id", app.db.types.PortableUUID(length=36), nullable=True),
        sa.Column("document_id", app.db.types.PortableUUID(length=36), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["guest_session_id"], ["user_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_qa_threads_document_id"), "qa_threads", ["document_id"], unique=False
    )
    op.create_index(
        op.f("ix_qa_threads_guest_session_id"),
        "qa_threads",
        ["guest_session_id"],
        unique=False,
    )
    op.create_index(op.f("ix_qa_threads_user_id"), "qa_threads", ["user_id"], unique=False)

    op.create_table(
        "qa_messages",
        sa.Column("id", app.db.types.PortableUUID(length=36), nullable=False),
        sa.Column("thread_id", app.db.types.PortableUUID(length=36), nullable=False),
        sa.Column("role", sa.String(length=24), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("citations", app.db.types.PortableJSON(), nullable=False),
        sa.Column("model_used", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["qa_threads.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_qa_messages_thread_id"), "qa_messages", ["thread_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_qa_messages_thread_id"), table_name="qa_messages")
    op.drop_table("qa_messages")
    op.drop_index(op.f("ix_qa_threads_user_id"), table_name="qa_threads")
    op.drop_index(op.f("ix_qa_threads_guest_session_id"), table_name="qa_threads")
    op.drop_index(op.f("ix_qa_threads_document_id"), table_name="qa_threads")
    op.drop_table("qa_threads")
    op.drop_index(op.f("ix_document_chunks_version_id"), table_name="document_chunks")
    op.drop_index(op.f("ix_document_chunks_document_id"), table_name="document_chunks")
    op.drop_index("ix_document_chunks_doc_ver", table_name="document_chunks")
    op.drop_table("document_chunks")
    op.drop_column("agent_runs", "execution_log")
    op.drop_column("agent_runs", "current_step_no")
    op.drop_column("agent_runs", "document_ids")
