"""Promoted local DINOv2 crop-health screening adapter.

A/B/C/U are human-review workflow buckets. They are never severity, affected
area, commodity quality, yield, claim eligibility, or payout decisions.
"""

from __future__ import annotations

import base64
import io
import json
import time
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import numpy as np
from PIL import Image

from app.adapters.base import DAMAGE_CATEGORIES, ModelAdapter


ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "models" / "crop_health_dinov2_v14"
DEFAULT_MODEL = MODEL_DIR / "model.onnx"
MODEL_META = MODEL_DIR / "model.json"
LABELS_META = MODEL_DIR / "labels.json"
PREPROCESSING_META = MODEL_DIR / "preprocessing.json"

ANGLE_WEIGHTS = {"closeup_damage": 1.0, "mid_canopy": 0.65, "wide_field": 0.35}
CROP_ALIASES = {
    "corn": "maize",
    "maize": "maize",
    "rice": "paddy",
    "paddy": "paddy",
    "potato": "potato",
    "wheat": "wheat",
}


def _softmax(values: np.ndarray, temperature: float) -> np.ndarray:
    shifted = values.astype(np.float64) / temperature
    shifted -= shifted.max(axis=-1, keepdims=True)
    exponentials = np.exp(shifted)
    return (
        exponentials / np.maximum(exponentials.sum(axis=-1, keepdims=True), 1e-12)
    ).astype(np.float32)


@lru_cache(maxsize=2)
def _cached_session(model_path: str):
    try:
        import onnxruntime as ort
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError("ONNX Runtime is required for crop_health_v4") from exc
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    return ort.InferenceSession(
        model_path,
        sess_options=options,
        providers=["CPUExecutionProvider"],
    )


class CropHealthDinoV4Adapter(ModelAdapter):
    """Run the promoted local crop-conditioned DINOv2 ONNX model."""

    name = "fasalpramaan-crop-health-dinov2-v14"
    version = "4.0.0-dinov2-v14"
    adapter_type = "crop_health_v4"
    is_production_validated = False

    def __init__(self, model_path: Optional[Path] = None) -> None:
        self.model_path = Path(model_path) if model_path else DEFAULT_MODEL
        self.meta = json.loads(MODEL_META.read_text(encoding="utf-8"))
        labels = json.loads(LABELS_META.read_text(encoding="utf-8"))
        preprocessing = json.loads(PREPROCESSING_META.read_text(encoding="utf-8"))
        self.crops: list[str] = labels["crop_order"]
        self.conditioned_classes: list[str] = labels["conditioned_class_order"]
        self.supported_crops = set(self.crops)
        self.temperature = float(self.meta["temperature"])
        self.abstention_threshold = float(self.meta["abstention_threshold"])
        self.crop_mismatch_threshold = float(self.meta["crop_mismatch_threshold"])
        self.grade_b_threshold = float(self.meta["manual_review_grade_b_threshold"])
        self.mean = np.asarray(
            preprocessing["normalization_mean"], dtype=np.float32
        ).reshape(1, 1, 3)
        self.std = np.asarray(
            preprocessing["normalization_std"], dtype=np.float32
        ).reshape(1, 1, 3)

    def available(self) -> bool:
        return self.model_path.is_file()

    def _ensure_session(self):
        if not self.available():
            raise FileNotFoundError(f"Promoted crop DINOv2 missing: {self.model_path}")
        session = _cached_session(str(self.model_path.resolve()))
        model_input = session.get_inputs()[0]
        model_output = session.get_outputs()[0]
        if (
            model_input.name != "pixel_values"
            or model_output.name != "conditioned_logits"
        ):
            raise RuntimeError("crop_health_v4 ONNX names do not match metadata")
        if model_output.shape[-2:] != [len(self.crops), len(self.conditioned_classes)]:
            raise RuntimeError("crop_health_v4 ONNX output shape does not match labels")
        return session

    def readiness(self) -> tuple[bool, str | None]:
        try:
            self._ensure_session()
        except Exception as exc:  # noqa: BLE001
            return False, f"{type(exc).__name__}: {exc}"
        return True, None

    @staticmethod
    def _decode_image(image: dict[str, Any]) -> Optional[Image.Image]:
        raw = image.get("bytes") or image.get("image_bytes")
        if raw is None:
            return None
        try:
            if isinstance(raw, str):
                raw = base64.b64decode(raw, validate=True)
            return Image.open(io.BytesIO(bytes(raw))).convert("RGB")
        except Exception:  # noqa: BLE001
            return None

    def _preprocess(self, image: Image.Image) -> np.ndarray:
        resized = image.resize((224, 224), Image.Resampling.BILINEAR)
        values = np.asarray(resized, dtype=np.float32) / 255.0
        values = (values - self.mean) / self.std
        return np.transpose(values, (2, 0, 1))[None].astype(np.float32)

    def _head_summary(
        self, probabilities: np.ndarray
    ) -> tuple[str, float, np.ndarray]:
        health_mass = probabilities[:, :2].sum(axis=1)
        crop_index = int(health_mass.argmax())
        return self.crops[crop_index], float(health_mass[crop_index]), health_mass

    def analyze(self, request: dict[str, Any]) -> dict[str, Any]:
        started = time.perf_counter()
        session = self._ensure_session()
        raw_expected = str(request.get("expected_crop") or "").strip().lower()
        expected = CROP_ALIASES.get(raw_expected, raw_expected)
        expected_index = self.crops.index(expected) if expected in self.crops else None
        warnings: list[str] = []
        per_image: list[dict[str, Any]] = []
        weighted_heads: list[np.ndarray] = []
        weights: list[float] = []

        for item in request.get("images") or []:
            angle = str(item.get("angle_type") or "unknown")
            image = self._decode_image(item)
            if image is None:
                warnings.append("image_pixels_unavailable_or_invalid")
                per_image.append({"angle_type": angle, "skipped": True})
                continue
            if min(image.size) < 96:
                warnings.append("very_low_resolution")
            logits = session.run(
                ["conditioned_logits"], {"pixel_values": self._preprocess(image)}
            )[0][0]
            probabilities = _softmax(np.asarray(logits), self.temperature)
            predicted_crop, crop_confidence, _ = self._head_summary(probabilities)
            crop_index = (
                expected_index
                if expected_index is not None
                else self.crops.index(predicted_crop)
            )
            selected = probabilities[crop_index].copy()
            if float(selected.max()) < self.abstention_threshold:
                selected[:] = (0.0, 0.0, 1.0)
            selected_index = int(selected.argmax())
            weight = ANGLE_WEIGHTS.get(angle, 0.5)
            weighted_heads.append(probabilities * weight)
            weights.append(weight)
            predicted_state = self.conditioned_classes[selected_index]
            per_image.append(
                {
                    "angle_type": angle,
                    "predicted_crop": predicted_crop,
                    "crop_confidence": round(crop_confidence, 4),
                    "predicted_class": (
                        f"{self.crops[crop_index]}__{predicted_state}"
                        if predicted_state != "invalid"
                        else "invalid__ood"
                    ),
                    "confidence": round(float(selected[selected_index]), 4),
                    "view_weight": weight,
                }
            )

        if weighted_heads:
            aggregate_heads = np.sum(weighted_heads, axis=0) / max(
                sum(weights), 1e-12
            )
        else:
            aggregate_heads = np.zeros((len(self.crops), 3), dtype=np.float32)
            aggregate_heads[:, 2] = 1.0
            warnings.append("no_usable_image_pixels")

        predicted_crop, crop_confidence, crop_health_mass = self._head_summary(
            aggregate_heads
        )
        grade = "U"
        grade_label = "unusable_or_out_of_domain"
        recommendation = "recapture"
        decision_confidence = 1.0
        healthy_score = 0.0
        disease_score = 0.0
        invalid_score = 1.0
        selected_class: str | None = None

        if not raw_expected:
            warnings.append("expected_crop_required")
            grade_label = "missing_expected_crop_metadata"
            recommendation = "physical_inspection"
        elif expected_index is None:
            warnings.append("unsupported_crop")
            grade_label = "unsupported_crop"
            recommendation = "physical_inspection"
        elif not weighted_heads:
            pass
        else:
            selected = aggregate_heads[expected_index].copy()
            healthy_score, disease_score, invalid_score = map(float, selected)
            selected_index = int(selected.argmax())
            decision_confidence = float(selected[selected_index])
            mismatch = (
                predicted_crop != expected
                and crop_health_mass[self.crops.index(predicted_crop)]
                >= self.crop_mismatch_threshold
            )
            if mismatch:
                warnings.append("crop_prediction_differs_from_cycle")
                grade_label = "crop_mismatch"
                recommendation = "physical_inspection"
                decision_confidence = crop_confidence
            elif decision_confidence < self.abstention_threshold:
                grade_label = "low_confidence_unusable"
                recommendation = "recapture"
            elif selected_index == 2:
                grade_label = "unusable_or_out_of_domain"
                recommendation = "recapture"
            elif decision_confidence < self.grade_b_threshold:
                grade = "B"
                grade_label = "uncertain_manual_review"
                recommendation = "low_confidence_review"
                selected_class = f"{expected}__{self.conditioned_classes[selected_index]}"
            elif selected_index == 0:
                grade = "A"
                grade_label = "healthy_leaf_signal"
                recommendation = "normal_human_review"
                selected_class = f"{expected}__healthy"
            else:
                grade = "C"
                grade_label = "disease_pattern_signal"
                recommendation = "normal_human_review"
                selected_class = f"{expected}__disease"

        damage_scores = {category: 0.0 for category in DAMAGE_CATEGORIES}
        damage_scores["healthy"] = healthy_score
        damage_scores["disease"] = disease_score
        damage_scores["unknown"] = invalid_score
        unique_warnings = list(dict.fromkeys(warnings))
        elapsed = max(int((time.perf_counter() - started) * 1000), 1)
        return {
            "model_version": self.version,
            "adapter_type": self.adapter_type,
            "is_production_validated": False,
            "promotion_status": self.meta["promotion_status"],
            "development_disclaimer": (
                "NON-PRODUCTION crop-health screening. A/B/C/U are workflow "
                "buckets, not severity, affected area, yield loss, commodity "
                "quality, claim eligibility, or payout advice. Human review is mandatory."
            ),
            "image_validation": {
                "passed": bool(weighted_heads) and grade != "U",
                "issues": unique_warnings,
            },
            "predicted_crop": predicted_crop if weighted_heads else "unknown",
            "crop_confidence": round(crop_confidence if weighted_heads else 0.0, 4),
            "predicted_growth_stage": None,
            "growth_stage_confidence": None,
            "predicted_grade": grade,
            "grade_label": grade_label,
            "grade_confidence": round(decision_confidence, 4),
            "grade_scores": {
                "healthy_signal": round(healthy_score, 4),
                "disease_signal": round(disease_score, 4),
                "invalid_or_ood": round(invalid_score, 4),
            },
            "damage_categories": {
                key: round(value, 4) for key, value in damage_scores.items()
            },
            "primary_damage": (
                "healthy" if grade == "A" else "disease" if grade == "C" else "unknown"
            ),
            "plant_disease_class": selected_class,
            "estimated_affected_area_pct": None,
            "severity": None,
            "quality_warnings": unique_warnings,
            "anomaly_flags": (
                ["crop_mismatch"] if grade_label == "crop_mismatch" else []
            ),
            "overall_confidence": round(decision_confidence, 4),
            "human_review_recommendation": recommendation,
            "explanation": {
                "method": "local_crop_conditioned_dinov2_vits14_onnx",
                "predicted_class": selected_class,
                "per_image": per_image,
                "aggregation": "angle_weighted_calibrated_probability_mean",
                "expected_crop": expected or None,
                "supported_crops": self.crops,
                "grade_definition": {
                    "A": "confident healthy-leaf signal",
                    "B": "uncertain signal; manual review",
                    "C": "confident disease-pattern signal",
                    "U": "unusable, unsupported, OOD, crop mismatch, or missing metadata",
                },
                "known_limit": (
                    "Passed internal frozen promotion gates; independent field "
                    "validation and governance review are still required."
                ),
            },
            "capabilities": {
                "crop_identification": "maize_paddy_potato_wheat_leaf_only",
                "health_screening_grade": True,
                "growth_stage_detection": False,
                "multi_hazard_detection": False,
                "severity_estimation": False,
                "affected_area_estimation": False,
            },
            "processing_duration_ms": elapsed,
        }
