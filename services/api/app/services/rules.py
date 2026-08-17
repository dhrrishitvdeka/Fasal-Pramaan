"""Rules engine for post-AI routing decisions."""

from __future__ import annotations

from typing import Any, Optional

from app.core.config import get_settings
from app.db.models import EvidenceEvaluation


def decide_review_path(
    prediction: dict[str, Any],
    evaluation: Optional[EvidenceEvaluation] = None,
    *,
    location_anomaly: bool = False,
    crop_mismatch: bool = False,
    quality_weak: bool = False,
) -> tuple[str, str]:
    """
    Returns (submission_status, recommendation).
    Statuses: pending_review | needs_recapture | physical_inspection
    Authoritative for evidence sufficiency: EvidenceEvaluation.
    Preserves AI prediction / damage severity / crop mismatch intact.
    """
    settings = get_settings()
    conf = float(prediction.get("overall_confidence") or 0)
    severity = (prediction.get("severity") or "none").lower()
    rec = prediction.get("human_review_recommendation") or "normal_review"
    warnings = prediction.get("quality_warnings") or []
    anomalies = prediction.get("anomaly_flags") or []

    def _has_flag(flags: Any, name: str) -> bool:
        if isinstance(flags, dict):
            return bool(flags.get(name))
        if isinstance(flags, (list, set, tuple)):
            return name in flags
        return False

    # 1. Evidence Evaluation authority on evidence sufficiency & recapture
    if evaluation is not None:
        if evaluation.uncertainty_type == "integrity" or evaluation.integrity_score < 70.0:
            return "pending_review", "urgent_review"
        if evaluation.recommended_action in ("retake_image", "request_specific_evidence"):
            return "needs_recapture", "recapture"
        if evaluation.recommended_action in ("human_review", "request_context"):
            return "pending_review", "urgent_review"

    # 2. Quality fallback if evaluation is not present
    if quality_weak or any("blur" in str(w).lower() or "exposure" in str(w).lower() for w in warnings):
        return "needs_recapture", "recapture"

    # 3. Integrity anomalies from prediction or submission
    if _has_flag(anomalies, "duplicate") or _has_flag(anomalies, "screenshot_suspected") or _has_flag(anomalies, "mock_location"):
        return "pending_review", "urgent_review"

    # 4. Location or crop mismatch
    if location_anomaly or crop_mismatch:
        return "pending_review", "urgent_review"

    # 5. High severity damage checks
    if severity in ("high", "severe", "critical"):
        if conf < settings.ai_high_severity_threshold:
            return "physical_inspection", "physical_inspection"
        return "pending_review", "urgent_review"

    # 6. AI Model confidence checks
    if conf < settings.ai_confidence_threshold:
        return "pending_review", "low_confidence_review"

    # 7. Model recommendation fallback
    if rec in ("recapture", "physical_inspection", "urgent_review"):
        status_map = {
            "recapture": "needs_recapture",
            "physical_inspection": "physical_inspection",
            "urgent_review": "pending_review",
        }
        return status_map.get(rec, "pending_review"), rec

    return "pending_review", "normal_review"
