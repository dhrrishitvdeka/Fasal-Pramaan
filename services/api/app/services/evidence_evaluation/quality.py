"""Evidence Quality evaluation module.

Evaluates:
- blur
- brightness / exposure
- image resolution
- framing / aspect ratio
- crop visibility
- damage visibility
- consistency across images

Output normalized to [0, 100].
"""

from __future__ import annotations

import math
from typing import Any


def _extract_val(obj: Any, key: str, default: Any = None) -> Any:
    """Safely extract value from dict or object attribute."""
    if isinstance(obj, dict):
        val = obj.get(key)
        if val is not None:
            return val
        # Check nested image_metadata or metadata if present
        meta = obj.get("image_metadata") or obj.get("metadata")
        if isinstance(meta, dict):
            return meta.get(key, default)
        elif meta is not None and hasattr(meta, key):
            return getattr(meta, key, default)
        return default
    if hasattr(obj, key):
        val = getattr(obj, key)
        if val is not None:
            return val
    meta = getattr(obj, "image_metadata", None) or getattr(obj, "metadata", None)
    if meta is not None:
        if isinstance(meta, dict):
            return meta.get(key, default)
        elif hasattr(meta, key):
            return getattr(meta, key, default)
    return default


def _normalize_score_100(val: float | None, default: float = 80.0) -> float:
    """Normalize a score that might be 0.0-1.0 or 0.0-100.0 into 0-100."""
    if val is None:
        return default
    try:
        f = float(val)
        if 0.0 <= f <= 1.0:
            return f * 100.0
        return max(0.0, min(100.0, f))
    except (ValueError, TypeError):
        return default


def _eval_single_image_quality(img: Any) -> dict[str, Any]:
    """Evaluate quality sub-metrics for a single image."""
    angle_type = _extract_val(img, "angle_type", "unknown")
    quality_flags = _extract_val(img, "quality_flags") or {}
    client_checks = _extract_val(img, "client_checks") or {}
    server_checks = _extract_val(img, "server_checks") or {}

    if isinstance(quality_flags, list):
        qf_dict = {str(flag): True for flag in quality_flags}
    else:
        qf_dict = dict(quality_flags) if isinstance(quality_flags, dict) else {}

    cc_dict = dict(client_checks) if isinstance(client_checks, dict) else {}
    dict(server_checks) if isinstance(server_checks, dict) else {}

    warnings: list[str] = []

    # 1. Blur Score (0-100, 100 is sharpest)
    raw_blur = _extract_val(img, "blur_score")
    if raw_blur is not None:
        blur_score = _normalize_score_100(raw_blur)
    elif qf_dict.get("blur") or cc_dict.get("blur") or "blur" in qf_dict:
        blur_score = 25.0
        warnings.append(f"{angle_type}: Image is blurry")
    else:
        blur_score = 85.0

    if blur_score < 40.0 and f"{angle_type}: Image is blurry" not in warnings:
        warnings.append(f"{angle_type}: Image is blurry (score={blur_score:.1f})")

    # 2. Brightness / Exposure Score (0-100, 100 is optimal)
    raw_brightness = _extract_val(img, "brightness_score")
    if raw_brightness is not None:
        raw_b = float(raw_brightness)
        if 0.0 <= raw_b <= 1.0:
            raw_b = raw_b * 100.0
        # Optimal brightness is around 40-75. Penalize extreme under/over exposure
        if 40.0 <= raw_b <= 75.0:
            brightness_score = 90.0
        elif 25.0 <= raw_b < 40.0 or 75.0 < raw_b <= 85.0:
            brightness_score = 65.0
        elif raw_b < 25.0:
            brightness_score = 25.0
            warnings.append(f"{angle_type}: Image is underexposed")
        else:
            brightness_score = 30.0
            warnings.append(f"{angle_type}: Image is overexposed")
    elif qf_dict.get("underexposed") or cc_dict.get("underexposed"):
        brightness_score = 25.0
        warnings.append(f"{angle_type}: Image is underexposed")
    elif qf_dict.get("overexposed") or cc_dict.get("overexposed"):
        brightness_score = 30.0
        warnings.append(f"{angle_type}: Image is overexposed")
    else:
        brightness_score = 85.0

    # 3. Resolution Score (0-100)
    width = _extract_val(img, "width")
    height = _extract_val(img, "height")
    low_res_flag = qf_dict.get("low_resolution") or cc_dict.get("low_resolution")

    if width is not None and height is not None:
        min_dim = min(int(width), int(height))
        max(int(width), int(height))
        mp = (int(width) * int(height)) / 1_000_000.0
        if min_dim >= 720 and mp >= 1.0:
            res_score = 95.0
        elif min_dim >= 480:
            res_score = 70.0
        else:
            res_score = 30.0
            warnings.append(f"{angle_type}: Resolution too low ({width}x{height})")
    elif low_res_flag:
        res_score = 30.0
        warnings.append(f"{angle_type}: Image resolution is below acceptable threshold")
    else:
        res_score = 85.0

    # 4. Framing / Aspect Ratio Score (0-100)
    raw_framing = _extract_val(img, "framing_score")
    aspect_flag = qf_dict.get("suspicious_aspect_ratio") or cc_dict.get("suspicious_aspect_ratio")
    if raw_framing is not None:
        framing_score = _normalize_score_100(raw_framing)
    elif aspect_flag:
        framing_score = 35.0
        warnings.append(f"{angle_type}: Suspicious or distorted aspect ratio")
    else:
        framing_score = 85.0

    # 5. Crop Visibility Score (0-100)
    raw_crop_vis = _extract_val(img, "crop_visibility_score")
    if raw_crop_vis is not None:
        crop_vis_score = _normalize_score_100(raw_crop_vis)
    elif qf_dict.get("crop_not_visible") or qf_dict.get("crop_visible") is False:
        crop_vis_score = 20.0
        warnings.append(f"{angle_type}: Crop foliage is not clearly visible")
    else:
        crop_vis_score = 85.0

    # 6. Damage Visibility Score (0-100)
    raw_damage_vis = _extract_val(img, "damage_visibility_score")
    if raw_damage_vis is not None:
        damage_vis_score = _normalize_score_100(raw_damage_vis)
    elif qf_dict.get("damage_not_visible") or qf_dict.get("damage_visible") is False:
        damage_vis_score = 25.0
        warnings.append(f"{angle_type}: Damage symptoms not clearly captured")
    else:
        damage_vis_score = 85.0

    # Image-level composite quality
    # Image-level composite quality
    img_composite = (
        0.30 * blur_score
        + 0.20 * brightness_score
        + 0.20 * res_score
        + 0.10 * framing_score
        + 0.10 * crop_vis_score
        + 0.10 * damage_vis_score
    )

    if blur_score < 40.0:
        img_composite = min(img_composite, blur_score * 1.5)

    return {
        "angle_type": angle_type,
        "composite_score": round(img_composite, 1),
        "blur": round(blur_score, 1),
        "brightness": round(brightness_score, 1),
        "resolution": round(res_score, 1),
        "framing": round(framing_score, 1),
        "crop_visibility": round(crop_vis_score, 1),
        "damage_visibility": round(damage_vis_score, 1),
        "warnings": warnings,
        "is_usable": (img_composite >= 40.0 and blur_score >= 35.0),
    }


def evaluate_evidence_quality(
    images: list[dict[str, Any] | Any],
    **kwargs: Any,
) -> dict[str, Any]:
    """Evaluate overall Evidence Quality score and components from submission images.

    Returns:
        dict containing:
        - score: int [0, 100]
        - available: bool
        - components: dict with blur, brightness, resolution, framing,
                      crop_visibility, damage_visibility, consistency
        - warnings: list of str
        - details: dict of per-image breakdown
    """
    if not images:
        return {
            "score": 0,
            "available": False,
            "reason": "no_images_provided",
            "components": {
                "blur": None,
                "brightness": None,
                "resolution": None,
                "framing": None,
                "crop_visibility": None,
                "damage_visibility": None,
                "consistency": None,
            },
            "warnings": ["No images provided for quality evaluation"],
            "details": {
                "image_evaluations": [],
                "usable_image_count": 0,
                "total_image_count": 0,
            },
        }

    image_evals: list[dict[str, Any]] = []
    all_warnings: list[str] = []

    for img in images:
        ev = _eval_single_image_quality(img)
        image_evals.append(ev)
        all_warnings.extend(ev["warnings"])

    n = len(image_evals)
    avg_blur = sum(e["blur"] for e in image_evals) / n
    avg_brightness = sum(e["brightness"] for e in image_evals) / n
    avg_resolution = sum(e["resolution"] for e in image_evals) / n
    avg_framing = sum(e["framing"] for e in image_evals) / n
    avg_crop_vis = sum(e["crop_visibility"] for e in image_evals) / n
    avg_damage_vis = sum(e["damage_visibility"] for e in image_evals) / n

    # Consistency across images: evaluate variance of composite quality & brightness
    if n > 1:
        composites = [e["composite_score"] for e in image_evals]
        mean_c = sum(composites) / n
        var_c = sum((c - mean_c) ** 2 for c in composites) / n
        std_c = math.sqrt(var_c)
        # Low std dev (< 10) gives high consistency (90+), large std dev (> 30) gives low consistency (< 60)
        consistency_score = max(20.0, min(100.0, 100.0 - (std_c * 1.5)))
    else:
        consistency_score = 85.0

    # Overall Quality Score: weighted aggregation across the 7 subcomponents
    overall = (
        0.25 * avg_blur
        + 0.15 * avg_brightness
        + 0.20 * avg_resolution
        + 0.10 * avg_framing
        + 0.15 * avg_crop_vis
        + 0.10 * avg_damage_vis
        + 0.05 * consistency_score
    )

    if avg_blur < 40.0:
        overall = min(overall, avg_blur * 1.5)

    final_score = round(max(0.0, min(100.0, overall)))

    usable_count = sum(1 for e in image_evals if e["is_usable"])

    return {
        "score": final_score,
        "available": True,
        "components": {
            "blur": round(avg_blur),
            "brightness": round(avg_brightness),
            "resolution": round(avg_resolution),
            "framing": round(avg_framing),
            "crop_visibility": round(avg_crop_vis),
            "damage_visibility": round(avg_damage_vis),
            "consistency": round(consistency_score),
        },
        "warnings": all_warnings,
        "details": {
            "image_evaluations": image_evals,
            "usable_image_count": usable_count,
            "total_image_count": n,
        },
    }
