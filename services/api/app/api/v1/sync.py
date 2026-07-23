"""Offline sync endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.core.deps import CurrentUser, DbSession
from app.db.models import Submission, SyncOperation
from app.schemas.submission import SyncPushRequest, SyncPushResult

router = APIRouter(prefix="/sync", tags=["Sync"])


@router.post("/push", response_model=list[SyncPushResult])
def sync_push(body: SyncPushRequest, db: DbSession, user: CurrentUser) -> list[SyncPushResult]:
    results: list[SyncPushResult] = []
    for op in body.operations:
        existing = (
            db.query(SyncOperation)
            .filter(SyncOperation.user_id == user.id, SyncOperation.client_op_id == op.client_op_id)
            .first()
        )
        if existing:
            results.append(
                SyncPushResult(
                    client_op_id=op.client_op_id,
                    status=existing.status,
                    server_entity_id=existing.server_entity_id,
                    error_message=existing.error_message,
                )
            )
            continue
        status = "rejected"
        server_entity_id = None
        error_message = None
        if op.operation_type != "submission_finalize":
            error_message = "Unsupported operation_type; use domain endpoints to apply changes"
        else:
            candidate_id = op.payload.get("id") or op.payload.get("server_entity_id")
            sub = None
            if candidate_id:
                try:
                    submission_uuid = UUID(str(candidate_id))
                except (TypeError, ValueError):
                    submission_uuid = None
                if submission_uuid:
                    sub = db.query(Submission).filter(
                        Submission.id == submission_uuid,
                        Submission.is_deleted.is_(False),
                    ).first()
            if not sub:
                error_message = "Submission not found"
            else:
                from app.api.v1.submissions import _check_submission_access

                try:
                    _check_submission_access(db, user, str(sub.id))
                except HTTPException:  # authorization result is intentionally non-enumerating
                    error_message = "Submission not found"
                else:
                    server_entity_id = str(sub.id)
                    if sub.finalized_at is None:
                        status = "conflict"
                        error_message = "Submission has not been finalized by the domain endpoint"
                    else:
                        status = "acknowledged"

        row = SyncOperation(
            user_id=user.id,
            client_op_id=op.client_op_id,
            operation_type=op.operation_type,
            payload=op.payload,
            status=status,
            server_entity_id=server_entity_id,
            error_message=error_message,
        )
        db.add(row)
        results.append(
            SyncPushResult(
                client_op_id=op.client_op_id,
                status=status,
                server_entity_id=server_entity_id,
                error_message=error_message,
            )
        )
    db.commit()
    return results


@router.get("/status")
def sync_status(db: DbSession, user: CurrentUser) -> dict:
    pending = (
        db.query(SyncOperation)
        .filter(SyncOperation.user_id == user.id, SyncOperation.status.in_(["received", "conflict"]))
        .count()
    )
    total = db.query(SyncOperation).filter(SyncOperation.user_id == user.id).count()
    return {"pending": pending, "total": total}
