from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=200)
    locale: Literal["en", "ta"] = "en"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str


class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    locale: Literal["en", "ta"] | None = None


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    locale: str
    is_student_verified: bool
    email_verified_at: datetime | None
    created_at: datetime


class AuthSessionOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    is_guest: bool
    guest_expires_at: datetime | None
    user: UserOut | None
    csrf_token: str
