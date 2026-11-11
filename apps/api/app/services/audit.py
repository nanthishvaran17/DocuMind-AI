from __future__ import annotations

from typing import Any

from app.db.models import AuditLog
from sqlalchemy.ext.asyncio import AsyncSession


async def record_audit_log(
    db: AsyncSession,
    *,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    actor_user_id: str | None = None,
    actor_guest_session_id: str | None = None,
    ip_address: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    log = AuditLog(
        actor_user_id=actor_user_id,
        actor_guest_session_id=actor_guest_session_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        meta=metadata or {},
    )
    db.add(log)
