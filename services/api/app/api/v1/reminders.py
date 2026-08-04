"""Farmer evidence-reminder plan endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import joinedload

from app.core.deps import ROLE_FARMER, DbSession, require_roles
from app.db.models import CropCycle, EvidenceReminderPlan, User
from app.schemas.reminder import EvidenceReminderOut, EvidenceReminderSnooze, EvidenceReminderUpdate
from app.services.audit import write_audit
from app.services.evidence_reminders import ensure_reminder_plans_for_user, farmer_owns_cycle

router = APIRouter(prefix="/evidence-reminders", tags=["evidence-reminders"])


def _serialize(plan: EvidenceReminderPlan) -> EvidenceReminderOut:
    cycle = plan.crop_cycle
    return EvidenceReminderOut(
        id=plan.id,
        crop_cycle_id=plan.crop_cycle_id,
        crop_name=cycle.crop_type.name if cycle and cycle.crop_type else None,
        season=cycle.season if cycle else None,
        season_year=cycle.season_year if cycle else None,
        cadence_days=plan.cadence_days,
        target_photos=plan.target_photos,
        reminder_lead_days=plan.reminder_lead_days,
        timezone_name=plan.timezone_name,
        is_active=plan.is_active,
        next_due_at=plan.next_due_at,
        last_notified_at=plan.last_notified_at,
        last_completed_at=plan.last_completed_at,
        overdue=plan.is_active and plan.next_due_at < datetime.now(timezone.utc),
    )


@router.get("", response_model=list[EvidenceReminderOut])
def list_reminders(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_FARMER)),
) -> list[EvidenceReminderOut]:
    ensure_reminder_plans_for_user(db, user.id)
    db.commit()
    plans = (
        db.query(EvidenceReminderPlan)
        .options(joinedload(EvidenceReminderPlan.crop_cycle).joinedload(CropCycle.crop_type))
        .filter(EvidenceReminderPlan.user_id == user.id)
        .order_by(EvidenceReminderPlan.next_due_at)
        .all()
    )
    return [_serialize(plan) for plan in plans]


@router.put("/{cycle_id}", response_model=EvidenceReminderOut)
def update_reminder(
    cycle_id: UUID,
    body: EvidenceReminderUpdate,
    db: DbSession,
    user: User = Depends(require_roles(ROLE_FARMER)),
) -> EvidenceReminderOut:
    cycle = farmer_owns_cycle(db, user.id, cycle_id)
    if not cycle:
        raise HTTPException(404, "Crop cycle not found")
    plan = db.query(EvidenceReminderPlan).filter(
        EvidenceReminderPlan.user_id == user.id,
        EvidenceReminderPlan.crop_cycle_id == cycle_id,
    ).first()
    if not plan:
        plan = EvidenceReminderPlan(user_id=user.id, crop_cycle_id=cycle_id, next_due_at=datetime.now(timezone.utc))
        db.add(plan)
    before = {
        "cadence_days": plan.cadence_days,
        "target_photos": plan.target_photos,
        "is_active": plan.is_active,
    }
    for key, value in body.model_dump().items():
        setattr(plan, key, value)
    if plan.is_active and plan.next_due_at < datetime.now(timezone.utc) - timedelta(days=90):
        plan.next_due_at = datetime.now(timezone.utc)
    write_audit(
        db,
        action="update_evidence_reminder",
        entity_type="evidence_reminder_plan",
        entity_id=str(plan.id),
        actor_id=user.id,
        before=before,
        after=body.model_dump(mode="json"),
    )
    db.commit()
    db.refresh(plan)
    plan.crop_cycle = cycle
    return _serialize(plan)


@router.post("/{cycle_id}/snooze", response_model=EvidenceReminderOut)
def snooze_reminder(
    cycle_id: UUID,
    body: EvidenceReminderSnooze,
    db: DbSession,
    user: User = Depends(require_roles(ROLE_FARMER)),
) -> EvidenceReminderOut:
    cycle = farmer_owns_cycle(db, user.id, cycle_id)
    if not cycle:
        raise HTTPException(404, "Crop cycle not found")
    plan = db.query(EvidenceReminderPlan).filter(
        EvidenceReminderPlan.user_id == user.id,
        EvidenceReminderPlan.crop_cycle_id == cycle_id,
    ).first()
    if not plan:
        raise HTTPException(404, "Reminder plan not found")
    plan.next_due_at = max(plan.next_due_at, datetime.now(timezone.utc)) + timedelta(days=body.days)
    plan.last_notified_at = None
    write_audit(
        db,
        action="snooze_evidence_reminder",
        entity_type="evidence_reminder_plan",
        entity_id=str(plan.id),
        actor_id=user.id,
        after={"days": body.days, "next_due_at": plan.next_due_at.isoformat()},
    )
    db.commit()
    db.refresh(plan)
    plan.crop_cycle = cycle
    return _serialize(plan)
