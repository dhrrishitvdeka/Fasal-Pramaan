#!/usr/bin/env python3
"""Probe which ML backends actually load in this environment (honest status).

Prints JSON lines suitable for ml-working-status.log. Does not claim accuracy.
"""

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _tiny_leaf_b64() -> str:
    """Prefer a real val image if present; else minimal JPEG."""
    val = ROOT / "datasets" / "plantvillage_subset" / "val"
    if val.is_dir():
        for p in val.rglob("*.jpg"):
            return base64.b64encode(p.read_bytes()).decode("ascii")
    # 1x1 jpeg
    return base64.b64encode(
        bytes.fromhex(
            "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707"
            "070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c"
            "1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d"
            "0d1832211c2132323232323232323232323232323232323232323232323232323232"
            "323232323232323232323232323232323232323232ffc00011080001000103011100"
            "021101031101ffc40014000100000000000000000000000000000008ffc400141001"
            "00000000000000000000000000000000ffda000c0301000210031000003f00bf80ffd9"
        )
    ).decode("ascii")


def main() -> None:
    report: dict = {
        "is_production_validated": False,
        "disclaimer": "Status probe only — not an accuracy claim.",
        "env": {
            "AI_MODEL_ADAPTER": os.getenv("AI_MODEL_ADAPTER", "crop_health_v4"),
            "AI_ENABLE_HF_CROP_VIT": os.getenv("AI_ENABLE_HF_CROP_VIT", "false"),
            "AI_ENABLE_HF_DAMAGE_VIT": os.getenv("AI_ENABLE_HF_DAMAGE_VIT", "false"),
        },
        "backends": {},
    }

    from app.adapters.crop_vit import CropViTAdapter
    from app.adapters.plant_disease import PlantDiseaseAdapter
    from app.adapters.hierarchical import HierarchicalAdapter
    from app.adapters import get_adapter
    from app.pipeline.stages import HF_CROP_VIT_ID, HF_DAMAGE_VIT_ID, stage_crop_species

    vit = CropViTAdapter()
    vit_ready, vit_error = vit.readiness()
    report["backends"]["crop_vit"] = {
        "architecture": "ViT-Tiny patch16 224 (quantized ONNX)",
        "model_path": str(vit.model_path),
        "model_exists": vit.available(),
        "status": "ready" if vit_ready else "failed",
        "error": vit_error,
        "supported_crops": sorted(vit.supported_crops),
        "is_production_validated": False,
    }

    pd = PlantDiseaseAdapter()
    report["backends"]["plant_disease"] = {
        "architecture": "MobileNetV2 (NOT ViT)",
        "checkpoint_path": str(pd.checkpoint_path),
        "checkpoint_exists": pd.available(),
        "status": "weights_loadable" if pd.available() else "unavailable",
        "is_production_validated": False,
    }

    # Live analyze
    b64 = _tiny_leaf_b64()
    req = {
        "submission_id": "probe-1",
        "expected_crop": "paddy",
        "images": [
            {
                "angle_type": "closeup_damage",
                "image_bytes": b64,
                "byte_size": len(base64.b64decode(b64)),
            }
        ],
    }
    try:
        vit_out = vit.analyze(req)
        report["backends"]["crop_vit"]["live_analyze"] = {
            "predicted_crop": vit_out.get("predicted_crop"),
            "predicted_grade": vit_out.get("predicted_grade"),
            "grade_label": vit_out.get("grade_label"),
            "confidence": vit_out.get("grade_confidence"),
        }
    except Exception as exc:  # noqa: BLE001
        report["backends"]["crop_vit"]["status"] = "failed"
        report["backends"]["crop_vit"]["error"] = f"{type(exc).__name__}: {exc}"
    try:
        out = get_adapter("plant_disease").analyze(req)
        report["backends"]["plant_disease"]["live_analyze"] = {
            "adapter_type": out.get("adapter_type"),
            "model_version": out.get("model_version"),
            "primary_damage": out.get("primary_damage"),
            "plant_disease_class": out.get("plant_disease_class"),
            "overall_confidence": out.get("overall_confidence"),
            "is_production_validated": out.get("is_production_validated"),
            "method": (out.get("explanation") or {}).get("method"),
        }
        report["backends"]["plant_disease"]["status"] = "working_real_inference"
    except Exception as exc:  # noqa: BLE001
        report["backends"]["plant_disease"]["live_analyze_error"] = f"{type(exc).__name__}: {exc}"
        report["backends"]["plant_disease"]["status"] = "failed"

    # Hierarchical / named "ViT" path
    h = HierarchicalAdapter()
    report["backends"]["hierarchical"] = {
        "name": h.name,
        "note": "Name contains crop-vit but HF ViT is optional",
        "hf_crop_vit_id": HF_CROP_VIT_ID,
        "hf_damage_vit_id": HF_DAMAGE_VIT_ID,
        "is_production_validated": False,
    }
    crop = stage_crop_species(req)
    report["backends"]["hierarchical"]["crop_stage"] = {
        "backend": crop.details.get("backend"),
        "passed": crop.passed,
        "predicted_crop": crop.details.get("predicted_crop"),
        "hf_enabled_env": os.getenv("AI_ENABLE_HF_CROP_VIT", "false"),
    }

    try:
        import transformers  # noqa: F401

        report["backends"]["transformers_package"] = {
            "installed": True,
            "version": getattr(transformers, "__version__", "?"),
        }
    except Exception as exc:  # noqa: BLE001
        report["backends"]["transformers_package"] = {
            "installed": False,
            "error": str(exc),
        }

    hf_status = "unavailable"
    hf_detail: dict = {}
    if os.getenv("AI_ENABLE_HF_CROP_VIT", "false").lower() in ("1", "true", "yes"):
        try:
            from app.pipeline.stages import _hf_crop_predict

            pred, conf, backend = _hf_crop_predict(req)
            hf_status = "working_real_inference" if backend == "hf_vit" else backend
            hf_detail = {"predicted": pred, "confidence": conf, "backend": backend}
        except Exception as exc:  # noqa: BLE001
            hf_status = "failed"
            hf_detail = {"error": f"{type(exc).__name__}: {exc}"}
    else:
        hf_status = "disabled_by_env"
        hf_detail = {
            "reason": "AI_ENABLE_HF_CROP_VIT not true; crop stage uses heuristic",
            "model_id": HF_CROP_VIT_ID,
        }
    report["backends"]["hf_crop_vit"] = {"status": hf_status, **hf_detail}

    try:
        hout = get_adapter("hierarchical").analyze(req)
        stages = (hout.get("pipeline") or {}).get("stages") or []
        report["backends"]["hierarchical"]["live_analyze"] = {
            "adapter_type": hout.get("adapter_type"),
            "is_production_validated": hout.get("is_production_validated"),
            "primary_damage": hout.get("primary_damage"),
            "stage_backends": [
                {"stage": s.get("stage"), "backend": s.get("backend"), "passed": s.get("passed")}
                for s in stages
            ],
        }
        report["backends"]["hierarchical"]["status"] = "working_pipeline"
    except Exception as exc:  # noqa: BLE001
        report["backends"]["hierarchical"]["status"] = "failed"
        report["backends"]["hierarchical"]["error"] = f"{type(exc).__name__}: {exc}"

    # HTTP health if reachable
    try:
        import httpx

        r = httpx.get("http://127.0.0.1:8001/health", timeout=5.0)
        report["http_health"] = r.json() if r.status_code == 200 else {"status_code": r.status_code}
    except Exception as exc:  # noqa: BLE001
        report["http_health"] = {"error": str(exc)}

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
