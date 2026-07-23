"""In-app notifications + console email provider."""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models import Notification

logger = logging.getLogger(__name__)


def notify_user(
    db: Session,
    *,
    user_id: UUID,
    event_type: str,
    title: str,
    body: str,
    title_hi: Optional[str] = None,
    body_hi: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
    related_submission_id: Optional[UUID] = None,
    channel: str = "in_app",
) -> Notification:
    n = Notification(
        user_id=user_id,
        event_type=event_type,
        title=title,
        body=body,
        title_hi=title_hi,
        body_hi=body_hi,
        payload=payload,
        related_submission_id=related_submission_id,
        channel=channel,
    )
    db.add(n)
    # Development email provider: log only
    logger.info(
        "notification",
        extra={
            "event_type": event_type,
            "user_id": str(user_id),
            "title": title,
            "channel": channel,
        },
    )
    return n
