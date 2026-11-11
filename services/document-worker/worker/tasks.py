from __future__ import annotations

import logging
from typing import Any

from worker.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="worker.tasks.run_pdf_job", max_retries=2)
def run_pdf_job(self: Any, job_id: str) -> dict[str, Any]:
    """Celery entrypoint for asynchronous document processing jobs."""
    import asyncio

    from app.services.job_runner import execute_job_by_id  # imported at runtime inside worker

    logger.info("Executing Celery document job %s (task_id=%s)", job_id, self.request.id)
    asyncio.run(execute_job_by_id(job_id))
    return {"job_id": job_id, "status": "completed"}


@celery_app.task(name="worker.tasks.cleanup_expired_guests")
def cleanup_expired_guests() -> dict[str, int]:
    """Periodic task to hard-delete expired guest documents and storage objects."""
    import asyncio

    from app.services.retention import purge_expired_guest_documents

    deleted = asyncio.run(purge_expired_guest_documents())
    return {"deleted_documents": deleted}
