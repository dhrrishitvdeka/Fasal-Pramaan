"""Evidence Coverage evaluation module.

Evaluates coverage across the 5 canonical required angles:
- wide_field
- left_context
- mid_canopy
- right_context
- closeup_damage

Checks:
- required views present
- usable views (present AND usable: quality >= 40, not blurry/unusable)
- wide context available (wide_field / context angles usable)
- close-up damage available (closeup_damage usable)
- duplicate / redundant views

Output normalized to [0, 100].
"""

from __future__ import annotations

from typing import Any

from app.services.evidence_evaluation.quality import (
    _eval_single_image_quality,
    _extract_val,
)

REQUIRED_ANGLES: list[str] = [
    "wide_field",
    "left_context",
    "mid_canopy",
    "right_context",
    "closeup_damage",
]


def evaluate_evidence_coverage(
    images: list[dict[str, Any] | Any],
    image_quality_evaluations: list[dict[str, Any]] | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    """Evaluate Evidence Coverage score and view completeness.

    A present-but-unusable image (e.g. blur < 35 or composite quality < 40)
    does not count towards usable coverage.

    Returns:
        dict containing:
        - score: int [0, 100]
        - available: bool
        - required_views: int (5)
        - usable_views: int (count of usable required views)
        - missing_views: list[str] (names of missing/unusable required angles)
        - wide_context_available: bool
        - closeup_available: bool
        - duplicate_views: list[str]
        - details: dict
        - warnings: list[str]
    """
    total_required = len(REQUIRED_ANGLES)
    warnings: list[str] = []

    if not images:
        return {
            "score": 0,
            "available": True,
            "required_views": total_required,
            "usable_views": 0,
            "missing_views": list(REQUIRED_ANGLES),
            "wide_context_available": False,
            "closeup_available": False,
            "duplicate_views": [],
            "details": {
                "required_angles": REQUIRED_ANGLES,
                "present_angles": [],
                "usable_angles": [],
                "unusable_angles": [],
                "present_count": 0,
                "usable_count": 0,
            },
            "warnings": ["No evidence images provided (0/5 required views)"],
        }

    # Extract angle types and determine usability per image
    present_angles: list[str] = []
    usable_angles_set: set[str] = set()
    unusable_angles_set: set[str] = set()
    angle_counts: dict[str, int] = {}

    for idx, img in enumerate(images):
        angle = _extract_val(img, "angle_type")
        if not angle:
            angle = f"unknown_{idx}"
        present_angles.append(angle)
        angle_counts[angle] = angle_counts.get(angle, 0) + 1

        # Check upload status
        upload_status = _extract_val(img, "upload_status", "uploaded")
        if upload_status == "failed":
            unusable_angles_set.add(angle)
            warnings.append(f"{angle}: Upload status is failed")
            continue

        # Evaluate or retrieve quality evaluation
        if image_quality_evaluations and idx < len(image_quality_evaluations):
            q_eval = image_quality_evaluations[idx]
        else:
            q_eval = _eval_single_image_quality(img)

        # An image is usable if composite score >= 40 and not critically blurred
        is_usable = q_eval.get("is_usable", True)
        # Also check explicit usability flags if present
        if _extract_val(img, "is_usable") is False or _extract_val(img, "is_corrupted") is True:
            is_usable = False

        if is_usable:
            usable_angles_set.add(angle)
        else:
            unusable_angles_set.add(angle)
            warnings.append(
                f"{angle}: Image is present but unusable due to poor quality/blur (score={q_eval.get('composite_score', 0)})"
            )

    # Missing required views are those in REQUIRED_ANGLES that have NO usable image
    missing_views = [angle for angle in REQUIRED_ANGLES if angle not in usable_angles_set]

    # Usable views count only distinct required angles that are usable
    usable_required_angles = [angle for angle in REQUIRED_ANGLES if angle in usable_angles_set]
    usable_count = len(usable_required_angles)

    # Wide context available if wide_field is usable, or at least two context angles are usable
    wide_context_available = "wide_field" in usable_angles_set or (
        "left_context" in usable_angles_set and "right_context" in usable_angles_set
    )

    # Close-up available if closeup_damage is usable
    closeup_available = "closeup_damage" in usable_angles_set

    # Detect duplicate / redundant views
    duplicate_views = [angle for angle, count in angle_counts.items() if count > 1]
    if duplicate_views:
        warnings.append(f"Duplicate views detected for angles: {', '.join(duplicate_views)}")

    # Score calculation: 20 points per usable required angle
    base_score = (usable_count / total_required) * 100.0
    clamped_score = round(max(0.0, min(100.0, base_score)))

    if missing_views:
        warnings.append(f"Missing required evidence views: {', '.join(missing_views)}")

    return {
        "score": clamped_score,
        "available": True,
        "required_views": total_required,
        "usable_views": usable_count,
        "missing_views": missing_views,
        "wide_context_available": wide_context_available,
        "closeup_available": closeup_available,
        "duplicate_views": duplicate_views,
        "details": {
            "required_angles": REQUIRED_ANGLES,
            "present_angles": present_angles,
            "usable_angles": list(usable_angles_set),
            "unusable_angles": list(unusable_angles_set),
            "present_count": len(present_angles),
            "usable_count": usable_count,
        },
        "warnings": warnings,
    }
