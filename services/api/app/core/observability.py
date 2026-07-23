"""Optional Sentry + OpenTelemetry hooks (xyz.md §4).

Activate only when env vars are set — no silent always-on stubs that hide misconfig.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("fasalpramaan.observability")

_initialized = False


def init_observability(settings: Any) -> dict[str, bool]:
    """Initialize crash reporting and tracing when configured.

    Returns which subsystems were activated.
    """
    global _initialized
    status = {"sentry": False, "otel": False}
    if _initialized:
        return status

    dsn = (getattr(settings, "sentry_dsn", None) or "").strip()
    if dsn:
        try:
            import sentry_sdk  # type: ignore

            sentry_sdk.init(
                dsn=dsn,
                environment=getattr(settings, "environment", "development"),
                traces_sample_rate=0.1,
            )
            status["sentry"] = True
            logger.info("sentry_initialized")
        except ImportError:
            logger.warning(
                "SENTRY_DSN set but sentry-sdk not installed; pip install sentry-sdk"
            )
        except Exception:  # noqa: BLE001
            logger.exception("sentry_init_failed")

    otel_ep = (getattr(settings, "otel_exporter_otlp_endpoint", None) or "").strip()
    if otel_ep:
        try:
            from opentelemetry import trace  # type: ignore
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import (  # type: ignore
                OTLPSpanExporter,
            )
            from opentelemetry.sdk.resources import Resource  # type: ignore
            from opentelemetry.sdk.trace import TracerProvider  # type: ignore
            from opentelemetry.sdk.trace.export import BatchSpanProcessor  # type: ignore

            resource = Resource.create(
                {"service.name": getattr(settings, "otel_service_name", "fasalpramaan-api")}
            )
            provider = TracerProvider(resource=resource)
            provider.add_span_processor(
                BatchSpanProcessor(OTLPSpanExporter(endpoint=otel_ep))
            )
            trace.set_tracer_provider(provider)
            status["otel"] = True
            logger.info("otel_initialized endpoint=%s", otel_ep)
        except ImportError:
            logger.warning(
                "OTEL_EXPORTER_OTLP_ENDPOINT set but OpenTelemetry packages missing"
            )
        except Exception:  # noqa: BLE001
            logger.exception("otel_init_failed")

    _initialized = True
    if not status["sentry"] and not status["otel"]:
        logger.info(
            "observability_inactive reason=no_SENTRY_DSN_or_OTEL_endpoint "
            "(set env to enable — see docs/deployment.md)"
        )
    return status
