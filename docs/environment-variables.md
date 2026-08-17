# Environment Variables Reference

Fasal-Pramaan is configured via environment variables defined in `.env` (derived from `.env.example`).

---

## Configuration Parameter Groups

| Group | Variables | Default Value | Description |
|---|---|---|---|
| **Runtime & Network** | `ENVIRONMENT`<br/>`LOG_LEVEL`<br/>`CORS_ORIGINS`<br/>`PUBLIC_HOST` | `development`<br/>`INFO`<br/>`http://localhost:3000,...`<br/>`localhost` | Environment mode (`development`, `production`, `test`), logging granularity, allowed CORS origins, and LAN host identifier. |
| **Database & GIS** | `DATABASE_URL`<br/>`POSTGRES_DB`<br/>`POSTGRES_USER`<br/>`POSTGRES_PASSWORD` | `postgresql+psycopg2://...`<br/>`fasalpramaan`<br/>`fp_user`<br/>`fp_password` | PostgreSQL 16 + PostGIS connection string and credential parameters. |
| **Supabase (cloud)** | `NEXT_PUBLIC_SUPABASE_URL`<br/>`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`<br/>`SUPABASE_SERVICE_ROLE_KEY`<br/>`SUPABASE_DB_PASSWORD`<br/>`SUPABASE_PROJECT_REF`<br/>`SUPABASE_DB_REGION` | _(empty — set locally, never commit)_ | Browser publishable key, server-only service role, and DB vars for `scripts/test_supabase_conn.py`. |
| **Hugging Face Space (Vercel path)** | `HF_SPACE_URL`<br/>`HF_TOKEN` | `https://dhrrishitvdeka-fasal-pramaan-api.hf.space`<br/>_(empty)_ | Private Space that runs `dhrrishitvdeka/fasal-pramaan-model`. Server-only. |
| **Redis & Queue** | `REDIS_URL`<br/>`REDIS_PASSWORD`<br/>`CELERY_BROKER_URL`<br/>`CELERY_RESULT_BACKEND` | `redis://:fp_redis_pass@redis:6379/0` | Redis 7 broker and Celery asynchronous task infrastructure. |
| **Authentication** | `JWT_SECRET_KEY`<br/>`ACCESS_TOKEN_EXPIRE_MINUTES`<br/>`REFRESH_TOKEN_EXPIRE_DAYS`<br/>`DEMO_PASSWORD` | `32-byte-hex`<br/>`30`<br/>`30`<br/>`Demo@12345` | JWT secret key, token expiration timeframes, and pre-seeded demo user account password. |
| **Evidence Storage** | `MINIO_ENDPOINT`<br/>`MINIO_ROOT_USER`<br/>`MINIO_ROOT_PASSWORD`<br/>`S3_BUCKET_NAME` | `minio:9000`<br/>`minioadmin`<br/>`minioadmin_dev_only`<br/>`evidence-vault` | S3/MinIO endpoint, credentials, and evidence bucket configuration. |
| **Evidence Trust Engine** | `EVIDENCE_CONFIDENCE_THRESHOLD`<br/>`EVIDENCE_QUALITY_RETAKE_THRESHOLD`<br/>`EVIDENCE_COVERAGE_REQUEST_THRESHOLD`<br/>`EVIDENCE_EVALUATION_VERSION` | `85.0`<br/>`40.0`<br/>`50.0`<br/>`evidence-confidence-v1` | Deterministic threshold for evidence sufficiency, visual quality retake boundary, coverage request threshold, and scoring version. |
| **AI Inference** | `AI_SERVICE_URL`<br/>`AI_SERVICE_TOKEN`<br/>`AI_MODEL_ADAPTER`<br/>`AI_ALLOW_MOCK_FALLBACK` | `http://ai:8001`<br/>`fp_ai_service_token_dev`<br/>`crop_health_v4`<br/>`false` | AI microservice endpoint, service authentication token, active model adapter, and fallback policy. |
| **Voice (Fasal Saathi)** | `VOICE_ASSISTANT_ENABLED`<br/>`GEMINI_API_KEY`<br/>`GEMINI_LIVE_MODEL`<br/>`GEMINI_LIVE_VOICE`<br/>`GEMINI_LIVE_SESSION_MINUTES` | `false`<br/>`""`<br/>`gemini-3.1-flash-live-preview`<br/>`Kore`<br/>`15` | Google Gemini Live full-duplex spoken assistant configuration (server-side only). |
| **Rate Limiting** | `RATE_LIMIT_ENABLED`<br/>`RATE_LIMIT_PER_MINUTE`<br/>`RATE_LIMIT_BACKEND`<br/>`TRUSTED_PROXY_IPS` | `false`<br/>`120`<br/>`redis`<br/>`127.0.0.1` | API gateway client throttling controls. |
| **Observability** | `SENTRY_DSN`<br/>`OTEL_EXPORTER_OTLP_ENDPOINT`<br/>`SEED_ON_STARTUP` | `""`<br/>`""`<br/>`true` | Sentry error monitoring, OpenTelemetry distributed tracing, and automated startup data seeding. |

---

## Production Security Assertions

When `ENVIRONMENT=production`, the application strictly enforces:
- `JWT_SECRET_KEY` must be $\ge 32$ cryptographically random bytes.
- `AI_ALLOW_MOCK_FALLBACK` must be `false`.
- `REDIS_PASSWORD` and database credentials must be non-default.
- `RATE_LIMIT_ENABLED` must be `true` with Redis backend.

---

## Vercel-only (hosted farmer / reviewer)

Set these five on the Vercel project (and in `apps/dashboard/.env.local` for `npm run dev`). Never commit values.

| Variable | Public? | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | Project URL, e.g. `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | yes | Publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **no** | yes | Server-only. Never `NEXT_PUBLIC_*` |
| `HF_TOKEN` | **no** | yes | Token that can invoke the private Space (`predict_api`) |
| `HF_SPACE_URL` | **no** | no | Defaults to `https://dhrrishitvdeka-fasal-pramaan-api.hf.space` |

**Leave unset on Vercel**

| Variable | Why |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Must not point at Docker `http://api:8000`. Empty = use Next routes (`/api/claims`). |
| `DATABASE_URL`, `REDIS_*`, `MINIO_*`, `JWT_SECRET_KEY` | Laptop Compose only |
| `GEMINI_API_KEY` | Fasal Saathi voice on FastAPI only |
| Maps / geocoding / weather keys | Not used. GPS is `navigator.geolocation`; map tiles are OSM. |
