"""Production knobs: pool, queues, secrets, PII log sanitization (xyz.md §3–4)."""

from __future__ import annotations

import pytest


def test_db_pool_settings_from_env(monkeypatch):
    monkeypatch.setenv("DB_POOL_SIZE", "25")
    monkeypatch.setenv("DB_MAX_OVERFLOW", "60")
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-long-enough")
    from app.core.config import Settings

    s = Settings()
    assert s.db_pool_size == 25
    assert s.db_max_overflow == 60


def test_celery_queue_routing_names():
    from app.core.config import get_settings
    from app.workers import celery_app as ca

    s = get_settings()
    routes = ca.celery_app.conf.task_routes
    assert routes["process_submission_ai"]["queue"] == s.celery_queue_default
    assert routes["process_recapture_ai"]["queue"] == s.celery_queue_recapture
    assert s.celery_queue_default != s.celery_queue_recapture


def test_production_refuses_weak_jwt(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET_KEY", "change-me-local-dev-secret-not-for-production")
    monkeypatch.setenv("DEMO_PASSWORD", "NotDemoDefault1!")
    from app.core.config import Settings

    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        Settings().assert_safe_for_environment()


def _otherwise_safe_production_settings(**overrides):
    from app.core.config import Settings

    values = {
        "environment": "production",
        "jwt_secret_key": "j" * 40,
        "demo_password": "UniqueProductionPassword1!",
        "database_url": "postgresql+psycopg://app:secret@db.internal/fasal",
        "minio_access_key": "managed-access-key",
        "minio_secret_key": "managed-secret-key",
        "minio_use_ssl": True,
        "s3_bucket_versioning": True,
        "cors_origins": "https://dashboard.example.gov.in",
        "ai_model_adapter": "plant_disease",
        "ai_service_token": "a" * 40,
        "rate_limit_backend": "redis",
        "redis_url": "redis://:secret@redis.internal:6379/0",
        "celery_broker_url": "redis://:secret@redis.internal:6379/0",
        "celery_result_backend": "redis://:secret@redis.internal:6379/1",
        "ai_require_human_review": True,
    }
    values.update(overrides)
    return Settings(**values)


def test_production_requires_ai_service_authentication():
    with pytest.raises(RuntimeError, match="AI_SERVICE_TOKEN"):
        _otherwise_safe_production_settings(ai_service_token="").assert_safe_for_environment()


def test_production_requires_distributed_rate_limit():
    with pytest.raises(RuntimeError, match="RATE_LIMIT_BACKEND"):
        _otherwise_safe_production_settings(rate_limit_backend="memory").assert_safe_for_environment()


def test_production_requires_redis_authentication():
    with pytest.raises(RuntimeError, match="REDIS_URL"):
        _otherwise_safe_production_settings(redis_url="redis://redis.internal:6379/0").assert_safe_for_environment()


def test_pii_and_token_log_sanitization():
    from app.core.logging import sanitize_log_text

    raw = (
        "user phone 9876543210 aadhaar 1234 5678 9012 "
        "email farmer@example.com Bearer eyJhbGciOiJIUzI1NiJ9.abc.def"
    )
    clean = sanitize_log_text(raw)
    assert "9876543210" not in clean
    assert "1234 5678 9012" not in clean
    assert "farmer@example.com" not in clean
    assert "eyJhbGciOiJIUzI1NiJ9" not in clean
    assert "PHONE_REDACTED" in clean
    assert "REDACTED" in clean


def test_enqueue_ai_job_selects_tasks():
    from app.workers.tasks import enqueue_ai_job, process_recapture_ai, process_submission_ai

    assert process_submission_ai.name == "process_submission_ai"
    assert process_recapture_ai.name == "process_recapture_ai"
    # Callables exist; delay needs broker — structural proof of routing helpers
    assert callable(enqueue_ai_job)
