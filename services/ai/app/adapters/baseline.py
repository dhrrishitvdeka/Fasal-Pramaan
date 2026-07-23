"""Baseline computer-vision heuristics adapter — NON-PRODUCTION.

Uses OpenCV/Pillow for image quality signals and simple colour/texture
heuristics. This is NOT a trained crop-damage classifier and must not be
represented as insurance-grade accuracy.
"""

from __future__ import annotations

import io
import time
from typing import Any, Optional

import numpy as np
from PIL import Image

from app.adapters.base import DAMAGE_CATEGORIES, ModelAdapter

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None  # type: ignore


class BaselineCVAdapter(ModelAdapter):
    name = "fasalpramaan-crop-damage"
    version = "0.1.0-baseline"
    adapter_type = "baseline"
    is_production_validated = False

    def analyze(self, request: dict[str, Any]) -> dict[str, Any]:
        t0 = time.perf_counter()
        expected = request.get("expected_crop") or "unknown"
        images = request.get("images") or []
        quality_warnings: list[str] = []
        anomaly_flags: list[str] = []

        green_ratios: list[float] = []
        brightness_vals: list[float] = []
        blur_vals: list[float] = []

        for img in images:
            arr = self._load_array(img)
            if arr is None:
                quality_warnings.append("image_bytes_unavailable")
                continue
            h, w = arr.shape[:2]
            if min(h, w) < 200:
                quality_warnings.append("very_low_resolution")
            gray = self._to_gray(arr)
            bright = float(np.mean(gray))
            brightness_vals.append(bright)
            if bright < 40:
                quality_warnings.append("severe_underexposure")
            if bright > 220:
                quality_warnings.append("severe_overexposure")
            blur = self._laplacian_var(gray)
            blur_vals.append(blur)
            if blur < 50:
                quality_warnings.append("excessive_blur")
            green_ratio = self._green_ratio(arr)
            green_ratios.append(green_ratio)

        # Heuristic damage scores from colour cues — illustrative only
        avg_green = float(np.mean(green_ratios)) if green_ratios else 0.3
        scores = {d: 0.05 for d in DAMAGE_CATEGORIES}
        if avg_green > 0.35:
            scores["healthy"] = 0.55
            primary = "healthy"
            severity = "none"
            area = 5.0
        elif avg_green > 0.2:
            scores["nutrient_deficiency"] = 0.4
            scores["drought_stress"] = 0.35
            primary = "nutrient_deficiency"
            severity = "low"
            area = 18.0
        else:
            scores["flood"] = 0.3
            scores["waterlogging"] = 0.28
            scores["unknown"] = 0.25
            primary = "unknown"
            severity = "medium"
            area = 30.0

        conf = 0.45
        if green_ratios and not quality_warnings:
            conf = 0.58
        if quality_warnings:
            conf = min(conf, 0.4)

        meta = request.get("metadata") or {}
        if meta.get("anomaly_flags", {}).get("outside_plot_proximity"):
            anomaly_flags.append("location_outside_plot")

        recommendation = "normal_review"
        if conf < 0.55:
            recommendation = "low_confidence_review"
        if any(w in quality_warnings for w in ("excessive_blur", "severe_underexposure", "severe_overexposure")):
            recommendation = "recapture"

        elapsed = int((time.perf_counter() - t0) * 1000)
        return {
            "model_version": self.version,
            "adapter_type": self.adapter_type,
            "is_production_validated": False,
            "development_disclaimer": (
                "NON-PRODUCTION baseline heuristics using colour/blur signals. "
                "Not a trained insurance model. Replace via ModelAdapter + labelled dataset."
            ),
            "image_validation": {
                "passed": recommendation != "recapture",
                "issues": quality_warnings,
                "blur_scores": blur_vals,
                "brightness_scores": brightness_vals,
                "green_ratios": green_ratios,
            },
            "predicted_crop": expected if expected != "unknown" else "unknown",
            "crop_confidence": 0.4 if expected == "unknown" else 0.55,
            "predicted_growth_stage": "vegetative",
            "growth_stage_confidence": 0.4,
            "damage_categories": scores,
            "primary_damage": primary,
            "estimated_affected_area_pct": area,
            "severity": severity,
            "quality_warnings": quality_warnings,
            "anomaly_flags": anomaly_flags,
            "overall_confidence": conf,
            "human_review_recommendation": recommendation,
            "explanation": {
                "method": "opencv_colour_blur_heuristics",
                "avg_green_ratio": avg_green,
                "note": "Baseline only — fine-tune with labelled data before production use",
            },
            "processing_duration_ms": max(elapsed, 1),
        }

    def _load_array(self, img: dict[str, Any]) -> Optional[np.ndarray]:
        raw = img.get("bytes") or img.get("image_bytes")
        if raw is None:
            return None
        if isinstance(raw, str):
            import base64

            raw = base64.b64decode(raw)
        try:
            pil = Image.open(io.BytesIO(raw)).convert("RGB")
            return np.array(pil)
        except Exception:
            return None

    def _to_gray(self, arr: np.ndarray) -> np.ndarray:
        if cv2 is not None:
            return cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        return np.mean(arr, axis=2).astype(np.uint8)

    def _laplacian_var(self, gray: np.ndarray) -> float:
        if cv2 is not None:
            return float(cv2.Laplacian(gray, cv2.CV_64F).var())
        # Fallback: gradient magnitude variance
        gy, gx = np.gradient(gray.astype(float))
        return float(np.var(gx) + np.var(gy))

    def _green_ratio(self, arr: np.ndarray) -> float:
        r = arr[:, :, 0].astype(float)
        g = arr[:, :, 1].astype(float)
        b = arr[:, :, 2].astype(float)
        mask = (g > r) & (g > b) & (g > 40)
        return float(np.mean(mask))
