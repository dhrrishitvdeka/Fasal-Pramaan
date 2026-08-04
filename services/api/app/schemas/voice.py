"""Schemas for the Gemini Live farmer voice-assistant demo."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class VoiceSessionTokenOut(BaseModel):
    token: str
    model: str
    websocket_url: str
    expires_at: datetime
    new_session_expires_at: datetime
    session_id: UUID
    output_sample_rate_hz: int = 24_000
    # Browser clients should connect same-origin through the API proxy.
    proxy_path: str = "/api/v1/voice/live"
    use_proxy: bool = True


class VoiceActionAuditIn(BaseModel):
    session_id: UUID
    action: Literal[
        "navigate_to_screen",
        "change_language",
        "list_my_farms",
        "list_plots",
        "list_crop_types",
        "list_growth_stages",
        "list_crop_cycles",
        "list_my_submissions",
        "list_notifications",
        "list_evidence_reminders",
        "read_offline_queue",
        "begin_guided_capture",
        "read_capture_guidance",
        "capture_current_angle",
        "set_capture_observation",
        "save_guided_capture_offline",
        "prepare_sync_offline_queue",
        "prepare_finalize_submission",
        "prepare_create_farm",
        "prepare_create_plot",
        "prepare_create_crop_cycle",
        "prepare_update_evidence_reminder",
        "prepare_snooze_evidence_reminder",
        "prepare_mark_notification_read",
        "prepare_logout",
        "confirm_pending_action",
        "cancel_pending_action",
    ]
    outcome: Literal["succeeded", "failed", "confirmation_required", "cancelled"]
    entity_id: str | None = Field(default=None, max_length=128)


class VoiceActionAuditOut(BaseModel):
    recorded: bool = True
