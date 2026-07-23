"""Plant leaf disease classifier — fine-tuned MobileNetV2 adapter.

Loads a real PyTorch checkpoint produced by scripts/train_plant_disease.py.
Maps PlantVillage-style class names into FasalPramaan damage categories.

NOT production-validated for insurance decisions.
"""

from __future__ import annotations

import io
import json
import time
from pathlib import Path
from typing import Any, Optional

import numpy as np
from PIL import Image

from app.adapters.base import DAMAGE_CATEGORIES, ModelAdapter

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CKPT = ROOT / "models" / "plant_disease" / "checkpoint.pt"
LABELS_META = ROOT / "app" / "labels" / "plantvillage_subset.json"

_torch = None
_models = None
_transforms = None


def _lazy_torch():
    global _torch, _models, _transforms
    if _torch is None:
        import torch
        from torchvision import models, transforms

        _torch = torch
        _models = models
        _transforms = transforms
    return _torch, _models, _transforms


class PlantDiseaseAdapter(ModelAdapter):
    name = "fasalpramaan-plant-disease"
    version = "1.0.0-mobilenetv2-finetuned"
    adapter_type = "plant_disease"
    is_production_validated = False

    def __init__(self, checkpoint_path: Optional[Path] = None) -> None:
        self.checkpoint_path = Path(checkpoint_path) if checkpoint_path else DEFAULT_CKPT
        self._model = None
        self._classes: list[str] = []
        self._damage_map: dict[str, str] = {}
        self._device = None
        self._tf = None
        self._load_meta()

    def _load_meta(self) -> None:
        if LABELS_META.exists():
            meta = json.loads(LABELS_META.read_text(encoding="utf-8"))
            self._damage_map = dict(meta.get("fasalpramaan_damage_map") or {})

    def available(self) -> bool:
        """Return whether a checkpoint exists (not whether inference is ready)."""
        return self.checkpoint_path.exists()

    def readiness(self) -> tuple[bool, str | None]:
        """Load the model so health checks cover the complete inference runtime."""
        try:
            self._ensure_model()
        except Exception as exc:  # noqa: BLE001
            return False, f"{type(exc).__name__}: {exc}"
        return True, None

    def _ensure_model(self):
        if self._model is not None:
            return
        if not self.checkpoint_path.exists():
            raise FileNotFoundError(
                f"Plant disease checkpoint missing: {self.checkpoint_path}. "
                "Run: python scripts/prepare_subset.py && python scripts/train_plant_disease.py"
            )
        torch, models, transforms = _lazy_torch()
        # A checkpoint is an input to the service, so never allow pickle object
        # construction while loading it.
        ckpt = torch.load(self.checkpoint_path, map_location="cpu", weights_only=True)
        self._classes = list(ckpt["classes"])
        n = len(self._classes)
        model = models.mobilenet_v2(weights=None)
        model.classifier[1] = torch.nn.Linear(model.last_channel, n)
        model.load_state_dict(ckpt["model_state_dict"])
        model.eval()
        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._model = model.to(self._device)
        mean = ckpt.get("normalize_mean", [0.485, 0.456, 0.406])
        std = ckpt.get("normalize_std", [0.229, 0.224, 0.225])
        size = int(ckpt.get("image_size", 224))
        self._tf = transforms.Compose(
            [
                transforms.Resize((size, size)),
                transforms.ToTensor(),
                transforms.Normalize(mean, std),
            ]
        )

    def _load_image(self, img: dict[str, Any]) -> Optional[Image.Image]:
        raw = img.get("bytes") or img.get("image_bytes")
        if raw is None:
            return None
        if isinstance(raw, str):
            import base64

            raw = base64.b64decode(raw)
        try:
            return Image.open(io.BytesIO(raw)).convert("RGB")
        except Exception:
            return None

    def _predict_pil(self, pil: Image.Image) -> tuple[str, float, dict[str, float]]:
        torch, _, _ = _lazy_torch()
        self._ensure_model()
        assert self._model is not None and self._tf is not None
        tensor = self._tf(pil).unsqueeze(0).to(self._device)
        with torch.no_grad():
            logits = self._model(tensor)
            probs = torch.softmax(logits, dim=1)[0].cpu().numpy()
        scores = {self._classes[i]: float(probs[i]) for i in range(len(self._classes))}
        idx = int(np.argmax(probs))
        return self._classes[idx], float(probs[idx]), scores

    def _map_damage(self, class_name: str) -> str:
        if class_name in self._damage_map:
            return self._damage_map[class_name]
        if class_name.endswith("healthy") or "___healthy" in class_name:
            return "healthy"
        return "disease"

    def _crop_from_class(self, class_name: str) -> str:
        crop = class_name.split("___")[0]
        mapping = {
            "Apple": "unknown",
            "Corn_(maize)": "maize",
            "Potato": "unknown",
            "Tomato": "unknown",
        }
        return mapping.get(crop, "unknown")

    def analyze(self, request: dict[str, Any]) -> dict[str, Any]:
        t0 = time.perf_counter()
        images = request.get("images") or []
        expected = request.get("expected_crop") or "unknown"
        quality_warnings: list[str] = []
        anomaly_flags: list[str] = []

        class_votes: list[tuple[str, float]] = []
        damage_acc: dict[str, list[float]] = {d: [] for d in DAMAGE_CATEGORIES}
        per_image: list[dict[str, Any]] = []

        for img in images:
            pil = self._load_image(img)
            if pil is None:
                quality_warnings.append("image_bytes_unavailable_for_torch")
                # Cannot run CNN without pixels — use unknown with low confidence
                per_image.append({"angle_type": img.get("angle_type"), "skipped": True})
                continue
            w, h = pil.size
            if min(w, h) < 64:
                quality_warnings.append("very_low_resolution")
            try:
                cls, conf, scores = self._predict_pil(pil)
            except FileNotFoundError:
                raise
            except ModuleNotFoundError as exc:
                # Torch missing from runtime image — fail loudly for health/eval honesty
                raise ModuleNotFoundError(
                    "PyTorch is not installed in this environment; plant_disease cannot run. "
                    "Install torch/torchvision (see services/ai/requirements.txt) or rebuild the AI image."
                ) from exc
            except Exception as exc:  # noqa: BLE001
                quality_warnings.append(f"inference_error:{type(exc).__name__}: {exc}")
                continue
            class_votes.append((cls, conf))
            damage = self._map_damage(cls)
            for d in DAMAGE_CATEGORIES:
                damage_acc[d].append(0.02)
            damage_acc[damage].append(conf)
            per_image.append(
                {
                    "angle_type": img.get("angle_type"),
                    "predicted_class": cls,
                    "confidence": conf,
                    "mapped_damage": damage,
                }
            )

        if not class_votes:
            # No image bytes from API worker (common when only metadata sent).
            # Honest low-confidence unknown — not mock deterministic disease.
            primary_class = "unknown"
            overall = 0.0
            primary_damage = "unknown"
            predicted_crop = "unknown"
            crop_conf = 0.0
            scores_fp = {d: 0.0 for d in DAMAGE_CATEGORIES}
            scores_fp["unknown"] = 1.0
            quality_warnings.append(
                "no_image_pixels_for_cnn; worker should pass image bytes or adapter uses storage-side path"
            )
            explanation = {
                "method": "plant_disease_mobilenetv2",
                "note": "No pixel payload received; returned inconclusive",
                "checkpoint": str(self.checkpoint_path.name),
            }
        else:
            # Aggregate by max confidence class
            primary_class, overall = max(class_votes, key=lambda x: x[1])
            primary_damage = self._map_damage(primary_class)
            predicted_crop = self._crop_from_class(primary_class)
            if expected != "unknown" and predicted_crop != "unknown" and predicted_crop != expected:
                anomaly_flags.append("crop_prediction_differs_from_cycle")
            crop_conf = overall if predicted_crop != "unknown" else 0.0
            scores_fp = {
                d: float(np.mean(v)) if v else 0.03 for d, v in damage_acc.items()
            }
            scores_fp[primary_damage] = max(scores_fp.get(primary_damage, 0), overall)
            explanation = {
                "method": "plant_disease_mobilenetv2_finetuned",
                "primary_class": primary_class,
                "per_image": per_image,
                "checkpoint": str(self.checkpoint_path.name),
                "classes_supported": len(self._classes) or "lazy",
            }

        # This classifier has no segmentation, severity, affected-area, or
        # growth-stage head. Classification confidence is not a loss estimate.
        recommendation = "physical_inspection"
        if overall < 0.55 or primary_damage == "unknown":
            recommendation = "low_confidence_review"
        if "very_low_resolution" in quality_warnings:
            recommendation = "recapture"

        meta = request.get("metadata") or {}
        if meta.get("anomaly_flags", {}).get("outside_plot_proximity"):
            anomaly_flags.append("location_outside_plot")

        elapsed = int((time.perf_counter() - t0) * 1000)
        return {
            "model_version": self.version,
            "adapter_type": self.adapter_type,
            "is_production_validated": False,
            "development_disclaimer": (
                "NON-PRODUCTION: fine-tuned leaf-disease MobileNetV2 on synthetic PlantVillage-named subset. "
                "Detects leaf disease patterns, not flood/lodging/hail. "
                "Not validated for insurance payouts or Indian field conditions."
            ),
            "image_validation": {
                "passed": recommendation != "recapture",
                "issues": quality_warnings,
            },
            "predicted_crop": predicted_crop,
            "crop_confidence": round(crop_conf, 4),
            "predicted_growth_stage": None,
            "growth_stage_confidence": None,
            "damage_categories": {k: round(v, 4) for k, v in scores_fp.items()},
            "primary_damage": primary_damage,
            "plant_disease_class": primary_class if class_votes else None,
            "estimated_affected_area_pct": None,
            "severity": None,
            "quality_warnings": quality_warnings,
            "anomaly_flags": anomaly_flags,
            "overall_confidence": round(overall, 4),
            "human_review_recommendation": recommendation,
            "explanation": explanation,
            "capabilities": {
                "crop_identification": "maize_only_from_supported_leaf_classes",
                "damage_classification": "healthy_or_leaf_disease_only",
                "growth_stage_detection": False,
                "multi_hazard_detection": False,
                "severity_estimation": False,
                "affected_area_estimation": False,
            },
            "processing_duration_ms": max(elapsed, 1),
        }
