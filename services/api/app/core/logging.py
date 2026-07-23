"""Structured logging setup with sensitive-field redaction."""

from __future__ import annotations

import json
import logging
import re
import sys
from datetime import datetime, timezone

from app.core.config import get_settings

# Redact secrets that may appear in messages or extras
_SENSITIVE_KEY_RE = re.compile(
    r"(password|passwd|secret|token|authorization|api[_-]?key|refresh_token|access_token|jwt|"
    r"phone|mobile|aadhaar|aadhar|pan|email|ssn|dob)",
    re.IGNORECASE,
)
_BEARER_RE = re.compile(r"(Bearer\s+)[A-Za-z0-9._\-+=/]+", re.IGNORECASE)
# Indian mobile (with optional +91) and Aadhaar-like 12-digit clusters
_PHONE_RE = re.compile(r"(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{9}(?!\d)")
_AADHAAR_RE = re.compile(r"(?<!\d)\d{4}\s?\d{4}\s?\d{4}(?!\d)")
_EMAIL_IN_MSG_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")


def sanitize_log_text(text: str) -> str:
    """Strip secrets and common PII from free-form log text (xyz.md §4)."""
    if not text:
        return text
    out = _BEARER_RE.sub(r"\1[REDACTED]", text)
    out = _PHONE_RE.sub("[PHONE_REDACTED]", out)
    out = _AADHAAR_RE.sub("[AADHAAR_REDACTED]", out)
    out = _EMAIL_IN_MSG_RE.sub("[EMAIL_REDACTED]", out)
    return out


def _redact_value(key: str, value: object) -> object:
    if _SENSITIVE_KEY_RE.search(str(key)):
        return "[REDACTED]"
    if isinstance(value, str):
        return sanitize_log_text(value)
    return value


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        msg = sanitize_log_text(record.getMessage())
        payload: dict = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": msg,
            "correlation_id": getattr(record, "correlation_id", "-"),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        standard_attrs = {
            "args",
            "asctime",
            "created",
            "exc_info",
            "filename",
            "funcName",
            "levelname",
            "levelno",
            "lineno",
            "module",
            "msecs",
            "message",
            "msg",
            "name",
            "pathname",
            "process",
            "processName",
            "relativeCreated",
            "stack_info",
            "thread",
            "threadName",
            "correlation_id",
        }
        for key, value in record.__dict__.items():
            if key not in standard_attrs and key not in payload:
                try:
                    redacted = _redact_value(key, value)
                    json.dumps(redacted)
                    payload[key] = redacted
                except (TypeError, OverflowError):
                    payload[key] = str(_redact_value(key, value))

        return json.dumps(payload, ensure_ascii=False)


def setup_logging() -> None:
    settings = get_settings()
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    root.setLevel(settings.log_level.upper())
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
