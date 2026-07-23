"""Plant disease adapter tests — real checkpoint when available."""

from __future__ import annotations

import io
import importlib.util
import pytest
from PIL import Image

from app.adapters.plant_disease import PlantDiseaseAdapter, DEFAULT_CKPT
from app.adapters import get_adapter

_TORCH_AVAILABLE = importlib.util.find_spec("torch") is not None


def _leaf_jpeg_bytes(disease: bool = True) -> bytes:
    img = Image.new("RGB", (224, 224), (40, 120, 40))
    px = img.load()
    if disease:
        for x in range(40, 100):
            for y in range(40, 100):
                px[x, y] = (90, 40, 20)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_checkpoint_path_constant():
    assert "plant_disease" in str(DEFAULT_CKPT)


def test_plant_disease_available_flag():
    a = PlantDiseaseAdapter()
    assert isinstance(a.available(), bool)


@pytest.mark.skipif(
    not DEFAULT_CKPT.exists() or not _TORCH_AVAILABLE,
    reason="legacy checkpoint or optional PyTorch runtime unavailable",
)
def test_plant_disease_infer_on_fixture():
    a = PlantDiseaseAdapter()
    result = a.analyze(
        {
            "submission_id": "pd-test-1",
            "expected_crop": "maize",
            "images": [
                {
                    "angle_type": "closeup_damage",
                    "image_bytes": _leaf_jpeg_bytes(True),
                }
            ],
            "metadata": {},
        }
    )
    assert result["adapter_type"] == "plant_disease"
    assert result["is_production_validated"] is False
    assert "NON-PRODUCTION" in result["development_disclaimer"]
    assert result["primary_damage"] in {
        "healthy",
        "disease",
        "unknown",
        "pest",
        "lodging",
        "flood",
        "waterlogging",
        "drought_stress",
        "hail_storm",
        "fire",
        "nutrient_deficiency",
        "weed_pressure",
    }
    assert 0.0 <= float(result["overall_confidence"]) <= 1.0
    assert "damage_categories" in result
    assert result.get("plant_disease_class") or result["primary_damage"] == "unknown"
    assert result["predicted_growth_stage"] is None
    assert result["growth_stage_confidence"] is None
    assert result["severity"] is None
    assert result["estimated_affected_area_pct"] is None


def test_missing_pixels_never_echo_expected_crop_or_invent_loss_metrics():
    a = PlantDiseaseAdapter()
    result = a.analyze(
        {
            "submission_id": "metadata-only",
            "expected_crop": "maize",
            "images": [{"byte_size": 25_000}],
        }
    )
    assert result["predicted_crop"] == "unknown"
    assert result["crop_confidence"] == 0.0
    assert result["predicted_growth_stage"] is None
    assert result["severity"] is None
    assert result["estimated_affected_area_pct"] is None


@pytest.mark.skipif(not DEFAULT_CKPT.exists(), reason="checkpoint not trained yet")
def test_get_adapter_plant_disease():
    a = get_adapter("plant_disease")
    assert a.adapter_type == "plant_disease"
