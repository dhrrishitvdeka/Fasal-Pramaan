# Environment variables

For the local presentation, copy `.env.example` to `.env` and keep its development defaults. Do not share or commit `.env`.

| Group | Variables | Purpose |
|---|---|---|
| Runtime | `ENVIRONMENT`, `LOG_LEVEL`, `CORS_ORIGINS`, `PUBLIC_HOST` | Application behavior, local origins, and LAN host used in browser URLs |
| Database | `DATABASE_URL`, `POSTGRES_*` | PostgreSQL/PostGIS connection |
| Redis/Celery | `REDIS_PASSWORD`, `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` | Authenticated rate-limit and task infrastructure |
| Auth | `JWT_SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`, `DEMO_PASSWORD` | Local demo authentication |
| Storage | `MINIO_*`, `S3_REGION`, `S3_BUCKET_VERSIONING`, `S3_ADDRESSING_STYLE` | Evidence object storage |
| AI | `AI_SERVICE_URL`, `AI_SERVICE_TOKEN`, `AI_MODEL_ADAPTER` (default **`crop_health_v4`**), `AI_ALLOW_MOCK_FALLBACK` | AI service boundary; rollbacks `crop_health_v3` / `crop_vit` / legacy `plant_disease` |
| Native mobile development | `MOBILE_API_BASE_URL` | Host API URL used by helper scripts/native builds; Docker web uses same-origin `/backend` |
| Rate limit | `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_BACKEND`, `TRUSTED_PROXY_IPS` | Client throttling and proxy handling |
| Operations | `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `SEED_ON_STARTUP` | Optional observability and local seed behavior |

## Important production behavior

When `ENVIRONMENT` is not development/test/local, application validation rejects weak/demo JWT configuration, passwordless Redis URLs, memory-only production rate limiting, missing/weak AI service credentials, and AI mock fallback. Production values must be injected by a managed secret system—not copied from `.env.example`.
