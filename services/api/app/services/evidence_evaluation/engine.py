"""Final Evidence Confidence calculation and Uncertainty Classification engine.

Implements the four-dimensional evidence confidence formula:
final_confidence = 0.4 * quality + 0.3 * coverage + 0.2 * context + 0.1 * integrity
Normalized to [0, 100] and clamped to [0, 100].

Uncertainty Classification Priority:
1. integrity -> action: 'human_review'
2. coverage  -> action: 'request_specific_evidence'
3. visual    -> action: 'retake_image'
4. context   -> action: 'request_context'

Hard Rules:
- IF quality < 40  -> visual uncertainty (retake_image)
- IF coverage < 50 -> coverage uncertainty (request_specific_evidence)
- IF GPS missing   -> context uncertainty (request_context)
- IF integrity failed -> integrity uncertainty (human_review)
"""

from __future__ import annotations

from typing import Any

from app.services.evidence_evaluation.context import evaluate_evidence_context
from app.services.evidence_evaluation.coverage import (
    REQUIRED_ANGLES,
    evaluate_evidence_coverage,
)
from app.services.evidence_evaluation.integrity import evaluate_evidence_integrity
from app.services.evidence_evaluation.quality import evaluate_evidence_quality

# Versioning
EVALUATION_VERSION = "evidence-confidence-v1"

# Weights
WEIGHT_QUALITY = 0.4
WEIGHT_COVERAGE = 0.3
WEIGHT_CONTEXT = 0.2
WEIGHT_INTEGRITY = 0.1

# Thresholds
DEFAULT_CONFIDENCE_THRESHOLD = 85
EVIDENCE_QUALITY_RETAKE_THRESHOLD = 40
EVIDENCE_COVERAGE_REQUEST_THRESHOLD = 50


def calculate_final_evidence_confidence(
    quality_score: float,
    coverage_score: float,
    context_score: float,
    integrity_score: float,
    threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> dict[str, Any]:
    """Calculate the final four-dimensional evidence confidence score.

    Formula:
      final_confidence = 0.4 * quality + 0.3 * coverage + 0.2 * context + 0.1 * integrity
    Normalized to [0, 100] and clamped to [0, 100].
    """
    q = max(0.0, min(100.0, float(quality_score)))
    cov = max(0.0, min(100.0, float(coverage_score)))
    ctx = max(0.0, min(100.0, float(context_score)))
    integ = max(0.0, min(100.0, float(integrity_score)))

    raw_final = (
        WEIGHT_QUALITY * q
        + WEIGHT_COVERAGE * cov
        + WEIGHT_CONTEXT * ctx
        + WEIGHT_INTEGRITY * integ
    )
    final_clamped = round(max(0.0, min(100.0, raw_final)))

    return {
        "final": final_clamped,
        "quality": round(q),
        "coverage": round(cov),
        "context": round(ctx),
        "integrity": round(integ),
        "threshold": int(threshold),
        "meets_threshold": final_clamped >= threshold,
    }


def classify_uncertainty(
    final_confidence: float,
    quality_eval: dict[str, Any],
    coverage_eval: dict[str, Any],
    context_eval: dict[str, Any],
    integrity_eval: dict[str, Any],
    threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> dict[str, Any]:
    """Classify uncertainty using strict priority ordering.

    Priority Order:
      1. integrity  -> Action: 'human_review'
      2. coverage   -> Action: 'request_specific_evidence'
      3. visual     -> Action: 'retake_image'
      4. context    -> Action: 'request_context'

    Hard Rules:
      - Integrity failed (score < 100 or tamper indicators or mock GPS) -> integrity uncertainty
      - Coverage < 50 or missing required angle -> coverage uncertainty
      - Quality < 40 -> visual uncertainty
      - GPS missing / invalid -> context uncertainty
    """
    final_val = float(final_confidence)
    int_score = integrity_eval.get("score", 100)
    cov_score = coverage_eval.get("score", 100)
    qual_score = quality_eval.get("score", 100)
    ctx_score = context_eval.get("score", 100)

    tamper_indicators = integrity_eval.get("tamper_indicators", [])
    mock_gps = integrity_eval.get("mock_gps_detected", False)
    sha256_valid = integrity_eval.get("sha256_valid", True)
    missing_views = coverage_eval.get("missing_views", [])
    gps_valid = context_eval.get("gps_valid", True)
    plot_match = context_eval.get("plot_match", True)

    # 1. Check Integrity Issue
    has_integrity_issue = (
        int_score < 100
        or len(tamper_indicators) > 0
        or mock_gps
        or not sha256_valid
    )

    # Determine unsubmitted missing angles vs present but poor quality angles
    present_angles = coverage_eval.get("details", {}).get("present_angles", [])
    unsubmitted_views = [v for v in missing_views if v not in present_angles]

    # 2. Check Coverage Issue: true missing/unsubmitted angles or low coverage when quality is okay
    has_coverage_issue = (
        len(unsubmitted_views) > 0
        or (cov_score < EVIDENCE_COVERAGE_REQUEST_THRESHOLD and qual_score >= EVIDENCE_QUALITY_RETAKE_THRESHOLD)
    )

    # 3. Check Visual Quality Issue: quality below retake threshold or visual warnings
    has_visual_issue = (
        qual_score < EVIDENCE_QUALITY_RETAKE_THRESHOLD
        or any("blur" in str(w).lower() for w in quality_eval.get("warnings", []))
        or quality_eval.get("components", {}).get("blur", 100) < 40
    )

    # 4. Check Context Issue
    has_context_issue = (
        not gps_valid
        or not plot_match
        or ctx_score < 70
    )

    # If confidence meets threshold and no hard rule / integrity violation is present
    if (
        final_val >= threshold
        and not has_integrity_issue
        and not has_coverage_issue
        and not (qual_score < EVIDENCE_QUALITY_RETAKE_THRESHOLD)
        and gps_valid
    ):
        return {
            "present": False,
            "type": None,
            "severity": None,
            "reasons": [],
            "recommended_action": "normal_human_review",
        }

    # Uncertainty is present — Apply strict priority ordering:
    # Priority 1: Integrity
    if has_integrity_issue:
        reasons = []
        if mock_gps:
            reasons.append("Mock GPS location detected")
        if not sha256_valid:
            reasons.append("Evidence checksum verification failed")
        if integrity_eval.get("perceptual_duplicates_detected"):
            reasons.append("Perceptual duplicates detected across distinct capture angles")
        if tamper_indicators:
            for t in tamper_indicators:
                if t not in reasons and not any(t in r for r in reasons):
                    reasons.append(f"Tamper indicator: {t}")
        if not reasons:
            reasons.append("Evidence integrity verification failed")

        return {
            "present": True,
            "type": "integrity",
            "severity": "critical" if (mock_gps or not sha256_valid) else "high",
            "reasons": reasons,
            "recommended_action": "human_review",
        }

    # Priority 2: Coverage (unsubmitted required views or insufficient coverage)
    if has_coverage_issue:
        reasons = []
        for view in (unsubmitted_views if unsubmitted_views else missing_views):
            reasons.append(f"{view} is missing")
        if not reasons and cov_score < EVIDENCE_COVERAGE_REQUEST_THRESHOLD:
            reasons.append("Evidence coverage is below acceptable threshold")

        return {
            "present": True,
            "type": "coverage",
            "severity": "high" if (cov_score < EVIDENCE_COVERAGE_REQUEST_THRESHOLD or "closeup_damage" in missing_views) else "medium",
            "reasons": reasons,
            "recommended_action": "request_specific_evidence",
        }

    # Priority 3: Visual
    if has_visual_issue:
        reasons = list(quality_eval.get("warnings", []))
        if not reasons:
            reasons.append("Evidence image quality is below acceptable threshold (blurry/poor exposure)")

        return {
            "present": True,
            "type": "visual",
            "severity": "high" if qual_score < EVIDENCE_QUALITY_RETAKE_THRESHOLD else "medium",
            "reasons": reasons,
            "recommended_action": "retake_image",
        }

    # Priority 4: Context
    if has_context_issue:
        reasons = []
        if not gps_valid:
            reasons.append("GPS location data is missing or invalid")
        if not plot_match:
            reasons.append("Capture location does not match registered plot boundary")
        if not reasons:
            reasons = list(context_eval.get("warnings", [])) or ["Contextual metadata is insufficient"]

        return {
            "present": True,
            "type": "context",
            "severity": "high" if not gps_valid else "medium",
            "reasons": reasons,
            "recommended_action": "request_context",
        }

    # Fallback if confidence < threshold without specific hard rule trigger
    lowest_metric = min(
        ("quality", qual_score),
        ("coverage", cov_score),
        ("context", ctx_score),
        ("integrity", int_score),
        key=lambda x: x[1],
    )[0]

    action_map = {
        "integrity": "human_review",
        "coverage": "request_specific_evidence",
        "quality": "retake_image",
        "context": "request_context",
    }
    type_map = {
        "quality": "visual",
        "coverage": "coverage",
        "context": "context",
        "integrity": "integrity",
    }

    return {
        "present": True,
        "type": type_map.get(lowest_metric, "visual"),
        "severity": "medium",
        "reasons": [f"Evidence confidence ({int(final_val)}) is below threshold ({int(threshold)})"],
        "recommended_action": action_map.get(lowest_metric, "request_specific_evidence"),
    }


def generate_evidence_request(
    uncertainty: dict[str, Any],
    coverage_eval: dict[str, Any],
    quality_eval: dict[str, Any],
    context_eval: dict[str, Any],
) -> dict[str, Any] | None:
    """Generate structured, targeted recapture instructions for the farmer.

    Examples:
    - missing_closeup -> required_angles=['closeup_damage'], title='Capture close-up damage evidence'
    - poor_wide_context -> required_angles=['wide_field'], title='Capture a wider field view'
    - blur -> required_angles=['mid_canopy'], title='Retake the blurry image'
    - context -> reason_code='missing_gps', action='request_context'
    """
    if not uncertainty.get("present"):
        return None

    u_type = uncertainty.get("type")
    missing_views = coverage_eval.get("missing_views", [])

    if u_type == "coverage":
        if "closeup_damage" in missing_views and len(missing_views) == 1:
            return {
                "type": "specific_evidence",
                "reason_code": "missing_closeup",
                "required_angles": ["closeup_damage"],
                "title": "Capture close-up damage evidence",
                "instructions": "Move closer to the affected crop area and capture a clear, sharp image.",
            }
        elif "wide_field" in missing_views and len(missing_views) == 1:
            return {
                "type": "specific_evidence",
                "reason_code": "poor_wide_context",
                "required_angles": ["wide_field"],
                "title": "Capture a wider field view",
                "instructions": "Capture the field from farther back so the affected area and surrounding crop context are visible.",
            }
        elif missing_views:
            return {
                "type": "specific_evidence",
                "reason_code": "missing_coverage",
                "required_angles": list(missing_views),
                "title": "Capture missing evidence angles",
                "instructions": f"Please capture {', '.join(missing_views)} to complete your crop damage assessment.",
            }
        else:
            return {
                "type": "specific_evidence",
                "reason_code": "insufficient_coverage",
                "required_angles": list(REQUIRED_ANGLES),
                "title": "Provide complete crop coverage",
                "instructions": "Please capture all required angles of your field and crop.",
            }

    elif u_type == "visual":
        # Find which specific angles were blurry or poor quality
        blurry_angles: list[str] = []
        for img_ev in quality_eval.get("details", {}).get("image_evaluations", []):
            if not img_ev.get("is_usable") or img_ev.get("blur", 100) < 40:
                ang = img_ev.get("angle_type")
                if ang and ang not in blurry_angles and ang in REQUIRED_ANGLES:
                    blurry_angles.append(ang)

        req_angles = blurry_angles if blurry_angles else ["mid_canopy"]
        return {
            "type": "specific_evidence",
            "reason_code": "blur",
            "required_angles": req_angles,
            "title": "Retake the blurry image",
            "instructions": "Hold the phone steady and capture the crop clearly.",
        }

    elif u_type == "context":
        if not context_eval.get("gps_valid"):
            return {
                "type": "context_correction",
                "reason_code": "missing_gps",
                "required_angles": [],
                "title": "GPS location missing",
                "instructions": "Enable GPS on your device and update location information.",
            }
        else:
            return {
                "type": "context_correction",
                "reason_code": "plot_mismatch",
                "required_angles": [],
                "title": "Plot location mismatch",
                "instructions": "Ensure you are standing inside the registered plot boundary when capturing evidence.",
            }

    elif u_type == "integrity":
        return {
            "type": "human_review",
            "reason_code": "integrity_flag",
            "required_angles": [],
            "title": "Authenticity verification required",
            "instructions": "This submission requires manual verification by a claims officer.",
        }

    return None


def evaluate_submission_evidence(
    images: list[dict[str, Any] | Any],
    submission_data: dict[str, Any] | Any | None = None,
    plot_data: dict[str, Any] | Any | None = None,
    weather_data: dict[str, Any] | Any | None = None,
    threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> dict[str, Any]:
    """Execute complete pure domain Evidence Evaluation.

    Returns structured evaluation matching the canonical API response contract:
    - evidence_evaluation:
      - quality: {score, available, details}
      - coverage: {score, available, details}
      - context: {score, available, details}
      - integrity: {score, available, details}
      - confidence: {final, quality, coverage, context, integrity, threshold}
      - uncertainty: {present, type, severity, reasons, recommended_action}
      - request: {type, reason_code, required_angles, title, instructions}
    """
    # 1. Quality Evaluation
    quality_result = evaluate_evidence_quality(images)

    # 2. Coverage Evaluation (using image quality evaluations to assess usable views)
    coverage_result = evaluate_evidence_coverage(
        images,
        image_quality_evaluations=quality_result.get("details", {}).get("image_evaluations"),
    )

    # 3. Context Evaluation
    context_result = evaluate_evidence_context(
        submission_data or {},
        plot_data=plot_data,
        weather_data=weather_data,
        images=images,
    )

    # 4. Integrity Evaluation
    integrity_result = evaluate_evidence_integrity(
        images,
        submission_data=submission_data,
    )

    # 5. Final Confidence Score
    confidence_result = calculate_final_evidence_confidence(
        quality_score=quality_result["score"],
        coverage_score=coverage_result["score"],
        context_score=context_result["score"],
        integrity_score=integrity_result["score"],
        threshold=threshold,
    )

    # 6. Uncertainty Classification
    uncertainty_result = classify_uncertainty(
        final_confidence=confidence_result["final"],
        quality_eval=quality_result,
        coverage_eval=coverage_result,
        context_eval=context_result,
        integrity_eval=integrity_result,
        threshold=threshold,
    )

    # 7. Adaptive Evidence Request Generation
    request_result = generate_evidence_request(
        uncertainty=uncertainty_result,
        coverage_eval=coverage_result,
        quality_eval=quality_result,
        context_eval=context_result,
    )

    return {
        "evaluation_version": EVALUATION_VERSION,
        "quality": {
            "score": quality_result["score"],
            "available": quality_result["available"],
            "components": quality_result.get("components", {}),
            "warnings": quality_result.get("warnings", []),
            "details": quality_result.get("details", {}),
        },
        "coverage": {
            "score": coverage_result["score"],
            "available": coverage_result["available"],
            "required_views": coverage_result.get("required_views", 5),
            "usable_views": coverage_result.get("usable_views", 0),
            "missing_views": coverage_result.get("missing_views", []),
            "wide_context_available": coverage_result.get("wide_context_available", False),
            "closeup_available": coverage_result.get("closeup_available", False),
            "duplicate_views": coverage_result.get("duplicate_views", []),
            "warnings": coverage_result.get("warnings", []),
            "details": coverage_result.get("details", {}),
        },
        "context": {
            "score": context_result["score"],
            "available": context_result["available"],
            "gps_valid": context_result.get("gps_valid", False),
            "gps_accuracy_valid": context_result.get("gps_accuracy_valid", False),
            "plot_match": context_result.get("plot_match", False),
            "capture_time_available": context_result.get("capture_time_available", False),
            "crop_context_available": context_result.get("crop_context_available", False),
            "location_consistent": context_result.get("location_consistent", True),
            "weather": context_result.get("weather", {}),
            "warnings": context_result.get("warnings", []),
            "details": context_result.get("details", {}),
        },
        "integrity": {
            "score": integrity_result["score"],
            "available": integrity_result["available"],
            "sha256_valid": integrity_result.get("sha256_valid", False),
            "perceptual_duplicates_detected": integrity_result.get("perceptual_duplicates_detected", False),
            "immutable_original": integrity_result.get("immutable_original", True),
            "metadata_intact": integrity_result.get("metadata_intact", True),
            "server_verified": integrity_result.get("server_verified", True),
            "client_server_consistent": integrity_result.get("client_server_consistent", True),
            "mock_gps_detected": integrity_result.get("mock_gps_detected", False),
            "tamper_indicators": integrity_result.get("tamper_indicators", []),
            "warnings": integrity_result.get("warnings", []),
            "details": integrity_result.get("details", {}),
        },
        "confidence": confidence_result,
        "uncertainty": uncertainty_result,
        "request": request_result,
    }
