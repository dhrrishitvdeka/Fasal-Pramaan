"""Evidence Re-evaluation and confidence improvement tracking module.

Handles:
- Merging historical/existing evidence with newly captured recapture images
- Re-evaluating the updated evidence set across Quality, Coverage, Context, Integrity
- Computing confidence delta (new_confidence - previous_confidence)
- Comparing previous and new uncertainty classifications
"""

from __future__ import annotations

from typing import Any

from app.services.evidence_evaluation.engine import (
    DEFAULT_CONFIDENCE_THRESHOLD,
    evaluate_submission_evidence,
)
from app.services.evidence_evaluation.quality import _extract_val


def merge_recapture_evidence(
    initial_images: list[dict[str, Any] | Any],
    new_images: list[dict[str, Any] | Any],
) -> list[dict[str, Any] | Any]:
    """Merge new recapture evidence with initial evidence.

    New images supersede older images with the same angle_type.
    Angles present in initial evidence that were not recaptured are retained.
    """
    if not initial_images:
        return list(new_images)
    if not new_images:
        return list(initial_images)

    new_angles_map: dict[str, Any] = {}
    for img in new_images:
        angle = _extract_val(img, "angle_type")
        if angle:
            new_angles_map[angle] = img

    merged: list[Any] = []
    # Keep initial images whose angle was not replaced in new_images
    for img in initial_images:
        angle = _extract_val(img, "angle_type")
        if angle not in new_angles_map:
            merged.append(img)

    # Add all new images
    merged.extend(new_images)
    return merged


def reevaluate_submission_evidence(
    previous_evaluation: dict[str, Any] | None,
    initial_images: list[dict[str, Any] | Any],
    new_images: list[dict[str, Any] | Any],
    submission_data: dict[str, Any] | Any | None = None,
    plot_data: dict[str, Any] | Any | None = None,
    weather_data: dict[str, Any] | Any | None = None,
    threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> dict[str, Any]:
    """Perform re-evaluation of submission evidence after new evidence is uploaded.

    Returns:
        dict containing:
        - previous_confidence: int
        - new_confidence: int
        - confidence_delta: int
        - previous_uncertainty: Optional[str]
        - new_uncertainty: Optional[str]
        - evaluation: dict (full new evidence evaluation)
    """
    # 1. Determine current merged evidence set
    merged_images = merge_recapture_evidence(initial_images, new_images)

    # 2. Run fresh evidence evaluation on merged evidence
    new_eval = evaluate_submission_evidence(
        images=merged_images,
        submission_data=submission_data,
        plot_data=plot_data,
        weather_data=weather_data,
        threshold=threshold,
    )

    # 3. Extract previous confidence & uncertainty
    if previous_evaluation:
        if "confidence" in previous_evaluation and isinstance(previous_evaluation["confidence"], dict):
            prev_conf = int(previous_evaluation["confidence"].get("final", 0))
        elif "final_confidence" in previous_evaluation:
            prev_conf = int(previous_evaluation["final_confidence"])
        elif "final" in previous_evaluation:
            prev_conf = int(previous_evaluation["final"])
        else:
            prev_conf = 0

        if "uncertainty" in previous_evaluation and isinstance(previous_evaluation["uncertainty"], dict):
            prev_unc = previous_evaluation["uncertainty"].get("type")
        elif "uncertainty_type" in previous_evaluation:
            prev_unc = previous_evaluation["uncertainty_type"]
        else:
            prev_unc = None
    else:
        prev_conf = 0
        prev_unc = None

    new_conf = int(new_eval["confidence"]["final"])
    conf_delta = new_conf - prev_conf

    new_unc = (
        new_eval["uncertainty"]["type"]
        if new_eval.get("uncertainty", {}).get("present")
        else None
    )

    return {
        "previous_confidence": prev_conf,
        "new_confidence": new_conf,
        "confidence_delta": conf_delta,
        "previous_uncertainty": prev_unc,
        "new_uncertainty": new_unc,
        "evaluation": new_eval,
        "merged_image_count": len(merged_images),
    }
