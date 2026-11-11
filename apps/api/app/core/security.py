from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from app.core.config import get_settings
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_ph = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_opaque_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def create_access_token(
    subject_id: str,
    role: str,
    is_guest: bool = False,
    session_id: str | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    exp = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload: dict[str, Any] = {
        "sub": subject_id,
        "role": role,
        "is_guest": is_guest,
        "sid": session_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    payload = jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Invalid token type.")
    return payload


def create_signed_purpose_token(subject: str, purpose: str, ttl_minutes: int = 30) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "purpose": purpose,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ttl_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def verify_signed_purpose_token(token: str, purpose: str) -> str:
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    if payload.get("purpose") != purpose:
        raise jwt.InvalidTokenError("Token purpose mismatch.")
    return str(payload["sub"])


def generate_csrf_token(session_id: str) -> str:
    settings = get_settings()
    nonce = secrets.token_urlsafe(16)
    sig = hmac.new(
        settings.csrf_secret_key.encode("utf-8"),
        f"{session_id}:{nonce}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{nonce}.{sig}"


def verify_csrf_token(token: str, session_id: str) -> bool:
    if "." not in token:
        return False
    nonce, sig = token.split(".", 1)
    settings = get_settings()
    expected = hmac.new(
        settings.csrf_secret_key.encode("utf-8"),
        f"{session_id}:{nonce}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(sig, expected)
