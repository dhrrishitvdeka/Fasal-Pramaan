"""Hierarchical multi-stage pipeline tests (xyz.md §1)."""

from __future__ import annotations

import base64
import io
import os

import numpy as np
from PIL import Image

from app.adapters import get_adapter
from app.pipeline.stages import run_hierarchical_pipeline, stage_crop_species, stage_quality_ood


def _jpeg_b64(color=(40, 140, 40), size=(128, 128), noise: float = 25.0) -> str:
    """Synthetic crop-like green image with variance."""
    arr = np.zeros((size[1], size[0], 3), dtype=np.uint8)
    arr[:, :] = color
    if noise:
        rng = np.random.default_rng(0)
        arr = np.clip(arr.astype(np.float32) + rng.normal(0, noise, arr.shape), 0, 255).astype(
            np.uint8
        )
    img = Image.fromarray(arr, mode="RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _blank_b64(size=(64, 64)) -> str:
    img = Image.new("RGB", size, color=(10, 10, 10))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_hierarchical_adapter_registered():
    a = get_adapter("hierarchical")
    assert a.adapter_type == "hierarchical"
    assert a.is_production_validated is False


def test_quality_ood_blocks_blank_image():
    b64 = _blank_b64()
    req = {
        "submission_id": "ood-1",
        "expected_crop": "soybean",
        "images": [{"image_bytes": b64, "byte_size": 500, "angle_type": "closeup_damage"}],
    }
    q = stage_quality_ood(req)
    assert q.passed is False
    assert q.recommendation == "recapture"


def test_hierarchical_recapture_on_bad_quality():
    b64 = _blank_b64()
    result = run_hierarchical_pipeline(
        {
            "submission_id": "bad-q",
            "expected_crop": "paddy",
            "images": [{"image_bytes": b64, "byte_size": 400, "angle_type": "wide_field"}],
        },
        damage_adapter=get_adapter("mock"),
    )
    assert result["adapter_type"] == "hierarchical"
    assert result["is_production_validated"] is False
    assert "NON-PRODUCTION" in result["development_disclaimer"]
    assert result["pipeline"]["early_exit"] is True
    stage_names = [s["stage"] for s in result["pipeline"]["stages"]]
    assert stage_names[0] == "quality_ood"
    assert "damage" not in stage_names  # damage skipped
    assert result["human_review_recommendation"] == "recapture"
    assert result["primary_damage"] == "unknown"


def test_hierarchical_crop_mismatch_blocks_damage():
    b64 = _jpeg_b64()
    result = run_hierarchical_pipeline(
        {
            "submission_id": "mismatch-1",
            "expected_crop": "wheat",
            "metadata": {"force_crop_mismatch": True},
            "images": [{"image_bytes": b64, "byte_size": 20_000, "angle_type": "closeup_damage"}],
        },
        damage_adapter=get_adapter("mock"),
    )
    assert result["pipeline"].get("early_exit") is True
    stages = result["pipeline"]["stages"]
    assert any(s["stage"] == "crop_species" and s["passed"] is False for s in stages)
    assert "damage" not in [s["stage"] for s in stages]
    assert result["human_review_recommendation"] in {
        "physical_inspection",
        "reject_crop_mismatch",
    }


def test_hierarchical_happy_path_reaches_damage():
    b64 = _jpeg_b64()
    result = run_hierarchical_pipeline(
        {
            "submission_id": "happy-1",
            "expected_crop": "soybean",
            "images": [
                {"image_bytes": b64, "byte_size": 25_000, "angle_type": "wide_field"},
                {"image_bytes": b64, "byte_size": 25_000, "angle_type": "closeup_damage"},
            ],
        },
        damage_adapter=get_adapter("mock"),
    )
    assert result["adapter_type"] == "hierarchical"
    assert result["is_production_validated"] is False
    assert result["pipeline"].get("early_exit") is not True
    stage_names = [s["stage"] for s in result["pipeline"]["stages"]]
    assert stage_names == ["quality_ood", "crop_species", "damage"]
    assert "primary_damage" in result
    assert "damage_categories" in result
    assert result["predicted_crop"] is not None


def test_crop_stage_does_not_echo_expected_or_client_label():
    result = stage_crop_species(
        {
            "expected_crop": "soybean",
            "images": [{"label": "soybean", "crop_hint": "soybean"}],
        }
    )
    assert result.details["predicted_crop"] == "unknown"
    assert result.details["crop_confidence"] == 0.0


def test_metadata_only_images_fail_quality_gate():
    result = stage_quality_ood(
        {"images": [{"byte_size": 25_000, "angle_type": "wide_field"}]}
    )
    assert result.passed is False
    assert result.recommendation == "recapture"


def test_http_analyze_hierarchical():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    b64 = _jpeg_b64()
    r = client.post(
        "/v1/analyze",
        headers={"X-Service-Token": os.environ["AI_SERVICE_TOKEN"]}
        if os.getenv("AI_SERVICE_TOKEN")
        else None,
        json={
            "submission_id": "http-h1",
            "adapter": "hierarchical",
            "expected_crop": "soybean",
            "images": [{"image_bytes": b64, "byte_size": 22_000}],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["adapter_type"] == "hierarchical"
    assert body["is_production_validated"] is False
    assert "pipeline" in body
