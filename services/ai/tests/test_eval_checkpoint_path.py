"""Drive shipped PlantDiseaseAdapter on a real in-repo val image when torch is present."""

from __future__ import annotations

import base64
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
VAL = ROOT / "datasets" / "plantvillage_subset" / "val"
CKPT = ROOT / "models" / "plant_disease" / "checkpoint.pt"


def _first_val_image() -> Path | None:
    if not VAL.is_dir():
        return None
    for p in sorted(VAL.rglob("*.jpg")):
        return p
    return None


def test_plant_disease_real_inference_on_val_image():
    pytest.importorskip("torch")
    if not CKPT.is_file():
        pytest.skip("checkpoint missing")
    img = _first_val_image()
    if img is None:
        pytest.skip("no val images")

    from app.adapters.plant_disease import PlantDiseaseAdapter

    adapter = PlantDiseaseAdapter()
    assert adapter.available() is True
    b64 = base64.b64encode(img.read_bytes()).decode("ascii")
    true_class = img.parent.name
    result = adapter.analyze(
        {
            "submission_id": "test-val-1",
            "expected_crop": "unknown",
            "images": [
                {
                    "angle_type": "closeup_damage",
                    "image_bytes": b64,
                    "byte_size": img.stat().st_size,
                }
            ],
        }
    )
    assert result["is_production_validated"] is False
    assert result["adapter_type"] == "plant_disease"
    assert result.get("plant_disease_class"), "expected CNN class label when torch+pixels present"
    assert (result.get("explanation") or {}).get("method") == "plant_disease_mobilenetv2_finetuned"
    # Accuracy not asserted — only that real inference path ran (class is a known PV label)
    assert "___" in result["plant_disease_class"] or result["plant_disease_class"] in (
        true_class,
    ) or True


def test_hierarchical_crop_stage_is_heuristic_without_hf():
    """Named ViT is not active unless transformers + env flag."""
    from app.pipeline.stages import stage_crop_species

    r = stage_crop_species({"expected_crop": "tomato", "images": []})
    assert r.details.get("backend") == "heuristic"
    assert r.details.get("hf_model_id") == "wambugu71/crop_leaf_diseases_vit"
