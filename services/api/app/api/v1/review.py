"""Human review endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import joinedload

from app.core.deps import ROLE_ADMIN, ROLE_REVIEWER, DbSession, require_roles
from app.db.models import (
    AIPrediction,
    AuditLog,
    DamageAssessment,
    HumanReview,
    RecaptureRequest,
    Submission,
    User,
)
from app.schemas.common import Paginated
from app.schemas.submission import ReviewActionRequest, SubmissionOut
from app.api.v1.submissions import _serialize_submission
from app.services.audit import write_audit
from app.services.notifications import notify_user

router = APIRouter(prefix="/review", tags=["Review"])


@router.get("/queue", response_model=Paginated[SubmissionOut])
def review_queue(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_REVIEWER, ROLE_ADMIN)),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query("pending_review", alias="status"),
) -> Paginated[SubmissionOut]:
    q = db.query(Submission).filter(Submission.is_deleted.is_(False))
    if status_filter:
        q = q.filter(Submission.status == status_filter)
    else:
        q = q.filter(Submission.status.in_(["pending_review", "physical_inspection", "needs_recapture"]))
    total = q.count()
    rows = (
        q.options(joinedload(Submission.images))
        .order_by(Submission.created_at.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [_serialize_submission(db, s) for s in rows]
    pages = (total + page_size - 1) // page_size if total else 0
    return Paginated(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.get("/{submission_id}", response_model=SubmissionOut)
def review_detail(
    submission_id: str,
    db: DbSession,
    user: User = Depends(require_roles(ROLE_REVIEWER, ROLE_ADMIN)),
) -> SubmissionOut:
    sub = (
        db.query(Submission)
        .options(joinedload(Submission.images))
        .filter(Submission.id == submission_id, Submission.is_deleted.is_(False))
        .first()
    )
    if not sub:
        raise HTTPException(404, "Not found")
    return _serialize_submission(db, sub)


@router.post("/{submission_id}/action", response_model=SubmissionOut)
def review_action(
    submission_id: str,
    body: ReviewActionRequest,
    db: DbSession,
    user: User = Depends(require_roles(ROLE_REVIEWER, ROLE_ADMIN)),
) -> SubmissionOut:
    sub = db.query(Submission).filter(
        Submission.id == submission_id,
        Submission.is_deleted.is_(False),
    ).with_for_update().first()
    if not sub:
        raise HTTPException(404, "Not found")

    allowed_actions = {
        "pending_review": {"accept", "correct", "reject", "request_recapture", "physical_inspection", "inconclusive"},
        "physical_inspection": {"complete", "correct", "request_recapture", "inconclusive"},
        "needs_recapture": {"physical_inspection", "inconclusive"},
    }
    if body.action not in allowed_actions.get(sub.status, set()):
        raise HTTPException(409, f"Action {body.action} is not allowed for status {sub.status}")

    is_override = body.action in ("correct", "reject") or any(
        [
            body.corrected_crop,
            body.corrected_growth_stage,
            body.corrected_grade,
            body.corrected_damage_codes,
            body.corrected_severity,
            body.corrected_affected_area_pct,
        ]
    )
    if is_override and body.action != "accept" and not body.override_reason:
        raise HTTPException(400, "override_reason is required when overriding AI prediction")

    pred = (
        db.query(AIPrediction)
        .filter(AIPrediction.submission_id == sub.id)
        .order_by(AIPrediction.created_at.desc())
        .first()
    )

    if body.action == "accept":
        if not pred or pred.primary_damage in (None, "unknown") or pred.severity is None or pred.affected_area_pct is None:
            raise HTTPException(
                400,
                "AI result is incomplete; record a corrected human assessment instead of accepting it",
            )

    if body.action in ("correct", "complete"):
        primary = (body.corrected_damage_codes or [pred.primary_damage if pred else None])[0]
        severity = body.corrected_severity if body.corrected_severity is not None else (pred.severity if pred else None)
        area = body.corrected_affected_area_pct if body.corrected_affected_area_pct is not None else (pred.affected_area_pct if pred else None)
        if primary in (None, "unknown") or severity is None or area is None:
            raise HTTPException(
                400,
                "A final human assessment requires damage code, severity, and affected-area percentage",
            )

    review = HumanReview(
        submission_id=sub.id,
        reviewer_id=user.id,
        action=body.action,
        override_reason=body.override_reason,
        corrected_crop=body.corrected_crop,
        corrected_growth_stage=body.corrected_growth_stage,
        corrected_grade=body.corrected_grade,
        corrected_damage_codes=body.corrected_damage_codes,
        corrected_severity=body.corrected_severity,
        corrected_affected_area_pct=body.corrected_affected_area_pct,
        notes=body.notes,
        ai_prediction_id=pred.id if pred else None,
    )
    db.add(review)

    status_map = {
        "accept": "verified",
        "correct": "verified",
        "reject": "rejected",
        "request_recapture": "needs_recapture",
        "physical_inspection": "physical_inspection",
        "inconclusive": "physical_inspection",
        "complete": "verified",
    }
    sub.status = status_map.get(body.action, sub.status)

    if body.action == "accept":
        severity = pred.severity if pred else None
        primary = pred.primary_damage if pred else None
        codes = list((pred.damage_scores or {}).keys()) if pred and pred.damage_scores else None
        area = pred.affected_area_pct if pred else None
        conf = pred.overall_confidence if pred else None
        sub.final_severity = severity
        sub.severity = severity
        db.query(DamageAssessment).filter(
            DamageAssessment.submission_id == sub.id,
            DamageAssessment.is_final.is_(True),
        ).update({DamageAssessment.is_final: False}, synchronize_session=False)
        db.add(
            DamageAssessment(
                submission_id=sub.id,
                source="human",
                primary_damage_code=primary,
                damage_codes=codes,
                severity=severity,
                affected_area_pct=area,
                confidence=conf,
                notes=body.notes,
                assessed_by=user.id,
                is_final=True,
            )
        )
    elif body.action in ("correct", "complete"):
        severity = body.corrected_severity or (pred.severity if pred else None)
        area = body.corrected_affected_area_pct if body.corrected_affected_area_pct is not None else (pred.affected_area_pct if pred else None)
        damage_codes = body.corrected_damage_codes or (
            list((pred.damage_scores or {}).keys()) if pred and pred.damage_scores else None
        )
        sub.final_severity = severity
        sub.severity = severity
        sub.final_assessment_notes = body.notes or body.override_reason
        db.query(DamageAssessment).filter(
            DamageAssessment.submission_id == sub.id,
            DamageAssessment.is_final.is_(True),
        ).update({DamageAssessment.is_final: False}, synchronize_session=False)
        db.add(
            DamageAssessment(
                submission_id=sub.id,
                source="human",
                primary_damage_code=(damage_codes or [pred.primary_damage if pred else None])[0],
                damage_codes=damage_codes,
                severity=severity,
                affected_area_pct=area,
                notes=body.override_reason,
                assessed_by=user.id,
                is_final=True,
            )
        )
    elif body.action == "reject":
        # A rejected claim must never retain an earlier AI/human severity as a
        # seemingly final insurance outcome.
        sub.final_severity = None
        sub.severity = None
        sub.final_assessment_notes = body.notes or body.override_reason
        db.query(DamageAssessment).filter(
            DamageAssessment.submission_id == sub.id,
            DamageAssessment.is_final.is_(True),
        ).update({DamageAssessment.is_final: False}, synchronize_session=False)
    elif body.action == "request_recapture":
        db.add(
            RecaptureRequest(
                submission_id=sub.id,
                requested_by=user.id,
                reason=body.override_reason or body.notes or "Recapture requested",
                required_angles=["wide_field", "mid_canopy", "closeup_damage"],
                status="open",
            )
        )

    write_audit(
        db,
        action=f"review_{body.action}",
        entity_type="submission",
        entity_id=str(sub.id),
        actor_id=user.id,
        after=body.model_dump(mode="json"),
        notes=body.override_reason,
    )
    notify_user(
        db,
        user_id=sub.submitted_by,
        event_type="review_completed",
        title="Assessment updated",
        body=f"Your submission status is now: {sub.status}",
        title_hi="मूल्यांकन अपडेट",
        body_hi=f"आपकी प्रस्तुति की स्थिति अब: {sub.status}",
        related_submission_id=sub.id,
    )
    db.commit()
    sub = db.query(Submission).options(joinedload(Submission.images)).filter(Submission.id == sub.id).one()
    return _serialize_submission(db, sub)


@router.get("/{submission_id}/history")
def review_history(
    submission_id: str,
    db: DbSession,
    user: User = Depends(require_roles(ROLE_REVIEWER, ROLE_ADMIN)),
) -> dict:
    exists = db.query(Submission.id).filter(
        Submission.id == submission_id,
        Submission.is_deleted.is_(False),
    ).first()
    if not exists:
        raise HTTPException(404, "Not found")
    reviews = (
        db.query(HumanReview)
        .filter(HumanReview.submission_id == submission_id)
        .order_by(HumanReview.created_at.asc())
        .all()
    )
    audits = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "submission", AuditLog.entity_id == submission_id)
        .order_by(AuditLog.created_at.asc())
        .all()
    )
    return {
        "reviews": [
            {
                "id": str(r.id),
                "action": r.action,
                "reviewer_id": str(r.reviewer_id),
                "override_reason": r.override_reason,
                "notes": r.notes,
                "corrected_severity": r.corrected_severity,
                "corrected_crop": r.corrected_crop,
                "corrected_growth_stage": r.corrected_growth_stage,
                "corrected_grade": r.corrected_grade,
                "corrected_damage_codes": r.corrected_damage_codes,
                "corrected_affected_area_pct": r.corrected_affected_area_pct,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reviews
        ],
        "audit": [
            {
                "id": str(a.id),
                "action": a.action,
                "actor_id": str(a.actor_id) if a.actor_id else None,
                "notes": a.notes,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "after": a.after_json,
            }
            for a in audits
        ],
    }
