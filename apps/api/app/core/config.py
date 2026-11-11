from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ROOT_ENV) if _ROOT_ENV.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "DocuMind AI"
    environment: str = "development"
    debug: bool = True
    public_app_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"

    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 14
    guest_session_expire_minutes: int = 60
    csrf_secret_key: str = ""
    cookie_secure: bool = False

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/google/callback"

    database_url: str = "sqlite+aiosqlite:///./documind_dev.db"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    task_runner: str = "inline"  # inline | celery

    storage_backend: str = "local"  # local | s3
    local_storage_path: str = "./local_storage"
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket_name: str = "documind-uploads"
    s3_region: str = "us-east-1"

    clamav_mode: str = "disabled_dev"  # clamd | disabled_dev
    clamav_host: str = "localhost"
    clamav_port: int = 3310

    max_upload_size_mb: int = 50
    max_pdf_pages: int = 1000
    rate_limit_per_minute: int = 120

    # AI & RAG Providers (Phase 2 & Phase 4)
    ai_provider: str = "openai_compatible"
    ai_base_url: str = "https://api.openai.com/v1"
    ai_api_key: str = ""
    ai_chat_model: str = "gpt-4o-mini"
    ai_embedding_model: str = "text-embedding-3-small"
    ollama_base_url: str = "http://localhost:11434"
    anthropic_api_key: str = ""
    rag_embedding_dim: int = 384
    rag_chunk_size: int = 700
    rag_chunk_overlap: int = 120

    log_level: str = "INFO"

    @field_validator("jwt_secret_key", mode="before")
    @classmethod
    def ensure_jwt_secret(cls, v: str, info) -> str:
        if v and "CHANGE_ME" not in v:
            return v
        env = info.data.get("environment", "development")
        if env == "production":
            raise ValueError("JWT_SECRET_KEY must be set to a strong secret in production.")
        # Deterministic ephemeral dev secret per process start if unset
        return secrets.token_urlsafe(48)

    @field_validator("csrf_secret_key", mode="before")
    @classmethod
    def ensure_csrf_secret(cls, v: str, info) -> str:
        if v and "CHANGE_ME" not in v:
            return v
        env = info.data.get("environment", "development")
        if env == "production":
            raise ValueError("CSRF_SECRET_KEY must be set in production.")
        return secrets.token_urlsafe(32)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
