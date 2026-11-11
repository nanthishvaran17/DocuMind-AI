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


class UserPreferencesData(BaseModel):
    theme: Literal["light", "dark", "system"] = "dark"
    density: Literal["comfortable", "compact"] = "comfortable"
    ai_response_style: Literal["balanced", "concise", "detailed", "academic"] = "balanced"
    custom_instructions: str = Field(default="", max_length=1500)
    default_search_mode: Literal["hybrid", "semantic", "keyword"] = "hybrid"
    default_top_k: int = Field(default=6, ge=2, le=12)
    show_citation_snippets: bool = True
    auto_index_uploads: bool = True
    agent_show_execution_log: bool = False
    default_compress_kb: int = Field(default=200, ge=20, le=10240)
    default_ocr_lang: Literal["eng", "tam", "eng+tam"] = "eng"
    default_docx_mode: Literal["editable", "high_fidelity", "hybrid"] = "editable"
    default_photo_preset: str = Field(default="passport_india", max_length=64)
    confirm_before_delete: bool = True
    keyboard_shortcuts_enabled: bool = True
    analytics_opt_out: bool = False


class UserPreferencesUpdate(BaseModel):
    theme: Literal["light", "dark", "system"] | None = None
    density: Literal["comfortable", "compact"] | None = None
    ai_response_style: Literal["balanced", "concise", "detailed", "academic"] | None = None
    custom_instructions: str | None = Field(default=None, max_length=1500)
    default_search_mode: Literal["hybrid", "semantic", "keyword"] | None = None
    default_top_k: int | None = Field(default=None, ge=2, le=12)
    show_citation_snippets: bool | None = None
    auto_index_uploads: bool | None = None
    agent_show_execution_log: bool | None = None
    default_compress_kb: int | None = Field(default=None, ge=20, le=10240)
    default_ocr_lang: Literal["eng", "tam", "eng+tam"] | None = None
    default_docx_mode: Literal["editable", "high_fidelity", "hybrid"] | None = None
    default_photo_preset: str | None = Field(default=None, max_length=64)
    confirm_before_delete: bool | None = None
    keyboard_shortcuts_enabled: bool | None = None
    analytics_opt_out: bool | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserSessionOut(BaseModel):
    id: str
    user_agent: str | None
    ip_address: str | None
    created_at: datetime
    updated_at: datetime
    expires_at: datetime
    is_current: bool = False
