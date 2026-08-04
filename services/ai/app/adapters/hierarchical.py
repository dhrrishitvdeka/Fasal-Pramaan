"""Hierarchical multi-stage adapter — crop / quality-OOD / damage (xyz.md §1)."""

from __future__ import annotations

from typing import Any

from app.adapters.base import ModelAdapter
from app.pipeline.stages import run_hierarchical_pipeline


class HierarchicalAdapter(ModelAdapter):
    name = "fasalpramaan-hierarchical-crop-vit"
    version = "1.0.0-hierarchical"
    adapter_type = "hierarchical"
    is_production_validated = False

    def analyze(self, request: dict[str, Any]) -> dict[str, Any]:
        return run_hierarchical_pipeline(request)
