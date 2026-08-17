"""Evidence evaluation domain logic and scoring engine."""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import EvidenceEvaluation, Submission, SubmissionImage

logger = logging.getLogger(__name__)

ALL_EVIDENCE_ANGLES: list[str] = [
    "wide_field",
    "left_context",
    "mid_canopy",
    "right_context",
    "closeup_damage",
]

WEIGHT_QUALITY = 0.4
WEIGHT_COVERAGE = 0.3
WEIGHT_CONTEXT = 0.2
WEIGHT_INTEGRITY = 0.1


def calculate_quality_score(
    images: list[SubmissionImage],
    prediction: Optional[dict[str, Any]] = None,
) -> tuple[float, dict[str, Any], list[str]]:
    """Evaluate image quality component (0-100)."""
    settings = get_settings()
    active_images = [
        img
        for img in images
        if img.upload_status == "uploaded" and not getattr(img, "is_deleted", False)
    ]
    if not active_images:
        return 0.0, {"per_image": [], "blurry_angles": [], "exposure_angles": []}, ["no_uploaded_images"]

    per_image_details = []
    blurry_angles = []
    exposure_angles = []
    issues = []

    pred_warnings = (prediction.get("quality_warnings") or []) if prediction else []
    pred_blur = any("blur" in str(w).lower() for w in pred_warnings)
    pred_exposure = any("exposure" in str(w).lower() or "brightness" in str(w).lower() for w in pred_warnings)

    for img in active_images:
        img_score = 100.0
        meta = img.image_metadata
        flags = img.quality_flags or {}
        img_issues = []

        # Check blur
        blur_score = getattr(meta, "blur_score", None) if meta else None
        has_blur = (
            (blur_score is not None and blur_score < 0.3)
            or flags.get("blur") is True
            or flags.get("low_sharpness") is True
            or (pred_blur and img.angle_type in ("mid_canopy", "closeup_damage"))
        )
        if has_blur:
            img_score -= 65.0
            blurry_angles.append(img.angle_type)
            img_issues.append("blur")

        # Check exposure / brightness
        brightness = getattr(meta, "brightness_score", None) if meta else None
        has_exposure = (
            (brightness is not None and (brightness < 0.2 or brightness > 0.9))
            or flags.get("underexposed") is True
            or flags.get("overexposed") is True
            or pred_exposure
        )
        if has_exposure:
            img_score -= 30.0
            exposure_angles.append(img.angle_type)
            img_issues.append("poor_exposure")

        # Check resolution / decoding
        if meta and ((meta.width and meta.width < 128) or (meta.height and meta.height < 128)):
            img_score -= 40.0
            img_issues.append("low_resolution")

        server_checks = (meta.server_checks or {}) if meta else {}
        if server_checks.get("decoded") is False:
            img_score -= 50.0
            img_issues.append("undecodable")

        img_score = max(0.0, min(100.0, img_score))
        per_image_details.append(
            {
                "image_id": str(img.id),
                "angle_type": img.angle_type,
                "score": img_score,
                "issues": img_issues,
            }
        )

    avg_score = sum(d["score"] for d in per_image_details) / len(per_image_details)
    avg_score = round(max(0.0, min(100.0, avg_score)), 2)

    if blurry_angles:
        issues.append(f"Blur detected in: {', '.join(sorted(set(blurry_angles)))}")
    if exposure_angles:
        issues.append(f"Exposure issues in: {', '.join(sorted(set(exposure_angles)))}")

    details = {
        "score": avg_score,
        "per_image": per_image_details,
        "blurry_angles": list(sorted(set(blurry_angles))),
        "exposure_angles": list(sorted(set(exposure_angles))),
    }
    return avg_score, details, issues


def calculate_coverage_score(
    images: list[SubmissionImage],
) -> tuple[float, dict[str, Any], list[str]]:
    """Evaluate evidence coverage component (0-100)."""
    present_angles = {
        img.angle_type
        for img in images
        if img.upload_status == "uploaded" and not getattr(img, "is_deleted", False)
    }
    valid_present = [a for a in ALL_EVIDENCE_ANGLES if a in present_angles]
    missing_angles = [a for a in ALL_EVIDENCE_ANGLES if a not in present_angles]

    coverage_score = round((len(valid_present) / len(ALL_EVIDENCE_ANGLES)) * 100.0, 2)
    issues = [f"{angle} is missing" for angle in missing_angles]

    details = {
        "score": coverage_score,
        "required_angles": ALL_EVIDENCE_ANGLES,
        "present_angles": valid_present,
        "missing_angles": missing_angles,
        "total_required": len(ALL_EVIDENCE_ANGLES),
        "total_present": len(valid_present),
    }
    return coverage_score, details, issues


def calculate_context_score(
    submission: Submission,
    images: list[SubmissionImage],
) -> tuple[float, dict[str, Any], list[str]]:
    """Evaluate context component (GPS, location proximity, timestamp) (0-100)."""
    settings = get_settings()
    issues = []
    base_score = 100.0

    has_sub_gps = submission.capture_lat is not None and submission.capture_lon is not None
    has_img_gps = any(
        img.capture_lat is not None and img.capture_lon is not None
        for img in images
        if img.upload_status == "uploaded" and not getattr(img, "is_deleted", False)
    )

    if not has_sub_gps and not has_img_gps:
        issues.append("Missing GPS location coordinates")
        return 0.0, {"score": 0.0, "has_gps": False, "reason": "missing_gps"}, issues

    anomaly_flags = submission.anomaly_flags or {}
    if anomaly_flags.get("outside_plot_proximity"):
        base_score -= 45.0
        issues.append("Evidence captured outside registered plot boundary proximity")

    accuracy = submission.capture_accuracy_m
    if accuracy is not None and accuracy > settings.gps_accuracy_limit_meters:
        base_score -= 20.0
        issues.append(f"Weak GPS accuracy ({accuracy:.1f}m > {settings.gps_accuracy_limit_meters:.1f}m)")

    if submission.capture_timestamp is None:
        base_score -= 10.0
        issues.append("Missing capture timestamp")

    score = round(max(0.0, min(100.0, base_score)), 2)
    details = {
        "score": score,
        "has_gps": True,
        "capture_lat": submission.capture_lat,
        "capture_lon": submission.capture_lon,
        "accuracy_m": accuracy,
        "outside_plot_proximity": bool(anomaly_flags.get("outside_plot_proximity")),
    }
    return score, details, issues


def calculate_integrity_score(
    submission: Submission,
    images: list[SubmissionImage],
    prediction: Optional[dict[str, Any]] = None,
) -> tuple[float, dict[str, Any], list[str]]:
    """Evaluate integrity component (SHA-256, duplicates, mock location, tamper checks) (0-100)."""
    issues = []
    base_score = 100.0

    active_images = [
        img
        for img in images
        if img.upload_status == "uploaded" and not getattr(img, "is_deleted", False)
    ]

    # Check for duplicate hashes among submission images
    sha_list = [img.sha256 for img in active_images if img.sha256]
    if len(sha_list) != len(set(sha_list)):
        base_score -= 65.0
        issues.append("Duplicate SHA-256 hash detected across evidence images")

    phash_list = [img.perceptual_hash for img in active_images if img.perceptual_hash]
    if len(phash_list) != len(set(phash_list)):
        base_score -= 65.0
        issues.append("Duplicate perceptual hash detected across evidence images")

    # Check anomaly flags
    sub_anomalies = submission.anomaly_flags or {}
    pred_anomalies = (prediction.get("anomaly_flags") or []) if prediction else []

    if sub_anomalies.get("mock_location") or "mock_location" in pred_anomalies:
        base_score -= 65.0
        issues.append("Mock GPS / simulated location detected")

    if sub_anomalies.get("duplicate") or "duplicate" in pred_anomalies:
        base_score -= 65.0
        issues.append("Duplicate image submission suspected")

    if sub_anomalies.get("screenshot_suspected") or "screenshot_suspected" in pred_anomalies:
        base_score -= 60.0
        issues.append("Screenshot or screen replay suspected")

    # Check image metadata server validation checks
    for img in active_images:
        meta = img.image_metadata
        if meta and meta.server_checks:
            sc = meta.server_checks
            if sc.get("issues"):
                base_score -= 35.0
                issues.append(f"Server check flags for angle {img.angle_type}: {sc.get('issues')}")

    score = round(max(0.0, min(100.0, base_score)), 2)
    details = {
        "score": score,
        "integrity_passed": score >= 70.0 and len(issues) == 0,
        "issues": issues,
    }
    return score, details, issues


def evaluate_submission_evidence(
    db: Session,
    submission: Submission,
    prediction: Optional[dict[str, Any]] = None,
    actor_id: Optional[UUID] = None,
) -> EvidenceEvaluation:
    """Compute 4-component scores, final evidence confidence, uncertainty, and persist an immutable record."""
    settings = get_settings()
    images = submission.images or []

    quality_score, quality_details, quality_issues = calculate_quality_score(images, prediction)
    coverage_score, coverage_details, coverage_issues = calculate_coverage_score(images)
    context_score, context_details, context_issues = calculate_context_score(submission, images)
    integrity_score, integrity_details, integrity_issues = calculate_integrity_score(
        submission, images, prediction
    )

    final_confidence = round(
        WEIGHT_QUALITY * quality_score
        + WEIGHT_COVERAGE * coverage_score
        + WEIGHT_CONTEXT * context_score
        + WEIGHT_INTEGRITY * integrity_score,
        2,
    )
    final_confidence = max(0.0, min(100.0, final_confidence))

    threshold = settings.evidence_confidence_threshold
    quality_retake_threshold = settings.evidence_quality_retake_threshold
    coverage_req_threshold = settings.evidence_coverage_request_threshold

    uncertainty_type: Optional[str] = None
    uncertainty_severity: Optional[str] = None
    uncertainty_reasons: list[str] = []
    recommended_action: str = "normal_review"
    generated_request: Optional[dict[str, Any]] = None

    # Hard rules and uncertainty classification by priority:
    # 1. Integrity
    # 2. Coverage
    # 3. Visual
    # 4. Context
    has_integrity_issue = integrity_score < 70.0 or len(integrity_issues) > 0
    has_coverage_issue = coverage_score < coverage_req_threshold or len(coverage_issues) > 0
    has_visual_issue = quality_score < quality_retake_threshold or len(quality_issues) > 0
    has_context_issue = context_score < 70.0 or len(context_issues) > 0

    is_uncertain = final_confidence < threshold or has_integrity_issue or has_coverage_issue or has_visual_issue or has_context_issue

    if is_uncertain:
        if has_integrity_issue:
            uncertainty_type = "integrity"
            uncertainty_severity = "critical" if integrity_score < 40.0 else "high"
            uncertainty_reasons = integrity_issues or ["Integrity check failed"]
            recommended_action = "human_review"
            generated_request = None  # Do not request photos for integrity failure; require human review
        elif has_coverage_issue and (coverage_score < coverage_req_threshold or final_confidence < threshold):
            uncertainty_type = "coverage"
            uncertainty_severity = "high" if coverage_score < coverage_req_threshold else "medium"
            uncertainty_reasons = coverage_issues or ["Insufficient angle coverage"]
            recommended_action = "request_specific_evidence"

            missing = coverage_details.get("missing_angles", [])
            if "closeup_damage" in missing:
                generated_request = {
                    "reason_code": "missing_closeup",
                    "required_angles": ["closeup_damage"],
                    "title": "Capture close-up damage evidence",
                    "instructions": "Move closer to the affected crop area and capture a clear, sharp image.",
                }
            elif "wide_field" in missing:
                generated_request = {
                    "reason_code": "poor_wide_context",
                    "required_angles": ["wide_field"],
                    "title": "Capture a wider field view",
                    "instructions": "Capture the field from farther back so the affected area and surrounding crop context are visible.",
                }
            else:
                generated_request = {
                    "reason_code": "missing_angles",
                    "required_angles": missing or ALL_EVIDENCE_ANGLES,
                    "title": "Capture missing evidence angles",
                    "instructions": f"Please capture evidence for: {', '.join(missing or ALL_EVIDENCE_ANGLES)}.",
                }
        elif has_visual_issue and (quality_score < quality_retake_threshold or final_confidence < threshold):
            uncertainty_type = "visual"
            uncertainty_severity = "high" if quality_score < quality_retake_threshold else "medium"
            uncertainty_reasons = quality_issues or ["Visual quality is weak or blurry"]
            recommended_action = "retake_image"

            blurry = quality_details.get("blurry_angles", [])
            exposure = quality_details.get("exposure_angles", [])
            target_angles = list(sorted(set(blurry + exposure))) or ["mid_canopy"]
            generated_request = {
                "reason_code": "blur" if blurry else "poor_quality",
                "required_angles": target_angles,
                "title": "Retake blurry or poor quality images",
                "instructions": "Hold the phone steady and capture the crop clearly in good lighting.",
            }
        elif has_context_issue and (context_score < 70.0 or final_confidence < threshold):
            uncertainty_type = "context"
            uncertainty_severity = "medium"
            uncertainty_reasons = context_issues or ["Missing or inconsistent context metadata"]
            recommended_action = "request_context"
            generated_request = {
                "reason_code": "missing_gps" if context_score == 0 else "location_mismatch",
                "required_angles": [],
                "title": "Update location context",
                "instructions": "Ensure GPS location is enabled on device at the field plot.",
            }
        else:
            # Fallback if confidence < threshold but no single component breached thresholds
            uncertainty_type = "coverage" if coverage_score < 100.0 else "visual"
            uncertainty_severity = "medium"
            uncertainty_reasons = ["Confidence below required threshold (85.0)"]
            recommended_action = "request_specific_evidence" if uncertainty_type == "coverage" else "retake_image"
            generated_request = {
                "reason_code": "low_confidence",
                "required_angles": coverage_details.get("missing_angles") or ["closeup_damage"],
                "title": "Capture additional evidence",
                "instructions": "Please capture additional clear photos of the crop area.",
            }
    else:
        uncertainty_type = None
        uncertainty_severity = None
        uncertainty_reasons = []
        recommended_action = "normal_review"
        generated_request = None

    active_evidence_ids = [
        str(img.id)
        for img in images
        if img.upload_status == "uploaded" and not getattr(img, "is_deleted", False)
    ]

    component_details = {
        "weights": {
            "quality": WEIGHT_QUALITY,
            "coverage": WEIGHT_COVERAGE,
            "context": WEIGHT_CONTEXT,
            "integrity": WEIGHT_INTEGRITY,
        },
        "quality": quality_details,
        "coverage": coverage_details,
        "context": context_details,
        "integrity": integrity_details,
    }

    eval_record = EvidenceEvaluation(
        submission_id=submission.id,
        evaluation_version=settings.evidence_evaluation_version,
        quality_score=quality_score,
        coverage_score=coverage_score,
        context_score=context_score,
        integrity_score=integrity_score,
        final_confidence=final_confidence,
        confidence_threshold=threshold,
        uncertainty_type=uncertainty_type,
        uncertainty_severity=uncertainty_severity,
        uncertainty_reasons=uncertainty_reasons,
        recommended_action=recommended_action,
        generated_request=generated_request,
        component_details=component_details,
        evidence_ids=active_evidence_ids,
        model_version=prediction.get("model_version") if prediction else None,
        actor_id=actor_id,
    )
    db.add(eval_record)
    return eval_record


def calculate_re_evaluation_delta(
    db: Session,
    submission_id: UUID,
    current_evaluation: EvidenceEvaluation,
) -> dict[str, Any]:
    """Calculate confidence and uncertainty delta between current and previous evaluation."""
    prev = (
        db.query(EvidenceEvaluation)
        .filter(
            EvidenceEvaluation.submission_id == submission_id,
            EvidenceEvaluation.id != current_evaluation.id,
            EvidenceEvaluation.created_at <= current_evaluation.created_at,
        )
        .order_by(EvidenceEvaluation.created_at.desc())
        .first()
    )
    if not prev:
        return {
            "previous_confidence": None,
            "new_confidence": current_evaluation.final_confidence,
            "confidence_delta": 0.0,
            "previous_uncertainty": None,
            "new_uncertainty": current_evaluation.uncertainty_type,
        }

    delta = round(current_evaluation.final_confidence - prev.final_confidence, 2)
    return {
        "previous_confidence": prev.final_confidence,
        "new_confidence": current_evaluation.final_confidence,
        "confidence_delta": delta,
        "previous_uncertainty": prev.uncertainty_type,
        "new_uncertainty": current_evaluation.uncertainty_type,
    }
