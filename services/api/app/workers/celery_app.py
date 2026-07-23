"""Celery application with multi-queue routing (xyz.md §3)."""

from __future__ import annotations

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "fasalpramaan",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

# Distinct queues: evaluation (default) vs high-priority recapture
_default_q = settings.celery_queue_default
_recapture_q = settings.celery_queue_recapture

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    worker_prefetch_multiplier=1,
    task_default_queue=_default_q,
    task_routes={
        "process_submission_ai": {"queue": _default_q},
        "process_recapture_ai": {"queue": _recapture_q},
    },
)
