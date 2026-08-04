"""Hierarchical crop analysis stages (xyz.md §1).

Stage order:
  1. Image quality & OOD gate
  2. Crop species check (ViT hook / heuristic)
  3. Damage / severity classification

Failed quality/OOD or crop-vs-parcel mismatch stops before damage inference
when configured to block (default).
"""

from __future__ import annotations

import base64
import io
import os
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
from PIL import Image

from app.adapters.base import DAMAGE_CATEGORIES

# HuggingFace model IDs from xyz.md (loaded only when weights available)
HF_CROP_VIT_ID = "wambugu71/crop_leaf_diseases_vit"
HF_DAMAGE_VIT_ID = "LishaV01/agriculture-crop-disease-detection"


@dataclass
class StageResult:
    name: str
    passed: bool
    details: dict[str, Any] = field(default_factory=dict)
    recommendation: Optional[str] = None  # e.g. recapture, reject


def _decode_image(img: dict[str, Any]) -> Optional[Image.Image]:
    raw = img.get("bytes") or img.get("image_bytes")
    if raw is None:
        return None
    try:
        if isinstance(raw, str):
            data = base64.b64decode(raw)
        else:
            data = bytes(raw)
        return Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        return None


def stage_quality_ood(request: dict[str, Any]) -> StageResult:
    """Stage 2 in product order (runs first on pixels): quality + OOD gate.

    Filters non-crop / unusable inputs (too small, uniform, extreme aspect)
    without requiring heavy VLM weights.
    """
    issues: list[str] = []
    images = request.get("images") or []
    if not images:
        issues.append("no_images")
        return StageResult(
            name="quality_ood",
            passed=False,
            details={"issues": issues, "backend": "heuristic"},
            recommendation="recapture",
        )

    decoded_count = 0
    ood_flags: list[str] = []
    for img in images:
        size = img.get("byte_size") or 0
        if size and size < 8_000:
            issues.append("very_low_byte_size")
        pil = _decode_image(img)
        if pil is None:
            # Metadata-only path: soft fail if size clearly tiny
            if size and size < 5_000:
                issues.append("unreadable_or_tiny_image")
            continue
        decoded_count += 1
        w, h = pil.size
        if w < 64 or h < 64:
            issues.append("resolution_too_low")
        aspect = w / max(h, 1)
        if aspect > 3.0 or aspect < 0.33:
            issues.append("extreme_aspect_ratio")
        arr = np.asarray(pil.resize((64, 64)), dtype=np.float32)
        # Near-uniform (blank/selfie-dark) heuristic
        std = float(arr.std())
        if std < 8.0:
            ood_flags.append("low_variance_ood")
        # Green-ish vegetation proxy (crop leaves tend to have green channel energy)
        mean_rgb = arr.mean(axis=(0, 1))
        g_ratio = float(mean_rgb[1] / (mean_rgb.sum() + 1e-6))
        if g_ratio < 0.28 and std > 15:
            ood_flags.append("low_vegetation_signal")

    if decoded_count == 0 and any(
        (i.get("byte_size") or 0) > 0 and not (i.get("image_bytes") or i.get("bytes"))
        for i in images
    ):
        # Pixel validation is a required evidence gate. Metadata alone cannot
        # establish that an object is a usable crop photograph.
        return StageResult(
            name="quality_ood",
            passed=False,
            details={
                "issues": ["pixels_not_provided_cannot_validate"],
                "backend": "heuristic_metadata",
                "ood_flags": [],
            },
            recommendation="recapture",
        )

    hard = [x for x in issues if x in ("no_images", "resolution_too_low", "unreadable_or_tiny_image")]
    if "very_low_byte_size" in issues and decoded_count == 0:
        hard.append("very_low_byte_size")
    if ood_flags.count("low_variance_ood") >= max(1, decoded_count // 2) and decoded_count:
        hard.append("ood_blank_or_uniform")

    passed = len(hard) == 0
    rec = "recapture" if not passed else None
    return StageResult(
        name="quality_ood",
        passed=passed,
        details={
            "issues": issues + ood_flags,
            "decoded_count": decoded_count,
            "backend": "heuristic_clip_placeholder",
            "hf_vlm_note": "CLIP/VLM gate can replace heuristics when weights configured",
            "ood_flags": ood_flags,
        },
        recommendation=rec,
    )


def stage_crop_species(request: dict[str, Any]) -> StageResult:
    """Stage 1 product: crop species check vs parcel expected crop.

    Returns unknown when a configured image model is unavailable. Expected crop
    and client metadata are comparison inputs, never predictions.
    HF id: wambugu71/crop_leaf_diseases_vit
    """
    expected = (request.get("expected_crop") or "").strip().lower() or None
    force_mismatch = bool((request.get("metadata") or {}).get("force_crop_mismatch"))
    backend = "heuristic"
    predicted = "unknown"
    confidence = 0.0

    # Optional HF transformers path (only if explicitly enabled and installed)
    if os.getenv("AI_ENABLE_HF_CROP_VIT", "false").lower() in ("1", "true", "yes"):
        try:
            predicted, confidence, backend = _hf_crop_predict(request)
        except Exception as exc:  # noqa: BLE001
            backend = f"hf_unavailable:{type(exc).__name__}"

    if force_mismatch and expected:
        predicted = "mismatch_forced_other"
        confidence = 0.9
        backend = "test_force_mismatch"

    mismatch = False
    if expected and predicted and predicted not in ("unknown", expected):
        # Normalize common aliases
        aliases = {
            "paddy": {"rice", "paddy"},
            "rice": {"rice", "paddy"},
            "maize": {"corn", "maize"},
            "corn": {"corn", "maize"},
        }
        exp_set = aliases.get(expected, {expected})
        pred_set = aliases.get(predicted, {predicted})
        if not exp_set.intersection(pred_set):
            mismatch = True

    # Only hard-reject on high-confidence mismatch
    reject = mismatch and confidence >= 0.65
    return StageResult(
        name="crop_species",
        passed=not reject,
        details={
            "expected_crop": expected,
            "predicted_crop": predicted,
            "crop_confidence": round(confidence, 3),
            "mismatch": mismatch,
            "backend": backend,
            "hf_model_id": HF_CROP_VIT_ID,
        },
        recommendation="reject_crop_mismatch" if reject else None,
    )


def _hf_crop_predict(request: dict[str, Any]) -> tuple[str, float, str]:
    """Optional transformers inference — not required for unit tests."""
    from transformers import pipeline  # type: ignore

    clf = pipeline("image-classification", model=HF_CROP_VIT_ID)
    for img in request.get("images") or []:
        pil = _decode_image(img)
        if pil is None:
            continue
        out = clf(pil)
        if out:
            label = str(out[0].get("label", "unknown")).lower()
            score = float(out[0].get("score", 0.5))
            # Map model labels to crop codes when possible
            for crop in ("tomato", "potato", "apple", "corn", "maize", "rice", "wheat", "soybean"):
                if crop in label:
                    return crop, score, "hf_vit"
            return label.split()[0] if label else "unknown", score, "hf_vit"
    return "unknown", 0.5, "hf_vit_no_image"


def stage_damage(
    request: dict[str, Any],
    *,
    damage_adapter: Any = None,
) -> StageResult:
    """Stage 3: damage / severity. Uses plant_disease or mock adapter.

    HF damage backbone id (optional): LishaV01/agriculture-crop-disease-detection
    """
    if damage_adapter is None:
        from app.adapters import get_adapter

        name = os.getenv("AI_DAMAGE_ADAPTER") or os.getenv("AI_MODEL_ADAPTER", "crop_vit")
        if name == "hierarchical":
            name = "crop_vit"
        damage_adapter = get_adapter(name)

    result = damage_adapter.analyze(request)
    return StageResult(
        name="damage",
        passed=True,
        details={
            "prediction": result,
            "backend": getattr(damage_adapter, "adapter_type", "unknown"),
            "hf_model_id": HF_DAMAGE_VIT_ID,
        },
        recommendation=result.get("human_review_recommendation"),
    )


def run_hierarchical_pipeline(
    request: dict[str, Any],
    *,
    damage_adapter: Any = None,
    block_on_quality: bool = True,
    block_on_crop_mismatch: bool = True,
) -> dict[str, Any]:
    """Run stages in order: quality_ood → crop_species → damage (if gates pass)."""
    t0 = time.perf_counter()
    stages: list[dict[str, Any]] = []

    # Product doc order is crop → quality → damage; we quality-first so we never
    # spend crop/damage compute on blank/OOD frames (and still report both stages).
    q = stage_quality_ood(request)
    stages.append({"stage": q.name, "passed": q.passed, **q.details, "recommendation": q.recommendation})

    if block_on_quality and not q.passed:
        return _early_exit(
            request,
            stages,
            recommendation=q.recommendation or "recapture",
            reason="quality_ood_failed",
            t0=t0,
        )

    c = stage_crop_species(request)
    stages.append({"stage": c.name, "passed": c.passed, **c.details, "recommendation": c.recommendation})

    if block_on_crop_mismatch and not c.passed:
        return _early_exit(
            request,
            stages,
            recommendation=c.recommendation or "reject_crop_mismatch",
            reason="crop_mismatch",
            t0=t0,
            predicted_crop=c.details.get("predicted_crop"),
            crop_confidence=c.details.get("crop_confidence"),
        )

    d = stage_damage(request, damage_adapter=damage_adapter)
    pred = dict(d.details.get("prediction") or {})
    stages.append(
        {
            "stage": d.name,
            "passed": d.passed,
            "backend": d.details.get("backend"),
            "hf_model_id": d.details.get("hf_model_id"),
            "recommendation": d.recommendation,
        }
    )

    # Fuse crop stage into final prediction
    # Prefer a real crop-stage result; otherwise retain a crop result produced
    # by the damage model. Never replace either with expected_crop.
    if c.details.get("predicted_crop") not in (None, "unknown"):
        pred["predicted_crop"] = c.details.get("predicted_crop")
        pred["crop_confidence"] = c.details.get("crop_confidence")
    pred["pipeline"] = {
        "name": "hierarchical_crop_vit",
        "stages": stages,
        "order": ["quality_ood", "crop_species", "damage"],
        "xyz_md_section": 1,
    }
    pred["adapter_type"] = "hierarchical"
    pred["model_version"] = pred.get("model_version", "hierarchical-1.0.0")
    pred["is_production_validated"] = False
    pred.setdefault(
        "development_disclaimer",
        "NON-PRODUCTION hierarchical pipeline — ViT/HF weights optional; human review required.",
    )
    pred["processing_duration_ms"] = int((time.perf_counter() - t0) * 1000)
    # Preserve quality issues on final payload
    q_issues = q.details.get("issues") or []
    pred.setdefault("quality_warnings", [])
    if isinstance(pred["quality_warnings"], list):
        pred["quality_warnings"] = list(dict.fromkeys(list(pred["quality_warnings"]) + list(q_issues)))
    pred["image_validation"] = {
        "passed": q.passed,
        "issues": q_issues,
    }
    return pred


def _early_exit(
    request: dict[str, Any],
    stages: list[dict[str, Any]],
    *,
    recommendation: str,
    reason: str,
    t0: float,
    predicted_crop: Any = None,
    crop_confidence: Any = None,
) -> dict[str, Any]:
    scores = {d: 0.0 for d in DAMAGE_CATEGORIES}
    scores["unknown"] = 0.1
    return {
        "model_version": "hierarchical-1.0.0-early-exit",
        "adapter_type": "hierarchical",
        "is_production_validated": False,
        "development_disclaimer": (
            "NON-PRODUCTION hierarchical pipeline — blocked before damage inference. "
            "Human review required."
        ),
        "image_validation": {
            "passed": recommendation != "recapture",
            "issues": [reason],
        },
        "predicted_crop": predicted_crop or "unknown",
        "crop_confidence": crop_confidence or 0.0,
        "predicted_growth_stage": None,
        "growth_stage_confidence": None,
        "damage_categories": scores,
        "primary_damage": "unknown",
        "estimated_affected_area_pct": None,
        "severity": None,
        "quality_warnings": [reason],
        "anomaly_flags": [reason],
        "overall_confidence": 0.0,
        "human_review_recommendation": "recapture"
        if recommendation == "recapture"
        else "physical_inspection"
        if recommendation == "reject_crop_mismatch"
        else recommendation,
        "explanation": {
            "method": "hierarchical_early_exit",
            "reason": reason,
            "damage_stage_skipped": True,
        },
        "pipeline": {
            "name": "hierarchical_crop_vit",
            "stages": stages,
            "order": ["quality_ood", "crop_species", "damage"],
            "early_exit": True,
            "xyz_md_section": 1,
        },
        "processing_duration_ms": int((time.perf_counter() - t0) * 1000),
    }
