"""Dashboard analytics and map endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, text
from sqlalchemy.orm import aliased

from app.core.deps import ROLE_ADMIN, ROLE_REVIEWER, CurrentUser, DbSession, require_roles
from app.db.models import AIPrediction, Alert, CropCycle, CropType, Farm, Jurisdiction, Notification, Plot, Submission, User
from app.schemas.submission import MapMarkerOut
import csv
import io

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _latest_prediction_subquery(db: DbSession):
    return (
        db.query(
            AIPrediction.submission_id.label("submission_id"),
            func.max(AIPrediction.created_at).label("created_at"),
        )
        .group_by(AIPrediction.submission_id)
        .subquery()
    )


@router.get("/overview")
def overview(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_REVIEWER, ROLE_ADMIN)),
) -> dict:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    total = db.query(Submission).filter(Submission.is_deleted.is_(False)).count()
    today = (
        db.query(Submission)
        .filter(Submission.is_deleted.is_(False), Submission.created_at >= today_start)
        .count()
    )
    active = Submission.is_deleted.is_(False)
    pending_ai = db.query(Submission).filter(active, Submission.status.in_(["uploaded", "processing"])).count()
    pending_review = db.query(Submission).filter(active, Submission.status == "pending_review").count()
    verified = db.query(Submission).filter(active, Submission.status == "verified").count()
    recapture = db.query(Submission).filter(active, Submission.status == "needs_recapture").count()
    high_sev = db.query(Submission).filter(active, Submission.severity.in_(["high", "severe", "critical"])).count()
    failed = db.query(Submission).filter(active, Submission.status == "failed").count()

    avg_proc = db.execute(
        text(
            """
            SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) AS avg_sec
            FROM ai_jobs WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
            """
        )
    ).scalar()

    top_crop = db.execute(
        text(
            """
            SELECT ct.code, COUNT(*) AS c
            FROM submissions s
            JOIN crop_cycles cc ON cc.id = s.crop_cycle_id
            JOIN crop_types ct ON ct.id = cc.crop_type_id
            WHERE s.is_deleted = false
              AND s.severity IS NOT NULL AND s.severity <> 'none'
            GROUP BY ct.code ORDER BY c DESC LIMIT 1
            """
        )
    ).first()

    latest = _latest_prediction_subquery(db)
    latest_predictions = db.query(AIPrediction).join(
        latest,
        and_(
            AIPrediction.submission_id == latest.c.submission_id,
            AIPrediction.created_at == latest.c.created_at,
        ),
    ).join(Submission, Submission.id == AIPrediction.submission_id).filter(Submission.is_deleted.is_(False))
    low_conf = latest_predictions.filter(
        AIPrediction.overall_confidence.isnot(None),
        AIPrediction.overall_confidence < 0.55,
    ).count()
    pred_total = latest_predictions.count() or 1

    top_district = db.execute(
        text(
            """
            SELECT d.name, COUNT(*) AS c
            FROM submissions s
            JOIN crop_cycles cc ON cc.id = s.crop_cycle_id
            JOIN plots p ON p.id = cc.plot_id AND p.is_deleted = false
            JOIN farms f ON f.id = p.farm_id AND f.is_deleted = false
            JOIN jurisdictions v ON v.id = f.village_id AND v.is_deleted = false
            JOIN jurisdictions b ON b.id = v.parent_id AND b.is_deleted = false
            JOIN jurisdictions d ON d.id = b.parent_id AND d.level = 'district' AND d.is_deleted = false
            WHERE s.is_deleted = false AND s.severity IS NOT NULL AND s.severity <> 'none'
            GROUP BY d.name ORDER BY c DESC LIMIT 1
            """
        )
    ).first()

    return {
        "total_submissions": total,
        "submissions_today": today,
        "pending_ai_processing": pending_ai,
        "pending_human_review": pending_review,
        "verified_assessments": verified,
        "recapture_requests": recapture,
        "high_severity_cases": high_sev,
        "average_processing_seconds": float(avg_proc or 0),
        "most_affected_crop": top_crop.code if top_crop else None,
        "most_affected_district": top_district.name if top_district else None,
        "low_confidence_rate": round(low_conf / pred_total, 3),
        "submission_failure_rate": round(failed / max(total, 1), 3),
    }


@router.get("/map/markers", response_model=list[MapMarkerOut])
def map_markers(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_REVIEWER, ROLE_ADMIN)),
    status: str | None = None,
    severity: str | None = None,
    crop: str | None = None,
    damage: str | None = None,
    district: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[MapMarkerOut]:
    latest = _latest_prediction_subquery(db)
    prediction = aliased(AIPrediction)
    village = aliased(Jurisdiction)
    block = aliased(Jurisdiction)
    district_row = aliased(Jurisdiction)
    q = (
        db.query(Submission, prediction, CropType)
        .join(CropCycle, CropCycle.id == Submission.crop_cycle_id)
        .join(CropType, CropType.id == CropCycle.crop_type_id)
        .join(Plot, Plot.id == CropCycle.plot_id)
        .join(Farm, Farm.id == Plot.farm_id)
        .outerjoin(village, village.id == Farm.village_id)
        .outerjoin(block, block.id == village.parent_id)
        .outerjoin(district_row, and_(district_row.id == block.parent_id, district_row.level == "district"))
        .outerjoin(latest, latest.c.submission_id == Submission.id)
        .outerjoin(
            prediction,
            and_(
                prediction.submission_id == latest.c.submission_id,
                prediction.created_at == latest.c.created_at,
            ),
        )
        .filter(
        Submission.is_deleted.is_(False),
        Plot.is_deleted.is_(False),
        Farm.is_deleted.is_(False),
        Submission.capture_lat.isnot(None),
        Submission.capture_lon.isnot(None),
        )
    )
    if status:
        q = q.filter(Submission.status == status)
    if severity:
        q = q.filter(Submission.severity == severity)
    if crop:
        q = q.filter(CropType.code == crop)
    if damage:
        q = q.filter(prediction.primary_damage == damage)
    if district:
        q = q.filter((district_row.code == district) | (district_row.name.ilike(district)))
    if date_from:
        q = q.filter(Submission.created_at >= date_from)
    if date_to:
        q = q.filter(Submission.created_at <= date_to)
    rows = q.order_by(Submission.created_at.desc()).limit(1000).all()
    markers: list[MapMarkerOut] = []
    for s, pred, crop_type in rows:
        markers.append(
            MapMarkerOut(
                id=s.id,
                lat=float(s.capture_lat),
                lon=float(s.capture_lon),
                status=s.status,
                severity=s.severity or (pred.severity if pred else None),
                crop_code=crop_type.code,
                primary_damage=pred.primary_damage if pred else None,
                confidence=pred.overall_confidence if pred else None,
                created_at=s.created_at,
            )
        )
    return markers


@router.get("/analytics/damage-by-category")
def damage_by_category(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_REVIEWER, ROLE_ADMIN)),
) -> list[dict]:
    latest = _latest_prediction_subquery(db)
    preds = (
        db.query(AIPrediction)
        .join(latest, and_(AIPrediction.submission_id == latest.c.submission_id, AIPrediction.created_at == latest.c.created_at))
        .join(Submission, Submission.id == AIPrediction.submission_id)
        .filter(Submission.is_deleted.is_(False))
        .all()
    )
    counts: dict[str, int] = {}
    for p in preds:
        if p.primary_damage:
            counts[p.primary_damage] = counts.get(p.primary_damage, 0) + 1
    return [{"category": k, "count": v} for k, v in sorted(counts.items(), key=lambda x: -x[1])]


@router.get("/analytics/severity-distribution")
def severity_distribution(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_REVIEWER, ROLE_ADMIN)),
) -> list[dict]:
    rows = (
        db.query(Submission.severity, func.count(Submission.id))
        .filter(Submission.is_deleted.is_(False), Submission.severity.isnot(None))
        .group_by(Submission.severity)
        .all()
    )
    return [{"severity": r[0], "count": r[1]} for r in rows]


@router.get("/analytics/by-crop")
def damage_by_crop(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_REVIEWER, ROLE_ADMIN)),
) -> list[dict]:
    rows = db.execute(
        text(
            """
            SELECT ct.code, ct.name, COUNT(s.id) AS c
            FROM submissions s
            JOIN crop_cycles cc ON cc.id = s.crop_cycle_id
            JOIN crop_types ct ON ct.id = cc.crop_type_id
            WHERE s.is_deleted = false
              AND s.severity IS NOT NULL AND s.severity <> 'none'
            GROUP BY ct.code, ct.name ORDER BY c DESC
            """
        )
    ).all()
    return [{"crop_code": r.code, "crop_name": r.name, "count": r.c} for r in rows]


@router.get("/alerts")
def alert_feed(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_REVIEWER, ROLE_ADMIN)),
    limit: int = Query(50, ge=1, le=200),
) -> list[dict]:
    rows = db.query(Alert).order_by(Alert.created_at.desc()).limit(limit).all()
    return [
        {
            "id": str(a.id),
            "alert_type": a.alert_type,
            "severity": a.severity,
            "title": a.title,
            "message": a.message,
            "is_acknowledged": a.is_acknowledged,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "submission_id": str(a.submission_id) if a.submission_id else None,
        }
        for a in rows
    ]


@router.get("/export/submissions.csv")
def export_csv(
    db: DbSession,
    user: User = Depends(require_roles(ROLE_REVIEWER, ROLE_ADMIN)),
):
    rows = db.query(Submission).filter(Submission.is_deleted.is_(False)).order_by(Submission.created_at.desc()).limit(5000).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "status", "severity", "lat", "lon", "created_at", "finalized_at"])
    for s in rows:
        writer.writerow(
            [
                str(s.id),
                s.status,
                s.severity or "",
                s.capture_lat or "",
                s.capture_lon or "",
                s.created_at.isoformat() if s.created_at else "",
                s.finalized_at.isoformat() if s.finalized_at else "",
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=fasalpramaan_submissions.csv"},
    )


@router.get("/notifications")
def my_notifications(db: DbSession, user: CurrentUser, unread_only: bool = False) -> list[dict]:
    q = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    rows = q.order_by(Notification.created_at.desc()).limit(100).all()
    return [
        {
            "id": str(n.id),
            "event_type": n.event_type,
            "title": n.title,
            "body": n.body,
            "title_hi": n.title_hi,
            "body_hi": n.body_hi,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "related_submission_id": str(n.related_submission_id) if n.related_submission_id else None,
        }
        for n in rows
    ]


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: str, db: DbSession, user: CurrentUser) -> dict:
    n = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == user.id).first()
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}
