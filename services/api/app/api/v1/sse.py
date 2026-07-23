"""Server-Sent Events for processing status."""

from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

import anyio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.core.deps import get_current_user_short_lived
from app.db.models import Submission, User
from app.db.session import SessionLocal
from app.api.v1.submissions import _check_submission_access

router = APIRouter(prefix="/events", tags=["Events"])


def get_submission_status_sync(submission_id: str) -> dict | None:
    db = SessionLocal()
    try:
        sub = (
            db.query(Submission)
            .filter(Submission.id == submission_id, Submission.is_deleted.is_(False))
            .first()
        )
        if sub:
            return {
                "submission_id": str(sub.id),
                "status": sub.status,
                "severity": sub.severity,
                "submitted_by": str(sub.submitted_by),
            }
        return None
    finally:
        db.close()


@router.get("/submissions/{submission_id}/status")
async def submission_status_sse(
    submission_id: str,
    user: User = Depends(get_current_user_short_lived),
):
    # Authorize in a short-lived session before streaming. The polling loop
    # opens its own brief sessions, so an SSE client never occupies the pool.
    with SessionLocal() as db:
        sub = db.query(Submission).filter(Submission.id == submission_id, Submission.is_deleted.is_(False)).first()
        if not sub:
            raise HTTPException(404, "Submission not found")
        _check_submission_access(db, user, submission_id)

    async def event_stream() -> AsyncIterator[str]:
        last_status = None
        for _ in range(60):
            payload = await anyio.to_thread.run_sync(get_submission_status_sync, submission_id)
            if payload:
                safe = {
                    "submission_id": payload["submission_id"],
                    "status": payload["status"],
                    "severity": payload["severity"],
                }
                if safe["status"] != last_status:
                    last_status = safe["status"]
                    yield f"data: {json.dumps(safe)}\n\n"
                    if last_status in (
                        "verified",
                        "failed",
                        "pending_review",
                        "needs_recapture",
                        "physical_inspection",
                    ):
                        break
            await asyncio.sleep(1)
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
