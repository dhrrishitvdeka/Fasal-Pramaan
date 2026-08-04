"""Gemini Live ephemeral-token provisioning.

The API key never leaves this service. The returned token can start one
constrained Live API session and expires quickly.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
import time
from typing import Any
from uuid import UUID, uuid4

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

_TOKEN_ATTEMPTS = 3
_TOKEN_RETRY_DELAYS_SECONDS = (0.35, 1.0)
_RETRYABLE_STATUS_CODES = {408, 429, 500, 502, 503, 504}

# Token provisioning currently lives on v1alpha even though constrained Live
# WebSocket sessions use the v1beta BidiGenerateContentConstrained endpoint.
GEMINI_AUTH_TOKENS_URL = "https://generativelanguage.googleapis.com/v1alpha/auth_tokens"
GEMINI_LIVE_WEBSOCKET_URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService."
    "BidiGenerateContentConstrained"
)

SYSTEM_INSTRUCTION = """
You are the FasalPramaan spoken assistant for an authenticated farmer.
Speak in the farmer's language, preferring concise Hindi or English and simple
agricultural words. This is a demonstration assistant, not an authority that
approves claims, insurance, payouts, crop diagnoses, or government benefits.
Never invent app data or imply that model output is human-verified. Crop-health
results always require the existing human-review workflow.

Keep spoken replies short and clearly structured: prefer 1–3 short sentences, or
a brief list of concrete options the farmer can choose. Always put a normal
space between every word — especially in Hindi (say "खेत की जानकारी", never
"खेतकीजानकारी"). Pause naturally between options so the transcript is readable.

Use only the declared functions to inspect or operate the app. Read-only tools,
allowlisted navigation, and an explicitly requested camera shutter may run
immediately. For any server write, upload, final submission, or logout, call
the matching prepare function, explain exactly what will happen, and wait
for an explicit yes/no response before calling confirm_pending_action. Never
treat silence, background speech, or an ambiguous response as confirmation.
If a tool fails, explain the failure without claiming it succeeded. When the
capture screen is active, guide one angle at a time and call
capture_current_angle only after the farmer clearly asks to take the photo.
""".strip()


def _object_schema(properties: dict[str, Any] | None = None, required: list[str] | None = None) -> dict[str, Any]:
    schema: dict[str, Any] = {"type": "OBJECT", "properties": properties or {}}
    if required:
        schema["required"] = required
    return schema


FUNCTION_DECLARATIONS: list[dict[str, Any]] = [
    {
        "name": "navigate_to_screen",
        "description": "Open an allowlisted farmer screen.",
        "parameters": _object_schema(
            {
                "screen": {
                    "type": "STRING",
                    "enum": [
                        "home",
                        "farms",
                        "capture",
                        "queue",
                        "results",
                        "notifications",
                        "settings",
                        "help",
                        "profile",
                        "reminders",
                    ],
                }
            },
            ["screen"],
        ),
    },
    {
        "name": "change_language",
        "description": "Switch the visible farmer app language between English and Hindi.",
        "parameters": _object_schema(
            {"language_code": {"type": "STRING", "enum": ["en", "hi"]}},
            ["language_code"],
        ),
    },
    {
        "name": "list_my_farms",
        "description": "Read the authenticated farmer's farms.",
        "parameters": _object_schema(),
    },
    {
        "name": "list_plots",
        "description": "Read plots belonging to one of the farmer's farms.",
        "parameters": _object_schema(
            {"farm_id": {"type": "STRING", "description": "Exact farm identifier."}},
            ["farm_id"],
        ),
    },
    {
        "name": "list_crop_types",
        "description": "Read supported crop types and identifiers before creating a crop cycle.",
        "parameters": _object_schema(),
    },
    {
        "name": "list_growth_stages",
        "description": "Read supported growth stages, optionally filtered by crop type.",
        "parameters": _object_schema(
            {"crop_type_id": {"type": "STRING", "description": "Optional exact crop-type identifier."}}
        ),
    },
    {
        "name": "list_crop_cycles",
        "description": "Read the farmer's crop cycles and their identifiers.",
        "parameters": _object_schema(),
    },
    {
        "name": "list_my_submissions",
        "description": "Read the farmer's evidence submissions and statuses.",
        "parameters": _object_schema(),
    },
    {
        "name": "list_notifications",
        "description": "Read the farmer's recent in-app notifications.",
        "parameters": _object_schema(),
    },
    {
        "name": "list_evidence_reminders",
        "description": "Read recurring evidence plans, due dates, and overdue status.",
        "parameters": _object_schema(),
    },
    {
        "name": "read_offline_queue",
        "description": "Read how many encrypted evidence drafts are waiting locally.",
        "parameters": _object_schema(),
    },
    {
        "name": "begin_guided_capture",
        "description": "Open guided evidence capture for a crop cycle.",
        "parameters": _object_schema(
            {"crop_cycle_id": {"type": "STRING", "description": "Exact crop-cycle identifier."}},
            ["crop_cycle_id"],
        ),
    },
    {
        "name": "read_capture_guidance",
        "description": "Read the current capture angle, spoken instruction, and progress.",
        "parameters": _object_schema(),
    },
    {
        "name": "capture_current_angle",
        "description": "Take the current guided-capture photo after the farmer asks to capture it.",
        "parameters": _object_schema(),
    },
    {
        "name": "set_capture_observation",
        "description": "Set the farmer's spoken field observation on the open capture draft.",
        "parameters": _object_schema(
            {"observation": {"type": "STRING", "description": "Farmer's observation in their words."}},
            ["observation"],
        ),
    },
    {
        "name": "save_guided_capture_offline",
        "description": "Save a completed five-angle capture as encrypted offline evidence.",
        "parameters": _object_schema(),
    },
    {
        "name": "prepare_create_farm",
        "description": "Prepare, but do not create, a farm record. Requires later confirmation.",
        "parameters": _object_schema(
            {
                "name": {"type": "STRING"},
                "total_area_hectares": {"type": "NUMBER"},
                "notes": {"type": "STRING"},
            },
            ["name"],
        ),
    },
    {
        "name": "prepare_create_plot",
        "description": "Prepare, but do not create, a plot on a farm. Requires later confirmation.",
        "parameters": _object_schema(
            {
                "farm_id": {"type": "STRING"},
                "name": {"type": "STRING"},
                "area_hectares": {"type": "NUMBER"},
                "soil_type": {"type": "STRING"},
                "irrigation_type": {"type": "STRING"},
            },
            ["farm_id", "name"],
        ),
    },
    {
        "name": "prepare_create_crop_cycle",
        "description": "Prepare, but do not start, a crop cycle. Requires later confirmation.",
        "parameters": _object_schema(
            {
                "plot_id": {"type": "STRING"},
                "crop_type_id": {"type": "STRING"},
                "season_year": {"type": "INTEGER"},
                "season": {"type": "STRING", "enum": ["kharif", "rabi", "zaid"]},
                "growth_stage_id": {"type": "STRING"},
            },
            ["plot_id", "crop_type_id", "season_year", "season"],
        ),
    },
    {
        "name": "prepare_update_evidence_reminder",
        "description": "Prepare recurring evidence settings. Requires later confirmation.",
        "parameters": _object_schema(
            {
                "crop_cycle_id": {"type": "STRING"},
                "cadence_days": {"type": "INTEGER"},
                "target_photos": {"type": "INTEGER", "minimum": 4, "maximum": 5},
                "reminder_lead_days": {"type": "INTEGER"},
                "is_active": {"type": "BOOLEAN"},
            },
            ["crop_cycle_id", "cadence_days", "target_photos", "reminder_lead_days", "is_active"],
        ),
    },
    {
        "name": "prepare_snooze_evidence_reminder",
        "description": "Prepare a one-to-seven-day reminder snooze. Requires later confirmation.",
        "parameters": _object_schema(
            {"crop_cycle_id": {"type": "STRING"}, "days": {"type": "INTEGER"}},
            ["crop_cycle_id", "days"],
        ),
    },
    {
        "name": "prepare_mark_notification_read",
        "description": "Prepare marking one notification as read. Requires later confirmation.",
        "parameters": _object_schema(
            {"notification_id": {"type": "STRING"}}, ["notification_id"]
        ),
    },
    {
        "name": "prepare_logout",
        "description": "Prepare a secure logout from this device. Requires later confirmation.",
        "parameters": _object_schema(),
    },
    {
        "name": "prepare_sync_offline_queue",
        "description": "Prepare, but do not start, upload of queued offline evidence.",
        "parameters": _object_schema(),
    },
    {
        "name": "prepare_finalize_submission",
        "description": "Prepare, but do not finalize, a specific uploaded submission.",
        "parameters": _object_schema(
            {"submission_id": {"type": "STRING", "description": "Exact submission identifier."}},
            ["submission_id"],
        ),
    },
    {
        "name": "confirm_pending_action",
        "description": "Execute the single pending sensitive action after an explicit spoken yes.",
        "parameters": _object_schema(),
    },
    {
        "name": "cancel_pending_action",
        "description": "Cancel the pending sensitive action after a no or cancellation request.",
        "parameters": _object_schema(),
    },
]


class GeminiLiveUnavailable(RuntimeError):
    """Safe-to-report token provisioning failure."""


@dataclass(frozen=True)
class GeminiEphemeralSession:
    token: str
    model: str
    websocket_url: str
    expires_at: datetime
    new_session_expires_at: datetime
    session_id: UUID


def _utc_rfc3339(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def create_ephemeral_session(settings: Settings) -> GeminiEphemeralSession:
    if not settings.voice_assistant_enabled:
        raise GeminiLiveUnavailable("Voice assistant is not enabled")
    api_key = settings.gemini_api_key.get_secret_value().strip()
    if not api_key:
        raise GeminiLiveUnavailable("Voice assistant is not configured")

    now = datetime.now(timezone.utc)
    duration = max(5, min(settings.gemini_live_session_minutes, 30))
    expires_at = now + timedelta(minutes=duration)
    new_session_expires_at = now + timedelta(minutes=1)
    model = settings.gemini_live_model.removeprefix("models/")
    auth_token = {
        "uses": 1,
        "expireTime": _utc_rfc3339(expires_at),
        "newSessionExpireTime": _utc_rfc3339(new_session_expires_at),
        "bidiGenerateContentSetup": {
            "model": f"models/{model}",
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {"voiceName": settings.gemini_live_voice}
                    }
                },
            },
            "inputAudioTranscription": {},
            "outputAudioTranscription": {},
            "sessionResumption": {},
            "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
            "tools": [{"functionDeclarations": FUNCTION_DECLARATIONS}],
        },
    }
    # The REST create endpoint parses the request body directly as AuthToken
    # (the SDK wraps this detail behind auth_tokens.create()).
    request_body = auth_token

    try:
        with httpx.Client(timeout=httpx.Timeout(15.0, connect=10.0)) as client:
            payload: Any = None
            for attempt in range(1, _TOKEN_ATTEMPTS + 1):
                try:
                    response = client.post(
                        GEMINI_AUTH_TOKENS_URL,
                        headers={
                            "x-goog-api-key": api_key,
                            "Content-Type": "application/json",
                        },
                        json=request_body,
                    )
                    response.raise_for_status()
                    payload = response.json()
                    break
                except httpx.HTTPStatusError as exc:
                    status_code = exc.response.status_code
                    retryable = status_code in _RETRYABLE_STATUS_CODES
                    logger.warning(
                        "Gemini token request failed status=%s attempt=%s retryable=%s",
                        status_code,
                        attempt,
                        retryable,
                    )
                    if not retryable or attempt >= _TOKEN_ATTEMPTS:
                        raise
                except (httpx.RequestError, ValueError) as exc:
                    logger.warning(
                        "Gemini token request failed type=%s attempt=%s",
                        type(exc).__name__,
                        attempt,
                    )
                    if attempt >= _TOKEN_ATTEMPTS:
                        raise

                time.sleep(_TOKEN_RETRY_DELAYS_SECONDS[attempt - 1])
    except (httpx.HTTPError, ValueError) as exc:
        raise GeminiLiveUnavailable(
            "Voice service is temporarily unavailable. Please try again."
        ) from exc

    token = payload.get("name") if isinstance(payload, dict) else None
    if not isinstance(token, str) or not token:
        raise GeminiLiveUnavailable("Gemini Live returned an invalid session token")
    return GeminiEphemeralSession(
        token=token,
        model=model,
        websocket_url=GEMINI_LIVE_WEBSOCKET_URL,
        expires_at=expires_at,
        new_session_expires_at=new_session_expires_at,
        session_id=uuid4(),
    )
