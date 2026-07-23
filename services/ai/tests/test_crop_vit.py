"""Local public ViT adapter contract and smoke tests."""

from __future__ import annotations

import base64
import io

import pytest
from PIL import Image

from app.adapters import get_adapter
from app.adapters.crop_vit import CropViTAdapter, DEFAULT_MODEL

pytest.importorskip("onnxruntime")


def _image_b64(color: tuple[int, int, int] = (50, 145, 55)) -> str:
    image = Image.new("RGB", (224, 224), color)
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=90)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def test_crop_vit_is_default_ready_adapter(monkeypatch):
    adapter = get_adapter("crop_vit")
    assert adapter.adapter_type == "crop_vit"
    assert adapter.is_production_validated is False
    assert DEFAULT_MODEL.is_file()
    ready, error = adapter.readiness()
    assert ready is True, error


def test_crop_vit_returns_honest_screening_grade():
    result = CropViTAdapter().analyze(
        {
            "submission_id": "vit-smoke",
            "expected_crop": "wheat",
            "images": [
                {
                    "angle_type": "closeup_damage",
                    "image_bytes": _image_b64(),
                }
            ],
        }
    )
    assert result["adapter_type"] == "crop_vit"
    assert result["predicted_grade"] in {"A", "B", "C", "U"}
    assert 0.0 <= result["grade_confidence"] <= 1.0
    assert set(result["grade_scores"]) == {
        "healthy_signal",
        "disease_signal",
        "invalid_or_ood",
    }
    assert result["severity"] is None
    assert result["estimated_affected_area_pct"] is None
    assert "not severity" in result["development_disclaimer"]


def test_unsupported_crop_abstains_instead_of_inventing_grade():
    result = CropViTAdapter().analyze(
        {
            "submission_id": "vit-soybean",
            "expected_crop": "soybean",
            "images": [{"angle_type": "closeup_damage", "image_bytes": _image_b64()}],
        }
    )
    assert result["predicted_grade"] == "U"
    assert result["grade_label"] == "unsupported_crop"
    assert result["human_review_recommendation"] == "physical_inspection"


def test_missing_pixels_returns_unusable_grade():
    result = CropViTAdapter().analyze(
        {"submission_id": "vit-empty", "expected_crop": "paddy", "images": []}
    )
    assert result["predicted_grade"] == "U"
    assert result["primary_damage"] == "unknown"
    assert result["image_validation"]["passed"] is False
