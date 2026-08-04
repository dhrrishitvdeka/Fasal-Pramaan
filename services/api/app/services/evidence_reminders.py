"""Recurring evidence schedules and notification dispatch."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import (
    CropCycle,
    EvidenceReminderPlan,
    Farm,
    FarmerProfile,
    Plot,
    Submission,
)
from app.services.notifications import notify_user


def _now() -> datetime:
    return datetime.now(timezone.utc)


def farmer_cycle_query(db: Session, user_id: UUID):
    return (
        db.query(CropCycle)
        .join(Plot, Plot.id == CropCycle.plot_id)
        .join(Farm, Farm.id == Plot.farm_id)
        .join(FarmerProfile, FarmerProfile.id == Farm.farmer_id)
        .filter(
            FarmerProfile.user_id == user_id,
            FarmerProfile.is_deleted.is_(False),
            Farm.is_deleted.is_(False),
            Plot.is_deleted.is_(False),
            CropCycle.is_deleted.is_(False),
        )
    )


def farmer_owns_cycle(db: Session, user_id: UUID, cycle_id: UUID | str) -> CropCycle | None:
    return farmer_cycle_query(db, user_id).filter(CropCycle.id == cycle_id).first()


def ensure_reminder_plans_for_user(db: Session, user_id: UUID) -> list[EvidenceReminderPlan]:
    cycles = farmer_cycle_query(db, user_id).filter(CropCycle.status == "active").all()
    existing = {
        plan.crop_cycle_id: plan
        for plan in db.query(EvidenceReminderPlan).filter(EvidenceReminderPlan.user_id == user_id).all()
    }
    now = _now()
    for cycle in cycles:
        if cycle.id not in existing:
            plan = EvidenceReminderPlan(
                user_id=user_id,
                crop_cycle_id=cycle.id,
                next_due_at=now,
                cadence_days=30,
                target_photos=5,
                reminder_lead_days=3,
            )
            db.add(plan)
            existing[cycle.id] = plan
    db.flush()
    return list(existing.values())


def ensure_reminder_plan_for_cycle(db: Session, cycle: CropCycle) -> EvidenceReminderPlan | None:
    owner_user_id = (
        db.query(FarmerProfile.user_id)
        .join(Farm, Farm.farmer_id == FarmerProfile.id)
        .join(Plot, Plot.farm_id == Farm.id)
        .filter(Plot.id == cycle.plot_id)
        .scalar()
    )
    if owner_user_id is None:
        return None
    existing = db.query(EvidenceReminderPlan).filter(
        EvidenceReminderPlan.user_id == owner_user_id,
        EvidenceReminderPlan.crop_cycle_id == cycle.id,
    ).first()
    if existing:
        return existing
    plan = EvidenceReminderPlan(
        user_id=owner_user_id,
        crop_cycle_id=cycle.id,
        next_due_at=_now(),
        cadence_days=30,
        target_photos=5,
        reminder_lead_days=3,
    )
    db.add(plan)
    return plan


def advance_plan_for_submission(db: Session, submission: Submission) -> None:
    completed_at = submission.finalized_at or _now()
    plans = db.query(EvidenceReminderPlan).filter(
        EvidenceReminderPlan.crop_cycle_id == submission.crop_cycle_id,
        EvidenceReminderPlan.is_active.is_(True),
    ).all()
    for plan in plans:
        plan.last_completed_at = completed_at
        plan.next_due_at = completed_at + timedelta(days=plan.cadence_days)
        plan.last_notified_at = None


def should_send_reminder(plan: EvidenceReminderPlan, now: datetime) -> bool:
    if not plan.is_active:
        return False
    lead_at = plan.next_due_at - timedelta(days=plan.reminder_lead_days)
    if now < lead_at:
        return False
    if plan.last_notified_at is None:
        return True
    if plan.last_notified_at < lead_at:
        return True
    return now > plan.next_due_at and plan.last_notified_at <= now - timedelta(days=7)


def dispatch_due_evidence_reminders(db: Session, now: datetime | None = None) -> int:
    now = now or _now()
    candidates = (
        db.query(EvidenceReminderPlan)
        .filter(
            EvidenceReminderPlan.is_active.is_(True),
            EvidenceReminderPlan.next_due_at <= now + timedelta(days=7),
        )
        .with_for_update(skip_locked=True)
        .all()
    )
    sent = 0
    for plan in candidates:
        if not should_send_reminder(plan, now):
            continue
        overdue = now > plan.next_due_at
        cycle = db.query(CropCycle).filter(CropCycle.id == plan.crop_cycle_id).first()
        crop_name = cycle.crop_type.name if cycle and cycle.crop_type else "crop"
        notify_user(
            db,
            user_id=plan.user_id,
            event_type="evidence_capture_overdue" if overdue else "evidence_capture_due",
            title="Monthly crop evidence overdue" if overdue else "Monthly crop evidence is due",
            body=(
                f"Capture {plan.target_photos} fresh geo-tagged photos for your {crop_name} cycle now. "
                "Regular records help compare the field before and after a natural calamity."
            ),
            title_hi="मासिक फसल प्रमाण लंबित" if overdue else "मासिक फसल प्रमाण का समय",
            body_hi=(
                f"अपने {crop_name} फसल चक्र के लिए {plan.target_photos} नई GPS वाली तस्वीरें लें। "
                "नियमित रिकॉर्ड प्राकृतिक आपदा से पहले और बाद की स्थिति की तुलना में मदद करते हैं।"
            ),
            payload={
                "reminder_plan_id": str(plan.id),
                "crop_cycle_id": str(plan.crop_cycle_id),
                "target_photos": plan.target_photos,
                "due_at": plan.next_due_at.isoformat(),
                "route": f"/capture?crop_cycle_id={plan.crop_cycle_id}",
            },
        )
        plan.last_notified_at = now
        sent += 1
    db.commit()
    return sent


def latest_evidence_by_cycle(db: Session, user_id: UUID) -> dict[UUID, datetime | None]:
    return dict(
        db.query(Submission.crop_cycle_id, func.max(Submission.finalized_at))
        .filter(Submission.submitted_by == user_id, Submission.finalized_at.isnot(None))
        .group_by(Submission.crop_cycle_id)
        .all()
    )
