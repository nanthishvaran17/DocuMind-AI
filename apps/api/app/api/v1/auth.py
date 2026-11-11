from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
from app.api.deps import ActorContext, get_current_actor
from app.core.config import get_settings
from app.core.rate_limit import check_rate_limit
from app.core.security import (
    create_access_token,
    create_signed_purpose_token,
    generate_csrf_token,
    generate_opaque_token,
    hash_password,
    hash_token,
    verify_password,
    verify_signed_purpose_token,
)
from app.db.models import OAuthAccount, User, UserSession
from app.db.session import get_db
from app.schemas.auth import (
    AuthSessionOut,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserOut,
    VerifyEmailRequest,
)
from app.schemas.common import ok_response
from app.services.audit import record_audit_log
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _user_to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        locale=user.locale,
        is_student_verified=user.is_student_verified,
        email_verified_at=user.email_verified_at,
        created_at=user.created_at,
    )


def _set_refresh_cookie(response: Response, refresh_token: str, max_age_seconds: int) -> None:
    settings = get_settings()
    response.set_cookie(
        key="dm_refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=max_age_seconds,
        path="/api/v1/auth",
    )


async def _issue_user_session(
    db: AsyncSession,
    response: Response,
    user: User,
    request: Request,
) -> AuthSessionOut:
    settings = get_settings()
    raw_refresh = generate_opaque_token(32)
    expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    sess = UserSession(
        user_id=user.id,
        is_guest=False,
        refresh_token_hash=hash_token(raw_refresh),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent", "")[:300],
        expires_at=expires_at,
    )
    db.add(sess)
    await db.flush()

    access_token = create_access_token(
        subject_id=user.id,
        role=user.role,
        is_guest=False,
        session_id=sess.id,
    )
    _set_refresh_cookie(response, raw_refresh, settings.refresh_token_expire_days * 86400)
    return AuthSessionOut(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        is_guest=False,
        guest_expires_at=None,
        user=_user_to_out(user),
        csrf_token=generate_csrf_token(sess.id),
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    client_ip = request.client.host if request.client else "unknown"
    # Registration spam protection: max 5 registrations per minute per IP
    await check_rate_limit(f"auth:register:ip:{client_ip}", limit=5, window_seconds=60)

    email = payload.email.lower().strip()
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    domain = email.split("@", 1)[1]
    is_edu = domain.endswith(".edu") or domain.endswith(".edu.in") or domain.endswith(".ac.in")
    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role="user",
        locale=payload.locale,
        is_student_verified=is_edu,
        student_email_domain=domain if is_edu else None,
    )
    db.add(user)
    await db.flush()

    verify_token = create_signed_purpose_token(user.id, "verify_email", ttl_minutes=60 * 24)
    logger.info("Email verification token issued for user %s", user.id)

    session_out = await _issue_user_session(db, response, user, request)
    await record_audit_log(
        db,
        action="auth.register",
        resource_type="user",
        resource_id=user.id,
        actor_user_id=user.id,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    data = session_out.model_dump()
    if get_settings().environment == "development":
        data["dev_verification_token"] = verify_token
    return ok_response(data)


@router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    client_ip = request.client.host if request.client else "unknown"
    # Strict brute-force protection: max 10 failed login attempts per minute per IP
    await check_rate_limit(f"auth:login:ip:{client_ip}", limit=10, window_seconds=60)

    email = payload.email.lower().strip()
    user = (
        await db.execute(select(User).where(User.email == email, User.deleted_at.is_(None)))
    ).scalar_one_or_none()
    if (
        not user
        or not user.password_hash
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    session_out = await _issue_user_session(db, response, user, request)
    await record_audit_log(
        db,
        action="auth.login",
        resource_type="user",
        resource_id=user.id,
        actor_user_id=user.id,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return ok_response(session_out.model_dump())


@router.post("/guest", status_code=status.HTTP_201_CREATED)
async def create_guest_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a 1-hour anonymous guest session so students can use core PDF tools without signup."""
    settings = get_settings()
    raw_refresh = generate_opaque_token(32)
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.guest_session_expire_minutes)
    sess = UserSession(
        user_id=None,
        is_guest=True,
        refresh_token_hash=hash_token(raw_refresh),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent", "")[:300],
        expires_at=expires_at,
    )
    db.add(sess)
    await db.flush()

    ttl = timedelta(minutes=settings.guest_session_expire_minutes)
    access_token = create_access_token(
        subject_id=sess.id,
        role="guest",
        is_guest=True,
        session_id=sess.id,
        expires_delta=ttl,
    )
    _set_refresh_cookie(response, raw_refresh, settings.guest_session_expire_minutes * 60)
    await db.commit()

    return ok_response(
        AuthSessionOut(
            access_token=access_token,
            expires_in=settings.guest_session_expire_minutes * 60,
            is_guest=True,
            guest_expires_at=expires_at,
            user=None,
            csrf_token=generate_csrf_token(sess.id),
        ).model_dump()
    )


@router.post("/refresh")
async def refresh_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict:
    raw_refresh = request.cookies.get("dm_refresh_token")
    if not raw_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token cookie.",
        )

    token_digest = hash_token(raw_refresh)
    sess = (
        await db.execute(select(UserSession).where(UserSession.refresh_token_hash == token_digest))
    ).scalar_one_or_none()
    now = datetime.now(UTC)
    if not sess or sess.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token."
        )

    exp = sess.expires_at if sess.expires_at.tzinfo else sess.expires_at.replace(tzinfo=UTC)
    if exp <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired.")

    # Rotate refresh token
    settings = get_settings()
    new_raw = generate_opaque_token(32)
    sess.refresh_token_hash = hash_token(new_raw)

    if sess.is_guest:
        remaining = max(60, int((exp - now).total_seconds()))
        access_token = create_access_token(
            subject_id=sess.id,
            role="guest",
            is_guest=True,
            session_id=sess.id,
            expires_delta=timedelta(seconds=remaining),
        )
        _set_refresh_cookie(response, new_raw, remaining)
        await db.commit()
        return ok_response(
            AuthSessionOut(
                access_token=access_token,
                expires_in=remaining,
                is_guest=True,
                guest_expires_at=exp,
                user=None,
                csrf_token=generate_csrf_token(sess.id),
            ).model_dump()
        )

    user = await db.get(User, sess.user_id)
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User unavailable.")

    access_token = create_access_token(
        subject_id=user.id,
        role=user.role,
        is_guest=False,
        session_id=sess.id,
    )
    _set_refresh_cookie(response, new_raw, settings.refresh_token_expire_days * 86400)
    await db.commit()
    return ok_response(
        AuthSessionOut(
            access_token=access_token,
            expires_in=settings.access_token_expire_minutes * 60,
            is_guest=False,
            guest_expires_at=None,
            user=_user_to_out(user),
            csrf_token=generate_csrf_token(sess.id),
        ).model_dump()
    )


@router.post("/logout")
async def logout(
    response: Response,
    actor: ActorContext = Depends(get_current_actor),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if actor.session_id:
        sess = await db.get(UserSession, actor.session_id)
        if sess:
            sess.revoked_at = datetime.now(UTC)
            await db.commit()
    response.delete_cookie("dm_refresh_token", path="/api/v1/auth")
    return ok_response({"logged_out": True})


@router.post("/verify-email")
async def verify_email(payload: VerifyEmailRequest, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        user_id = verify_signed_purpose_token(payload.token, "verify_email")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification token."
        ) from exc

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.email_verified_at = datetime.now(UTC)
    await db.commit()
    return ok_response({"verified": True})


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    email = payload.email.lower().strip()
    user = (
        await db.execute(select(User).where(User.email == email, User.deleted_at.is_(None)))
    ).scalar_one_or_none()
    dev_token = None
    if user:
        token = create_signed_purpose_token(user.id, "reset_password", ttl_minutes=30)
        logger.info("Password reset token generated for user %s", user.id)
        if get_settings().environment == "development":
            dev_token = token
    return ok_response(
        {
            "message": "If an account exists for that email, reset instructions have been issued.",
            **({"dev_reset_token": dev_token} if dev_token else {}),
        }
    )


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> dict:
    try:
        user_id = verify_signed_purpose_token(payload.token, "reset_password")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token."
        ) from exc

    user = await db.get(User, user_id)
    if not user or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return ok_response({"reset": True})


@router.get("/google")
async def google_oauth_start() -> RedirectResponse:
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=(
                "Google OAuth is not configured on this server "
                "(set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)."
            ),
        )
    state = create_signed_purpose_token(
        secrets.token_urlsafe(12), "google_oauth_state", ttl_minutes=10
    )
    query = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "select_account",
        }
    )
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{query}")


@router.get("/google/callback")
async def google_oauth_callback(
    code: str,
    state: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured.",
        )
    try:
        verify_signed_purpose_token(state, "google_oauth_state")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state."
        ) from exc

    async with httpx.AsyncClient(timeout=15) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_resp.raise_for_status()
        tokens = token_resp.json()
        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        userinfo_resp.raise_for_status()
        profile = userinfo_resp.json()

    email = str(profile["email"]).lower().strip()
    google_sub = str(profile["sub"])
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user:
        domain = email.split("@", 1)[1]
        is_edu = domain.endswith(".edu") or domain.endswith(".edu.in") or domain.endswith(".ac.in")
        user = User(
            email=email,
            full_name=str(profile.get("name") or email.split("@")[0]),
            email_verified_at=datetime.now(UTC),
            is_student_verified=is_edu,
            student_email_domain=domain if is_edu else None,
        )
        db.add(user)
        await db.flush()

    acct = (
        await db.execute(
            select(OAuthAccount).where(
                OAuthAccount.provider == "google",
                OAuthAccount.provider_account_id == google_sub,
            )
        )
    ).scalar_one_or_none()
    if not acct:
        db.add(OAuthAccount(user_id=user.id, provider="google", provider_account_id=google_sub))

    redirect = RedirectResponse(url=f"{settings.public_app_url}/app")
    await _issue_user_session(db, redirect, user, request)
    await db.commit()
    return redirect
