"""Rules engine for post-AI routing decisions."""

from __future__ import annotations

from typing import Any

from app.core.config import get_settings


def decide_review_path(
    prediction: dict[str, Any],
    *,
    location_anomaly: bool = False,
    crop_mismatch: bool = False,
    quality_weak: bool = False,
) -> tuple[str, str]:
    """
    Returns (submission_status, recommendation).
    Statuses: pending_review | needs_recapture | physical_inspection
    """
    settings = get_settings()
    conf = float(prediction.get("overall_confidence") or 0)
    severity = (prediction.get("severity") or "none").lower()
    rec = prediction.get("human_review_recommendation") or "normal_review"
    warnings = prediction.get("quality_warnings") or []
    anomalies = prediction.get("anomaly_flags") or []

    if quality_weak or any("blur" in str(w).lower() or "exposure" in str(w).lower() for w in warnings):
        return "needs_recapture", "recapture"

    if "duplicate" in anomalies or "screenshot_suspected" in anomalies:
        return "pending_review", "urgent_review"

    if location_anomaly or crop_mismatch:
        return "pending_review", "urgent_review"

    if severity in ("high", "severe", "critical"):
        if conf < settings.ai_high_severity_threshold:
            return "physical_inspection", "physical_inspection"
        return "pending_review", "urgent_review"

    if conf < settings.ai_confidence_threshold:
        return "pending_review", "low_confidence_review"

    if rec in ("recapture", "physical_inspection", "urgent_review"):
        status_map = {
            "recapture": "needs_recapture",
            "physical_inspection": "physical_inspection",
            "urgent_review": "pending_review",
        }
        return status_map.get(rec, "pending_review"), rec

    return "pending_review", "normal_review"
