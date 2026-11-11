from __future__ import annotations

from app.db.session import AsyncSessionLocal
from app.schemas.common import ok_response
from app.services.clamav import clamav_health
from app.services.storage import get_storage
from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from sqlalchemy import text

router = APIRouter(tags=["observability"])

REQUEST_COUNT = Counter(
    "documind_http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status"],
)
REQUEST_LATENCY = Histogram(
    "documind_http_request_duration_seconds",
    "HTTP request latency",
    ["method", "path"],
)


@router.get("/health")
async def health_check() -> dict:
    db_ok = False
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        db_ok = False

    storage_ok = await get_storage().health_check()
    av_status = await clamav_health()

    overall = "ok" if (db_ok and storage_ok) else "degraded"
    return ok_response(
        {
            "status": overall,
            "database": "ok" if db_ok else "error",
            "storage": "ok" if storage_ok else "error",
            "clamav": av_status,
        }
    )


@router.get("/metrics")
async def prometheus_metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
