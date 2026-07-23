"""Experimental locally fine-tuned ViT crop-health adapter.

The A/B/C/U result is a human-review workflow bucket, never a severity,
affected-area, commodity-quality, yield, claim, or payout decision.
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
MODEL_DIR = ROOT / "models" / "crop_health_vit_v3"
DEFAULT_MODEL = MODEL_DIR / "model.onnx"
MODEL_META = MODEL_DIR / "model.json"
LABELS_META = MODEL_DIR / "labels.json"

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
    shifted -= float(np.max(shifted))
    exp = np.exp(shifted)
    return (exp / max(float(exp.sum()), 1e-12)).astype(np.float32)


@lru_cache(maxsize=2)
def _cached_session(model_path: str):
    try:
        import onnxruntime as ort
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError("ONNX Runtime is required for crop_health_v3") from exc
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    return ort.InferenceSession(
        model_path,
        sess_options=options,
        providers=["CPUExecutionProvider"],
    )


class CropHealthViTV3Adapter(ModelAdapter):
    """Run the strongest experimental local checkpoint through ONNX Runtime."""

    name = "fasalpramaan-crop-health-vit-v3-experimental"
    version = "3.0.0-experimental"
    adapter_type = "crop_health_v3"
    is_production_validated = False

    def __init__(self, model_path: Optional[Path] = None) -> None:
        self.model_path = Path(model_path) if model_path else DEFAULT_MODEL
        self.meta = json.loads(MODEL_META.read_text(encoding="utf-8"))
        self.labels: list[str] = json.loads(LABELS_META.read_text(encoding="utf-8"))["labels"]
        self.supported_crops = set(self.meta["supported_crop_codes"])
        self.temperature = float(self.meta["temperature"])
        self.crop_mismatch_threshold = float(self.meta["crop_mismatch_threshold"])
        self.grade_b_threshold = float(self.meta["manual_review_grade_b_threshold"])

    def available(self) -> bool:
        return self.model_path.is_file()

    def _ensure_session(self):
        if not self.available():
            raise FileNotFoundError(f"Experimental crop ViT missing: {self.model_path}")
        session = _cached_session(str(self.model_path.resolve()))
        model_input = session.get_inputs()[0]
        model_output = session.get_outputs()[0]
        if model_input.name != "pixel_values" or model_output.name != "logits":
            raise RuntimeError("crop_health_v3 ONNX input/output names do not match metadata")
        if model_output.shape[-1] != len(self.labels):
            raise RuntimeError("crop_health_v3 ONNX label count does not match labels.json")
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

    @staticmethod
    def _preprocess(image: Image.Image) -> np.ndarray:
        resized = image.resize((224, 224), Image.Resampling.BILINEAR)
        values = np.asarray(resized, dtype=np.float32) / 255.0
        values = (values - 0.5) / 0.5
        return np.transpose(values, (2, 0, 1))[None].astype(np.float32)

    def _crop_scores(self, probabilities: np.ndarray) -> dict[str, float]:
        return {
            crop: float(
                probabilities[self.labels.index(f"{crop}__healthy")]
                + probabilities[self.labels.index(f"{crop}__disease")]
            )
            for crop in sorted(self.supported_crops)
        }

    def analyze(self, request: dict[str, Any]) -> dict[str, Any]:
        started = time.perf_counter()
        session = self._ensure_session()
        raw_expected = str(request.get("expected_crop") or "").strip().lower()
        expected = CROP_ALIASES.get(raw_expected, raw_expected)
        warnings: list[str] = []
        per_image: list[dict[str, Any]] = []
        weighted: list[np.ndarray] = []
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
            logits = session.run(["logits"], {"pixel_values": self._preprocess(image)})[0][0]
            probabilities = _softmax(np.asarray(logits), self.temperature)
            index = int(probabilities.argmax())
            weight = ANGLE_WEIGHTS.get(angle, 0.5)
            weighted.append(probabilities * weight)
            weights.append(weight)
            per_image.append(
                {
                    "angle_type": angle,
                    "predicted_class": self.labels[index],
                    "confidence": round(float(probabilities[index]), 4),
                    "view_weight": weight,
                }
            )

        if weighted:
            aggregate = np.sum(weighted, axis=0) / max(sum(weights), 1e-12)
        else:
            aggregate = np.zeros(len(self.labels), dtype=np.float32)
            aggregate[self.labels.index("invalid__ood")] = 1.0
            warnings.append("no_usable_image_pixels")

        crop_scores = self._crop_scores(aggregate)
        predicted_crop = max(crop_scores, key=crop_scores.get)
        crop_confidence = crop_scores[predicted_crop]
        grade = "U"
        grade_label = "unusable_or_out_of_domain"
        recommendation = "recapture"
        decision_confidence = float(aggregate[self.labels.index("invalid__ood")])
        healthy_score = 0.0
        disease_score = 0.0
        invalid_score = float(aggregate[self.labels.index("invalid__ood")])
        selected_class: str | None = None

        if not raw_expected:
            warnings.append("expected_crop_required")
            grade_label = "missing_expected_crop_metadata"
            recommendation = "physical_inspection"
        elif expected not in self.supported_crops:
            warnings.append("unsupported_crop")
            grade_label = "unsupported_crop"
            recommendation = "physical_inspection"
        elif not weighted:
            pass
        elif predicted_crop != expected and crop_confidence >= self.crop_mismatch_threshold:
            warnings.append("crop_prediction_differs_from_cycle")
            grade_label = "crop_mismatch"
            recommendation = "physical_inspection"
            decision_confidence = crop_confidence
        else:
            healthy_index = self.labels.index(f"{expected}__healthy")
            disease_index = self.labels.index(f"{expected}__disease")
            invalid_index = self.labels.index("invalid__ood")
            restricted = aggregate[[healthy_index, disease_index, invalid_index]]
            restricted = restricted / max(float(restricted.sum()), 1e-12)
            healthy_score, disease_score, invalid_score = map(float, restricted)
            restricted_index = int(restricted.argmax())
            decision_confidence = float(restricted[restricted_index])
            if restricted_index == 2:
                grade_label = "unusable_or_out_of_domain"
                recommendation = "recapture"
            elif decision_confidence < self.grade_b_threshold:
                grade = "B"
                grade_label = "uncertain_manual_review"
                recommendation = "low_confidence_review"
                selected_class = self.labels[[healthy_index, disease_index][restricted_index]]
            elif restricted_index == 0:
                grade = "A"
                grade_label = "healthy_leaf_signal"
                recommendation = "normal_human_review"
                selected_class = self.labels[healthy_index]
            else:
                grade = "C"
                grade_label = "disease_pattern_signal"
                recommendation = "normal_human_review"
                selected_class = self.labels[disease_index]

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
                "NON-PRODUCTION experimental crop-health screening. A/B/C/U are demo "
                "workflow buckets, not severity, affected area, yield loss, commodity "
                "quality, claim eligibility, or payout advice. Human review is mandatory."
            ),
            "image_validation": {"passed": bool(weighted) and grade != "U", "issues": unique_warnings},
            "predicted_crop": predicted_crop if weighted else "unknown",
            "crop_confidence": round(crop_confidence if weighted else 0.0, 4),
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
            "damage_categories": {key: round(value, 4) for key, value in damage_scores.items()},
            "primary_damage": "healthy" if grade == "A" else "disease" if grade == "C" else "unknown",
            "plant_disease_class": selected_class,
            "estimated_affected_area_pct": None,
            "severity": None,
            "quality_warnings": unique_warnings,
            "anomaly_flags": [value for value in ("crop_mismatch" if grade_label == "crop_mismatch" else None,) if value],
            "overall_confidence": round(decision_confidence, 4),
            "human_review_recommendation": recommendation,
            "explanation": {
                "method": "local_finetuned_vit_tiny_onnx_expected_crop_hierarchy",
                "predicted_class": selected_class,
                "per_image": per_image,
                "aggregation": "angle_weighted_calibrated_probability_mean",
                "expected_crop": expected or None,
                "supported_crops": sorted(self.supported_crops),
                "grade_definition": {
                    "A": "confident healthy-leaf signal",
                    "B": "uncertain signal; manual review",
                    "C": "confident disease-pattern signal",
                    "U": "unusable, unsupported, OOD, crop mismatch, or missing crop metadata",
                },
                "known_limit": "Failed frozen field-generalization and ECE promotion gates.",
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
