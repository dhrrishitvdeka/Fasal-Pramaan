"""Deterministic development/mock adapter — NON-PRODUCTION."""

from __future__ import annotations

import time
from typing import Any

from app.adapters.base import DAMAGE_CATEGORIES, ModelAdapter


class MockModelAdapter(ModelAdapter):
    name = "fasalpramaan-crop-damage"
    version = "1.0.0-mock"
    adapter_type = "mock"
    is_production_validated = False

    def analyze(self, request: dict[str, Any]) -> dict[str, Any]:
        t0 = time.perf_counter()
        sid = str(request.get("submission_id") or "seed")
        seed = sum(ord(c) for c in sid) or 42
        expected = request.get("expected_crop") or "unknown"
        images = request.get("images") or []

        primary = DAMAGE_CATEGORIES[seed % len(DAMAGE_CATEGORIES)]
        # Prefer healthy slightly when few images
        if len(images) < 2:
            primary = "unknown"

        scores = {
            d: round(0.02 + ((seed + i * 7) % 25) / 100.0, 3) for i, d in enumerate(DAMAGE_CATEGORIES)
        }
        conf = round(0.50 + (seed % 45) / 100.0, 3)
        scores[primary] = conf

        severity = "none"
        if primary != "healthy":
            severity = ["low", "medium", "high"][seed % 3]

        quality_warnings: list[str] = []
        anomaly_flags: list[str] = []
        meta = request.get("metadata") or {}
        if meta.get("anomaly_flags", {}).get("outside_plot_proximity"):
            anomaly_flags.append("location_outside_plot")
        if meta.get("capture_accuracy_m") and meta["capture_accuracy_m"] > 50:
            quality_warnings.append("weak_gps_accuracy")

        for img in images:
            if img.get("byte_size") and img["byte_size"] < 10_000:
                quality_warnings.append("very_low_resolution_or_size")

        overall = conf
        if quality_warnings:
            overall = min(overall, 0.45)

        recommendation = "normal_review"
        if overall < 0.55:
            recommendation = "low_confidence_review"
        if severity == "high":
            recommendation = "urgent_review"
        if "very_low_resolution_or_size" in quality_warnings:
            recommendation = "recapture"

        elapsed = int((time.perf_counter() - t0) * 1000)
        return {
            "model_version": self.version,
            "adapter_type": self.adapter_type,
            "is_production_validated": False,
            "development_disclaimer": (
                "NON-PRODUCTION: deterministic mock adapter. "
                "Not validated for insurance decisions. Do not report fabricated accuracy."
            ),
            "image_validation": {
                "passed": "recapture" not in recommendation,
                "issues": quality_warnings,
            },
            "predicted_crop": expected if expected != "unknown" else ["soybean", "paddy", "wheat"][seed % 3],
            "crop_confidence": round(0.65 + (seed % 20) / 100.0, 3),
            "predicted_growth_stage": ["vegetative", "flowering", "grain_filling"][seed % 3],
            "growth_stage_confidence": round(0.55 + (seed % 30) / 100.0, 3),
            "damage_categories": scores,
            "primary_damage": primary,
            "estimated_affected_area_pct": 0.0 if primary == "healthy" else float((seed % 55) + 5),
            "severity": severity,
            "quality_warnings": quality_warnings,
            "anomaly_flags": anomaly_flags,
            "overall_confidence": overall,
            "human_review_recommendation": recommendation,
            "explanation": {
                "method": "deterministic_hash_mock",
                "seed_source": "submission_id",
                "image_count": len(images),
            },
            "processing_duration_ms": max(elapsed, 1),
        }
