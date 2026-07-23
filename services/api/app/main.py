"""FasalPramaan AI — FastAPI application entrypoint."""

from __future__ import annotations

import logging
import ipaddress
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
import redis
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app import __version__
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.core.rate_limit import limiter
from app.db.session import SessionLocal
from app.schemas.common import HealthOut
from app.services.storage import ensure_bucket, storage_health

setup_logging()
logger = logging.getLogger("fasalpramaan.api")
settings = get_settings()

try:
    from app.core.observability import init_observability

    init_observability(settings)
except Exception:  # noqa: BLE001
    logger.exception("observability_bootstrap_failed")


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        cid = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        request.state.correlation_id = cid
        start = time.perf_counter()
        response: Response = await call_next(request)
        response.headers["X-Correlation-ID"] = cid
        response.headers["X-Process-Time-Ms"] = str(int((time.perf_counter() - start) * 1000))
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        response.headers["Cache-Control"] = "no-store"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ensure_bucket()
    except Exception:  # noqa: BLE001
        logger.exception("evidence_storage_bootstrap_failed")
    yield


app = FastAPI(
    title="FasalPramaan AI API",
    description=(
        "FasalPramaan AI – Smart Crop Evidence and Assessment Platform (SVH26007). "
        "हर फसल का डिजिटल प्रमाण / Capture. Verify. Protect. "
        "AI is assistive and non-production unless explicitly validated."
    ),
    version=__version__,
    lifespan=lifespan,
    docs_url="/docs" if settings.api_docs_enabled else None,
    redoc_url="/redoc" if settings.api_docs_enabled else None,
    openapi_url="/openapi.json" if settings.api_docs_enabled else None,
)

cors_origins = list(settings.cors_origin_list)
allow_origin_regex = None
if settings.environment.lower() in ("development", "dev", "local", "test"):
    allow_origin_regex = r"http://(localhost|127\.0\.0\.1)(:\d+)?"

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Correlation-ID", "Idempotency-Key"],
)
app.include_router(api_router, prefix=settings.api_v1_prefix)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply per-IP sliding window limits (stricter on auth)."""

    async def dispatch(self, request: Request, call_next):
        path = str(request.scope.get("path") or "")
        if path.startswith(settings.api_v1_prefix):
            client = _client_ip(request)
            # Honour RATE_LIMIT_PER_MINUTE (floor 10 so misconfig cannot set 0)
            limit = max(int(settings.rate_limit_per_minute), 10)
            try:
                if "/auth/login" in path or "/auth/register" in path:
                    # Auth is stricter: at most 30/min or configured limit if lower
                    limiter.check(f"auth:{client}", min(30, limit), 60)
                else:
                    limiter.check(f"api:{client}", limit, 60)
            except Exception as exc:
                if hasattr(exc, "status_code"):
                    return JSONResponse(
                        status_code=exc.status_code,
                        content={"error": "rate_limited", "detail": getattr(exc, "detail", "Rate limited")},
                    )
                raise
        return await call_next(request)


app.add_middleware(RateLimitMiddleware)
# Keep correlation/security headers outermost so early rate-limit responses are
# covered as well.
app.add_middleware(CorrelationIdMiddleware)


def _client_ip(request: Request) -> str:
    """Trust X-Forwarded-For only when the immediate peer is explicitly trusted."""
    peer = request.client.host if request.client else "unknown"
    try:
        peer_ip = ipaddress.ip_address(peer)
    except ValueError:
        return peer
    trusted = False
    for entry in settings.trusted_proxy_list:
        try:
            if peer_ip in ipaddress.ip_network(entry, strict=False):
                trusted = True
                break
        except ValueError:
            logger.warning("ignored_invalid_trusted_proxy entry=%s", entry)
    if trusted:
        forwarded = request.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
        try:
            return str(ipaddress.ip_address(forwarded))
        except ValueError:
            pass
    return str(peer_ip)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    cid = getattr(request.state, "correlation_id", "-")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": "http_error", "detail": exc.detail, "correlation_id": cid},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    cid = getattr(request.state, "correlation_id", "-")
    return JSONResponse(
        status_code=422,
        content={"error": "validation_error", "detail": exc.errors(), "correlation_id": cid},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    cid = getattr(request.state, "correlation_id", "-")
    logger.exception("unhandled_error correlation_id=%s", cid)
    # Do not leak internal exception strings to clients
    detail = "An unexpected error occurred"
    if settings.environment == "development":
        detail = f"{type(exc).__name__}: internal error (see server logs)"
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "detail": detail, "correlation_id": cid},
    )


@app.get("/health", response_model=HealthOut, tags=["Health"])
def health(response: Response) -> HealthOut:
    checks: dict[str, str] = {}
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:  # noqa: BLE001
        # Do not leak connection strings / driver internals to clients
        logger.exception("health_check_database_failed")
        checks["database"] = "error"
    try:
        redis.Redis.from_url(settings.redis_url, socket_timeout=2).ping()
        checks["redis"] = "ok"
    except Exception:  # noqa: BLE001
        checks["redis"] = "error"
    checks["storage"] = "ok" if storage_health() else "error"
    try:
        headers = {"X-Service-Token": settings.ai_service_token} if settings.ai_service_token else None
        ai_response = httpx.get(f"{settings.ai_service_url}/health", headers=headers, timeout=3.0)
        checks["ai"] = "ok" if ai_response.status_code == 200 else "error"
    except Exception:  # noqa: BLE001
        checks["ai"] = "error"
    status = "ok" if all(value == "ok" for value in checks.values()) else "degraded"
    if status != "ok":
        response.status_code = 503
    return HealthOut(
        status=status,
        service="fasalpramaan-api",
        version=__version__,
        checks=checks,
        timestamp=datetime.now(timezone.utc),
    )


@app.get("/", tags=["Health"])
def root() -> dict:
    payload = {
        "name": "FasalPramaan AI",
        "hindi": "फसल प्रमाण",
        "tagline_en": "Capture. Verify. Protect.",
        "tagline_hi": "हर फसल का डिजिटल प्रमाण",
        "api": settings.api_v1_prefix,
    }
    if settings.api_docs_enabled:
        payload["docs"] = "/docs"
    return payload
