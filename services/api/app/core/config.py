"""Application settings for FasalPramaan AI API."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    project_name: str = "FasalPramaan AI"
    environment: str = "development"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    database_url: str = (
        "postgresql+psycopg://fasalpramaan:fasalpramaan_dev_only@localhost:5432/fasalpramaan"
    )
    # SQLAlchemy pool (tune for managed Postgres via env)
    db_pool_size: int = 20
    db_max_overflow: int = 50
    db_pool_timeout: int = 30
    db_pool_recycle: int = 1800

    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"
    # Distinct queues: normal evaluation vs high-priority recapture (xyz.md §3)
    celery_queue_default: str = "evaluation"
    celery_queue_recapture: str = "recapture"

    jwt_secret_key: str = "change-me-local-dev-secret-not-for-production"
    jwt_algorithm: Literal["HS256"] = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14

    # S3-compatible storage (MinIO local; AWS S3 / GCS interoperability via endpoint)
    minio_endpoint: str = "localhost:9000"
    minio_public_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin_dev_only"
    minio_bucket: str = "fasalpramaan-evidence"
    minio_use_ssl: bool = False
    s3_region: str = "us-east-1"
    s3_addressing_style: str = "path"  # path|virtual — virtual for AWS S3 typically
    s3_bucket_versioning: bool = False  # enable on managed buckets in production
    storage_backend: str = "s3"  # s3-compatible (MinIO/AWS/GCS interop)

    api_v1_prefix: str = "/api/v1"
    rate_limit_per_minute: int = 120
    rate_limit_backend: Literal["memory", "redis"] = "memory"
    trusted_proxy_ips: str = ""
    max_upload_size_mb: int = 15
    gps_accuracy_limit_meters: float = 50.0
    plot_proximity_meters: float = 200.0

    ai_service_url: str = "http://localhost:8001"
    ai_service_token: str = ""
    ai_model_adapter: str = "crop_health_v4"
    ai_confidence_threshold: float = 0.55
    ai_high_severity_threshold: float = 0.7
    ai_require_human_review: bool = True

    demo_password: str = "Demo@12345"
    seed_on_startup: bool = False
    email_provider: str = "console"

    # Observability (activate only when configured — xyz.md §4)
    sentry_dsn: str = ""
    otel_exporter_otlp_endpoint: str = ""
    otel_service_name: str = "fasalpramaan-api"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def trusted_proxy_list(self) -> list[str]:
        return [value.strip() for value in self.trusted_proxy_ips.split(",") if value.strip()]

    @property
    def api_docs_enabled(self) -> bool:
        return self.environment.lower() in ("development", "dev", "test", "local")

    def assert_safe_for_environment(self) -> None:
        """Refuse known-insecure defaults outside local/dev/test."""
        weak_secrets = {
            "change-me-local-dev-secret-not-for-production",
            "test-secret-key-for-unit-tests",
            "secret",
            "changeme",
        }
        if self.environment.lower() in ("development", "dev", "test", "local"):
            return
        if self.jwt_secret_key in weak_secrets or len(self.jwt_secret_key) < 32:
            raise RuntimeError(
                "JWT_SECRET_KEY must be a strong secret (>=32 chars) when "
                f"ENVIRONMENT={self.environment}"
            )
        if self.demo_password == "Demo@12345":
            raise RuntimeError(
                "DEMO_PASSWORD must be changed when ENVIRONMENT is not development/test"
            )
        if "fasalpramaan_dev_only" in self.database_url or "localhost" in self.database_url:
            raise RuntimeError("DATABASE_URL must use a non-development database in production")
        if self.minio_access_key == "minioadmin" or "dev_only" in self.minio_secret_key:
            raise RuntimeError("Evidence-storage credentials must be changed in production")
        if not self.minio_use_ssl:
            raise RuntimeError("MINIO_USE_SSL must be true in production")
        if not self.s3_bucket_versioning:
            raise RuntimeError("S3_BUCKET_VERSIONING must be enabled in production")
        origins = set(self.cors_origin_list)
        if "*" in origins or any("localhost" in origin or "127.0.0.1" in origin for origin in origins):
            raise RuntimeError("CORS_ORIGINS must list explicit production origins")
        if self.ai_model_adapter == "mock":
            raise RuntimeError("AI_MODEL_ADAPTER=mock is forbidden in production")
        if len(self.ai_service_token) < 32:
            raise RuntimeError("AI_SERVICE_TOKEN must be a strong secret (>=32 chars) in production")
        if self.rate_limit_backend != "redis":
            raise RuntimeError("RATE_LIMIT_BACKEND=redis is required in production")
        for url_name, url in (
            ("REDIS_URL", self.redis_url),
            ("CELERY_BROKER_URL", self.celery_broker_url),
            ("CELERY_RESULT_BACKEND", self.celery_result_backend),
        ):
            if "://:" not in url or "@" not in url:
                raise RuntimeError(f"{url_name} must contain Redis authentication in production")
        if not self.ai_require_human_review:
            raise RuntimeError("AI_REQUIRE_HUMAN_REVIEW must remain enabled until formal validation")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.assert_safe_for_environment()
    return settings
