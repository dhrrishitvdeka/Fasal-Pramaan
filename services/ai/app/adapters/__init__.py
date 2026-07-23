"""Model adapters."""

from __future__ import annotations

import os

from app.adapters.base import ModelAdapter
from app.adapters.baseline import BaselineCVAdapter
from app.adapters.crop_vit import CropViTAdapter
from app.adapters.crop_health_v3 import CropHealthViTV3Adapter
from app.adapters.crop_health_v4 import CropHealthDinoV4Adapter
from app.adapters.hierarchical import HierarchicalAdapter
from app.adapters.mock import MockModelAdapter
from app.adapters.plant_disease import PlantDiseaseAdapter


def get_adapter(name: str | None = None) -> ModelAdapter:
    adapter = (name or os.getenv("AI_MODEL_ADAPTER", "crop_health_v4")).lower()
    if adapter in ("crop_health_v4", "dinov2_v14", "local_dinov2"):
        model = CropHealthDinoV4Adapter()
        if model.available():
            return model
        raise FileNotFoundError("Local crop_health_v4 ONNX model not found")
    if adapter in ("crop_health_v3", "experimental_vit", "local_vit_v3"):
        model = CropHealthViTV3Adapter()
        if model.available():
            return model
        raise FileNotFoundError("Local crop_health_v3 ONNX model not found")
    if adapter in ("crop_vit", "grade_vit", "vit", "onnx_vit"):
        vit = CropViTAdapter()
        if vit.available():
            return vit
        raise FileNotFoundError("Local crop ViT ONNX model not found")
    if adapter in ("hierarchical", "pipeline", "multi_stage", "vit_pipeline"):
        return HierarchicalAdapter()
    if adapter in ("plant_disease", "disease", "torch", "mobilenet"):
        pd = PlantDiseaseAdapter()
        if pd.available():
            return pd
        # Honest fallback when checkpoint not present
        if os.getenv("AI_ALLOW_MOCK_FALLBACK", "false").lower() in ("1", "true", "yes"):
            return MockModelAdapter()
        raise FileNotFoundError(
            "Plant disease checkpoint not found and AI_ALLOW_MOCK_FALLBACK is false"
        )
    if adapter == "baseline":
        return BaselineCVAdapter()
    if adapter == "mock":
        return MockModelAdapter()
    raise ValueError(f"Unknown AI model adapter: {adapter}")
