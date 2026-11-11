import os

from celery import Celery

BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

celery_app = Celery(
    "documind_document_worker",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=["worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=120,
    task_time_limit=180,
    task_routes={
        "worker.tasks.run_pdf_job": {"queue": "convert"},
        "worker.tasks.run_conversion_job": {"queue": "convert"},
        "worker.tasks.run_ocr_job": {"queue": "ocr"},
        "worker.tasks.cleanup_expired_guests": {"queue": "default"},
    },
)
