"""Recurring farmer evidence-reminder schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class EvidenceReminderUpdate(BaseModel):
    cadence_days: int = Field(default=30, ge=14, le=90)
    target_photos: int = Field(default=5, ge=4, le=5)
    reminder_lead_days: int = Field(default=3, ge=0, le=7)
    timezone_name: str = Field(default="Asia/Kolkata", min_length=3, max_length=64)
    is_active: bool = True


class EvidenceReminderOut(BaseModel):
    id: UUID
    crop_cycle_id: UUID
    crop_name: str | None = None
    season: str | None = None
    season_year: int | None = None
    cadence_days: int
    target_photos: int
    reminder_lead_days: int
    timezone_name: str
    is_active: bool
    next_due_at: datetime
    last_notified_at: datetime | None = None
    last_completed_at: datetime | None = None
    overdue: bool


class EvidenceReminderSnooze(BaseModel):
    days: int = Field(default=2, ge=1, le=7)
