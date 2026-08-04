"""Pure scheduling contract tests for recurring evidence reminders."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.evidence_reminders import should_send_reminder


def _plan(now: datetime, **overrides):
    values = {
        "is_active": True,
        "next_due_at": now + timedelta(days=3),
        "reminder_lead_days": 3,
        "last_notified_at": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_due_plan_sends_once_inside_lead_window():
    now = datetime(2026, 8, 4, 6, tzinfo=timezone.utc)
    plan = _plan(now)

    assert should_send_reminder(plan, now) is True

    plan.last_notified_at = now
    assert should_send_reminder(plan, now + timedelta(hours=1)) is False


def test_inactive_and_future_plans_do_not_send():
    now = datetime(2026, 8, 4, 6, tzinfo=timezone.utc)

    assert should_send_reminder(_plan(now, is_active=False), now) is False
    assert should_send_reminder(_plan(now, next_due_at=now + timedelta(days=20)), now) is False


def test_overdue_plan_repeats_no_more_than_weekly():
    now = datetime(2026, 8, 20, 6, tzinfo=timezone.utc)
    plan = _plan(
        now,
        next_due_at=now - timedelta(days=10),
        last_notified_at=now - timedelta(days=6),
    )
    assert should_send_reminder(plan, now) is False

    plan.last_notified_at = now - timedelta(days=7)
    assert should_send_reminder(plan, now) is True
