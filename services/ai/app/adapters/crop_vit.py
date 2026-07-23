"""Offline public ViT crop-health screening adapter.

The local ONNX asset is a quantized ViT-Tiny leaf classifier covering maize,
potato, rice and wheat. Its disease/healthy output is mapped to an explicit
presentation-only screening grade. The adapter never claims severity, affected
area, yield loss or insurance validity.
"""

from __future__ import annotations

import base64
import io
import json
import time
from pathlib import Path
from typing import Any, Optional

import numpy as np
from PIL import Image

from app.adapters.base import DAMAGE_CATEGORIES, ModelAdapter


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL = ROOT / "models" / "crop_vit" / "crop_leaf_diseases_vit.onnx"
MODEL_META = ROOT / "models" / "crop_vit" / "model.json"

ANGLE_WEIGHTS = {
    "closeup_damage": 1.0,
    "mid_canopy": 0.65,
    "wide_field": 0.35,
}
CROP_ALIASES = {
    "corn": "maize",
    "maize": "maize",
    "rice": "paddy",
    "paddy": "paddy",
    "potato": "potato",
    "wheat": "wheat",
}


def _softmax(values: np.ndarray) -> np.ndarray:
    shifted = values.astype(np.float64) - float(np.max(values))
    exp = np.exp(shifted)
    return (exp / max(float(exp.sum()), 1e-12)).astype(np.float32)


class CropViTAdapter(ModelAdapter):
    """Run a locally vendored ViT through ONNX Runtime on CPU."""

    name = "fasalpramaan-crop-health-vit"
    version = "2.0.0-vit-tiny-onnx"
    adapter_type = "crop_vit"
    is_production_validated = False

    def __init__(self, model_path: Optional[Path] = None) -> None:
        self.model_path = Path(model_path) if model_path else DEFAULT_MODEL
        meta = json.loads(MODEL_META.read_text(encoding="utf-8"))
        self.labels: list[str] = list(meta["labels"])
        self.supported_crops: set[str] = set(meta["supported_crop_codes"])
        self._session = None

    def available(self) -> bool:
        return self.model_path.exists()

    def readiness(self) -> tuple[bool, str | None]:
        try:
            self._ensure_session()
        except Exception as exc:  # noqa: BLE001
            return False, f"{type(exc).__name__}: {exc}"
        return True, None

    def _ensure_session(self):
        if self._session is not None:
            return self._session
        if not self.model_path.exists():
            raise FileNotFoundError(f"Crop ViT model missing: {self.model_path}")
        try:
            import onnxruntime as ort
        except ModuleNotFoundError as exc:
            raise ModuleNotFoundError(
                "ONNX Runtime is required for the local crop ViT adapter"
            ) from exc
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        self._session = ort.InferenceSession(
            str(self.model_path),
            sess_options=options,
            providers=["CPUExecutionProvider"],
        )
        model_input = self._session.get_inputs()[0]
        model_output = self._session.get_outputs()[0]
        if model_input.name != "pixel_values" or model_output.shape[-1] != len(self.labels):
            raise RuntimeError("Crop ViT model contract does not match model.json")
        return self._session

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
        return np.transpose(values, (2, 0, 1))[None, ...].astype(np.float32)

    @staticmethod
    def _crop_from_label(label: str) -> str:
        if "___" not in label:
            return "unknown"
        return CROP_ALIASES.get(label.split("___", 1)[0].lower(), "unknown")

    @staticmethod
    def _is_healthy(label: str) -> bool:
        return label.lower().endswith("___healthy")

    def _screening_grade(
        self,
        *,
        label: str,
        confidence: float,
        predicted_crop: str,
        expected_crop: str,
    ) -> tuple[str, str, str]:
        if label == "Invalid":
            return "U", "unusable_or_out_of_domain", "recapture"
        if expected_crop and expected_crop not in self.supported_crops:
            return "U", "unsupported_crop", "physical_inspection"
        if (
            expected_crop
            and predicted_crop != "unknown"
            and predicted_crop != expected_crop
            and confidence >= 0.60
        ):
            return "U", "crop_mismatch", "physical_inspection"
        if confidence < 0.60:
            return "B", "uncertain_manual_review", "low_confidence_review"
        if self._is_healthy(label):
            return "A", "healthy_leaf_signal", "normal_review"
        return "C", "disease_pattern_signal", "normal_review"

    def analyze(self, request: dict[str, Any]) -> dict[str, Any]:
        started = time.perf_counter()
        session = self._ensure_session()
        expected = CROP_ALIASES.get(
            str(request.get("expected_crop") or "").strip().lower(),
            str(request.get("expected_crop") or "").strip().lower(),
        )
        quality_warnings: list[str] = []
        per_image: list[dict[str, Any]] = []
        weighted_probs: list[np.ndarray] = []
        weights: list[float] = []

        for image in request.get("images") or []:
            pil = self._decode_image(image)
            angle = str(image.get("angle_type") or "unknown")
            if pil is None:
                quality_warnings.append("image_pixels_unavailable_or_invalid")
                per_image.append({"angle_type": angle, "skipped": True})
                continue
            if min(pil.size) < 96:
                quality_warnings.append("very_low_resolution")
            logits = session.run(
                None,
                {"pixel_values": self._preprocess(pil)},
            )[0][0]
            probs = _softmax(np.asarray(logits))
            index = int(np.argmax(probs))
            weight = ANGLE_WEIGHTS.get(angle, 0.5)
            weighted_probs.append(probs * weight)
            weights.append(weight)
            per_image.append(
                {
                    "angle_type": angle,
                    "predicted_class": self.labels[index],
                    "confidence": round(float(probs[index]), 4),
                    "view_weight": weight,
                }
            )

        if weighted_probs:
            aggregate = np.sum(weighted_probs, axis=0) / max(sum(weights), 1e-12)
            index = int(np.argmax(aggregate))
            label = self.labels[index]
            confidence = float(aggregate[index])
        else:
            aggregate = np.zeros(len(self.labels), dtype=np.float32)
            label = "Invalid"
            confidence = 0.0
            quality_warnings.append("no_usable_image_pixels")

        predicted_crop = self._crop_from_label(label)
        grade, grade_label, recommendation = self._screening_grade(
            label=label,
            confidence=confidence,
            predicted_crop=predicted_crop,
            expected_crop=expected,
        )
        if grade == "U" and grade_label == "crop_mismatch":
            quality_warnings.append("crop_prediction_differs_from_cycle")
        if grade == "U" and grade_label == "unsupported_crop":
            quality_warnings.append("crop_not_supported_by_public_vit")

        healthy_score = float(
            sum(aggregate[i] for i, value in enumerate(self.labels) if self._is_healthy(value))
        )
        invalid_score = float(aggregate[self.labels.index("Invalid")])
        disease_score = max(0.0, 1.0 - healthy_score - invalid_score)
        damage_scores = {category: 0.0 for category in DAMAGE_CATEGORIES}
        damage_scores["healthy"] = healthy_score
        damage_scores["disease"] = disease_score
        damage_scores["unknown"] = invalid_score
        primary_damage = (
            "healthy"
            if grade == "A"
            else "disease"
            if grade == "C"
            else "unknown"
        )

        elapsed = max(int((time.perf_counter() - started) * 1000), 1)
        return {
            "model_version": self.version,
            "adapter_type": self.adapter_type,
            "is_production_validated": False,
            "development_disclaimer": (
                "NON-PRODUCTION public ViT crop-health screening. Grade A/B/C/U is a "
                "demo workflow bucket, not severity, yield loss, commodity quality, claim "
                "eligibility, or a payout recommendation. Human review is mandatory."
            ),
            "image_validation": {
                "passed": bool(weighted_probs) and grade != "U",
                "issues": list(dict.fromkeys(quality_warnings)),
            },
            "predicted_crop": predicted_crop,
            "crop_confidence": round(confidence if predicted_crop != "unknown" else 0.0, 4),
            "predicted_growth_stage": None,
            "growth_stage_confidence": None,
            "predicted_grade": grade,
            "grade_label": grade_label,
            "grade_confidence": round(confidence, 4),
            "grade_scores": {
                "healthy_signal": round(healthy_score, 4),
                "disease_signal": round(disease_score, 4),
                "invalid_or_ood": round(invalid_score, 4),
            },
            "damage_categories": {
                key: round(value, 4) for key, value in damage_scores.items()
            },
            "primary_damage": primary_damage,
            "plant_disease_class": None if label == "Invalid" else label,
            "estimated_affected_area_pct": None,
            "severity": None,
            "quality_warnings": list(dict.fromkeys(quality_warnings)),
            "anomaly_flags": [
                value
                for value in ("crop_mismatch" if grade_label == "crop_mismatch" else None,)
                if value
            ],
            "overall_confidence": round(confidence, 4),
            "human_review_recommendation": recommendation,
            "explanation": {
                "method": "public_vit_tiny_quantized_onnx",
                "predicted_class": label,
                "per_image": per_image,
                "aggregation": "angle_weighted_probability_mean",
                "model_source": "wambugu71/crop_leaf_diseases_vit_onnx",
                "supported_crops": sorted(self.supported_crops),
                "grade_definition": {
                    "A": "confident healthy-leaf signal",
                    "B": "uncertain signal; manual review",
                    "C": "confident disease-pattern signal",
                    "U": "unusable, unsupported, invalid, or crop mismatch",
                },
                "confidence_note": "Public-model score; not locally calibrated on field data",
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
