"""Production-shaped contract tests for the experimental local ViT v3."""

from __future__ import annotations

import base64
import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.adapters import get_adapter
from app.adapters.crop_health_v3 import CropHealthViTV3Adapter, DEFAULT_MODEL

pytest.importorskip("onnxruntime")


def _image_b64(color: tuple[int, int, int] = (50, 145, 55)) -> str:
    image = Image.new("RGB", (224, 224), color)
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=90)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _request(expected_crop: str | None = "paddy", views: int = 1) -> dict:
    return {
        "submission_id": "v3-contract",
        "expected_crop": expected_crop,
        "images": [
            {
                "angle_type": "closeup_damage" if index == 0 else "mid_canopy",
                "image_bytes": _image_b64((50 + index * 5, 145, 55)),
            }
            for index in range(views)
        ],
    }


def test_v3_is_ready_as_rollback_and_session_is_cached():
    first = get_adapter("crop_health_v3")
    second = CropHealthViTV3Adapter()
    assert first.adapter_type == "crop_health_v3"
    assert first.is_production_validated is False
    assert DEFAULT_MODEL.is_file()
    ready, error = first.readiness()
    assert ready is True, error
    assert first._ensure_session() is second._ensure_session()


def test_preprocessing_contract_exact_range_and_shape():
    values = CropHealthViTV3Adapter._preprocess(Image.new("RGB", (31, 47), (255, 0, 128)))
    assert values.shape == (1, 3, 224, 224)
    assert values.dtype == np.float32
    assert np.isclose(values[0, 0, 0, 0], 1.0)
    assert np.isclose(values[0, 1, 0, 0], -1.0)


def test_v3_full_contract_has_no_prohibited_claims():
    result = CropHealthViTV3Adapter().analyze(_request())
    assert result["adapter_type"] == "crop_health_v3"
    assert result["predicted_grade"] in {"A", "B", "C", "U"}
    assert result["promotion_status"] == "not_promoted_experimental_demo_only"
    assert result["is_production_validated"] is False
    assert result["severity"] is None
    assert result["estimated_affected_area_pct"] is None
    assert result["human_review_recommendation"]
    assert "Human review is mandatory" in result["development_disclaimer"]
    assert set(result["grade_scores"]) == {"healthy_signal", "disease_signal", "invalid_or_ood"}


def test_unsupported_and_missing_expected_crop_abstain():
    unsupported = CropHealthViTV3Adapter().analyze(_request("soybean"))
    missing = CropHealthViTV3Adapter().analyze(_request(None))
    assert (unsupported["predicted_grade"], unsupported["grade_label"]) == ("U", "unsupported_crop")
    assert (missing["predicted_grade"], missing["grade_label"]) == ("U", "missing_expected_crop_metadata")


def test_missing_image_and_multiview_aggregation():
    empty = CropHealthViTV3Adapter().analyze(_request(views=0))
    multi = CropHealthViTV3Adapter().analyze(_request(views=2))
    assert empty["predicted_grade"] == "U"
    assert empty["image_validation"]["passed"] is False
    assert "no_usable_image_pixels" in empty["quality_warnings"]
    assert len(multi["explanation"]["per_image"]) == 2
    assert multi["explanation"]["aggregation"] == "angle_weighted_calibrated_probability_mean"


def test_regression_is_deterministic_and_rollback_is_available():
    adapter = CropHealthViTV3Adapter()
    first = adapter.analyze(_request("wheat"))
    second = adapter.analyze(_request("wheat"))
    assert first["predicted_grade"] == second["predicted_grade"]
    assert first["grade_scores"] == second["grade_scores"]
    assert get_adapter("crop_vit").adapter_type == "crop_vit"


def test_http_analyze_and_model_metadata(monkeypatch):
    import app.main as main

    monkeypatch.setattr(main, "_SERVICE_TOKEN", "")
    client = TestClient(main.app)
    response = client.post("/v1/analyze", json={**_request(), "adapter": "crop_health_v3"})
    assert response.status_code == 200
    body = response.json()
    assert body["adapter_type"] == "crop_health_v3"
    models = client.get("/v1/models").json()
    metadata = next(item for item in models if item["adapter_type"] == "crop_health_v3")
    assert metadata["checkpoint_available"] is True
    assert metadata["rollback_adapter"] == "crop_vit"
