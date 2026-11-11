from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import agent, ai_rag, auth, documents, folders, health, jobs, search, tools, users
from app.core.config import get_settings
from app.core.logging import configure_logging, request_id_ctx
from app.core.rate_limit import rate_limit_dependency
from app.db.models import Base
from app.db.session import engine
from app.schemas.common import ApiMeta, FieldError, ProblemDetails
from app.services.retention import purge_expired_guest_documents

logger = logging.getLogger(__name__)


async def _retention_loop() -> None:
    while True:
        try:
            await asyncio.sleep(300)
            deleted = await purge_expired_guest_documents()
            if deleted:
                logger.info("Purged %d expired guest/trash document(s).", deleted)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Error in background retention cleanup loop")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    if settings.database_url.startswith("sqlite"):
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    cleanup_task = asyncio.create_task(_retention_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="DocuMind AI API",
        version="0.1.0",
        docs_url="/api/v1/docs",
        openapi_url="/api/v1/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(GZipMiddleware, minimum_size=512)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=(
            r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$"
            if settings.environment == "development"
            else None
        ),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-CSRF-Token",
            "Idempotency-Key",
            "X-Request-ID",
        ],
    )

    @app.middleware("http")
    async def request_context_and_security_headers(request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = request_id_ctx.set(req_id)
        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            elapsed = time.perf_counter() - start
            request_id_ctx.reset(token)

        response.headers["X-Request-ID"] = req_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if settings.environment == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        health.REQUEST_COUNT.labels(
            method=request.method, path=request.url.path, status=str(response.status_code)
        ).inc()
        health.REQUEST_LATENCY.labels(method=request.method, path=request.url.path).observe(elapsed)
        return response

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        problem = ProblemDetails(
            type=f"https://documind.ai/errors/{exc.status_code}",
            title="Request Failed",
            status=exc.status_code,
            detail=str(exc.detail),
            instance=request.url.path,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "data": None,
                "error": problem.model_dump(),
                "meta": ApiMeta(request_id=request_id_ctx.get("-")).model_dump(),
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        field_errors = [
            FieldError(
                field=".".join(str(part) for part in err.get("loc", [])),
                message=str(err.get("msg", "Invalid value")),
            )
            for err in exc.errors()
        ]
        problem = ProblemDetails(
            type="https://documind.ai/errors/validation",
            title="Validation Error",
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="One or more input fields failed validation.",
            instance=request.url.path,
            code="validation_error",
            errors=field_errors,
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "data": None,
                "error": problem.model_dump(),
                "meta": ApiMeta(request_id=request_id_ctx.get("-")).model_dump(),
            },
        )

    api_deps = [Depends(rate_limit_dependency)]
    prefix = "/api/v1"
    app.include_router(health.router, prefix=prefix)
    app.include_router(auth.router, prefix=prefix, dependencies=api_deps)
    app.include_router(users.router, prefix=prefix, dependencies=api_deps)
    app.include_router(folders.router, prefix=prefix, dependencies=api_deps)
    app.include_router(documents.router, prefix=prefix, dependencies=api_deps)
    app.include_router(tools.router, prefix=prefix, dependencies=api_deps)
    app.include_router(jobs.router, prefix=prefix, dependencies=api_deps)
    app.include_router(search.router, prefix=prefix, dependencies=api_deps)
    app.include_router(ai_rag.router, prefix=prefix, dependencies=api_deps)
    app.include_router(agent.router, prefix=prefix, dependencies=api_deps)
    return app


app = create_app()
