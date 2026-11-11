from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token, verify_csrf_token
from app.db.models import Document, User, UserSession
from app.db.session import get_db


@dataclass(frozen=True)
class ActorContext:
    user: User | None
    user_id: str | None
    guest_session_id: str | None
    session_id: str | None
    role: str
    is_guest: bool


async def get_current_actor(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> ActorContext:
    auth_header = request.headers.get("Authorization", "")
    token = ""
    used_cookie = False
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "dm_access_token" in request.cookies:
        token = request.cookies["dm_access_token"]
        used_cookie = True

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token.",
        ) from exc

    sub = str(payload.get("sub", ""))
    is_guest = bool(payload.get("is_guest", False))
    sid = payload.get("sid")

    if used_cookie and request.method in ("POST", "PUT", "PATCH", "DELETE") and sid:
        csrf_hdr = request.headers.get("X-CSRF-Token", "")
        if not verify_csrf_token(csrf_hdr, str(sid)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid or missing CSRF token.",
            )

    if is_guest:
        sess = await db.get(UserSession, sub)
        now = datetime.now(UTC)
        exp = sess.expires_at if sess else None
        if exp is not None and exp.tzinfo is None:
            exp = exp.replace(tzinfo=UTC)
        if not sess or not sess.is_guest or sess.revoked_at is not None or (exp and exp <= now):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Guest session expired. Start a new guest session or sign in.",
            )
        return ActorContext(
            user=None,
            user_id=None,
            guest_session_id=sess.id,
            session_id=sess.id,
            role="guest",
            is_guest=True,
        )

    user = await db.get(User, sub)
    if not user or user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found or deleted.",
        )
    return ActorContext(
        user=user,
        user_id=user.id,
        guest_session_id=None,
        session_id=str(sid) if sid else None,
        role=user.role,
        is_guest=False,
    )


async def require_authenticated_user(
    actor: ActorContext = Depends(get_current_actor),
) -> ActorContext:
    if actor.is_guest or not actor.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please sign in with an account to access this feature.",
        )
    return actor


def require_role(*allowed_roles: str):
    async def _guard(actor: ActorContext = Depends(require_authenticated_user)) -> ActorContext:
        if actor.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for this action.",
            )
        return actor

    return _guard


async def get_owned_document(
    db: AsyncSession,
    document_id: str,
    actor: ActorContext,
    *,
    allow_trashed: bool = False,
) -> Document:
    stmt = select(Document).where(Document.id == document_id)
    if actor.is_guest:
        stmt = stmt.where(Document.guest_session_id == actor.guest_session_id)
    else:
        stmt = stmt.where(Document.owner_id == actor.user_id)
    if not allow_trashed:
        stmt = stmt.where(Document.deleted_at.is_(None))
    doc = (await db.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    return doc
