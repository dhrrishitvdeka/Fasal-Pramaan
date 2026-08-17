"""Fasal-Pramaan Hugging Face Space — DINOv2 ViT-S/14 ONNX inference.

Loads the private model repo (MODEL_REPO_ID + HF_TOKEN), runs the exact
preprocessing and A/B/C/U mapping from services/ai/app/adapters/crop_health_v4.py,
and exposes a Gradio UI plus a stable predict_api endpoint for the hosted
Next.js app.

Never logs HF_TOKEN. Never calls a public placeholder classifier.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

import gradio as gr
import numpy as np
from huggingface_hub import snapshot_download
from PIL import Image

REQUIRED_FILES = (
    "model.onnx",
    "model.json",
    "preprocessing.json",
    "labels.json",
)
ANGLE_WEIGHTS = {
    "closeup_damage": 1.0,
    "mid_canopy": 0.65,
    "wide_field": 0.35,
    "left_context": 0.45,
    "right_context": 0.45,
}
CROP_ALIASES = {
    "corn": "maize",
    "maize": "maize",
    "rice": "paddy",
    "paddy": "paddy",
    "potato": "potato",
    "wheat": "wheat",
}
CACHE_DIR = Path(os.environ.get("FASAL_MODEL_CACHE", "/tmp/fasal-pramaan-model"))


def _softmax(values: np.ndarray, temperature: float) -> np.ndarray:
    shifted = values.astype(np.float64) / temperature
    shifted -= shifted.max(axis=-1, keepdims=True)
    exponentials = np.exp(shifted)
    return (
        exponentials / np.maximum(exponentials.sum(axis=-1, keepdims=True), 1e-12)
    ).astype(np.float32)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify_checksums(model_dir: Path) -> None:
    sums = model_dir / "SHA256SUMS"
    if not sums.is_file():
        return
    expected: dict[str, str] = {}
    for line in sums.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 2:
            expected[parts[-1]] = parts[0]
    onnx = model_dir / "model.onnx"
    want = expected.get("model.onnx")
    if want:
        got = _sha256_file(onnx)
        if got != want:
            raise RuntimeError("model.onnx SHA-256 does not match SHA256SUMS")


def download_model_package() -> Path:
    repo_id = os.environ.get("MODEL_REPO_ID", "dhrrishitvdeka/fasal-pramaan-model").strip()
    revision = os.environ.get("MODEL_REVISION", "main").strip() or "main"
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_HUB_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN is not set on the Space (secret)")
    if "wambugu71" in repo_id.lower():
        raise RuntimeError("Refusing to load the retired public placeholder model")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=repo_id,
        revision=revision,
        token=token,
        local_dir=str(CACHE_DIR),
        allow_patterns=[
            "model.onnx",
            "model.json",
            "preprocessing.json",
            "labels.json",
            "SHA256SUMS",
        ],
    )
    for name in REQUIRED_FILES:
        if not (CACHE_DIR / name).is_file():
            raise FileNotFoundError(f"Model package missing {name}")
    _verify_checksums(CACHE_DIR)
    return CACHE_DIR


@lru_cache(maxsize=1)
def load_runtime() -> dict[str, Any]:
    import onnxruntime as ort

    model_dir = download_model_package()
    meta = json.loads((model_dir / "model.json").read_text(encoding="utf-8"))
    labels = json.loads((model_dir / "labels.json").read_text(encoding="utf-8"))
    preprocessing = json.loads((model_dir / "preprocessing.json").read_text(encoding="utf-8"))
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(
        str(model_dir / "model.onnx"),
        sess_options=options,
        providers=["CPUExecutionProvider"],
    )
    model_input = session.get_inputs()[0]
    model_output = session.get_outputs()[0]
    crops = list(labels["crop_order"])
    classes = list(labels["conditioned_class_order"])
    if model_input.name != preprocessing.get("input_name", "pixel_values"):
        raise RuntimeError("ONNX input name does not match preprocessing.json")
    if model_output.name != preprocessing.get("output_name", "conditioned_logits"):
        raise RuntimeError("ONNX output name does not match preprocessing.json")
    if list(model_output.shape[-2:]) != [len(crops), len(classes)]:
        raise RuntimeError("ONNX output shape does not match labels.json")
    return {
        "session": session,
        "meta": meta,
        "crops": crops,
        "classes": classes,
        "temperature": float(meta["temperature"]),
        "abstention_threshold": float(meta["abstention_threshold"]),
        "crop_mismatch_threshold": float(meta["crop_mismatch_threshold"]),
        "grade_b_threshold": float(meta["manual_review_grade_b_threshold"]),
        "mean": np.asarray(preprocessing["normalization_mean"], dtype=np.float32).reshape(1, 1, 3),
        "std": np.asarray(preprocessing["normalization_std"], dtype=np.float32).reshape(1, 1, 3),
        "repo_id": os.environ.get("MODEL_REPO_ID", "dhrrishitvdeka/fasal-pramaan-model"),
    }


def _decode_image(raw: Any) -> Image.Image | None:
    if raw is None:
        return None
    try:
        if isinstance(raw, Image.Image):
            return raw.convert("RGB")
        if isinstance(raw, np.ndarray):
            return Image.fromarray(raw.astype("uint8")).convert("RGB")
        if isinstance(raw, (bytes, bytearray)):
            return Image.open(io.BytesIO(bytes(raw))).convert("RGB")
        if isinstance(raw, str):
            text = raw.strip()
            if text.startswith("data:"):
                text = text.split(",", 1)[1]
            return Image.open(io.BytesIO(base64.b64decode(text))).convert("RGB")
        if hasattr(raw, "read"):
            return Image.open(raw).convert("RGB")
        path = Path(str(raw))
        if path.is_file():
            return Image.open(path).convert("RGB")
    except Exception:
        return None
    return None


def _preprocess(image: Image.Image, runtime: dict[str, Any]) -> np.ndarray:
    resized = image.resize((224, 224), Image.Resampling.BILINEAR)
    values = np.asarray(resized, dtype=np.float32) / 255.0
    values = (values - runtime["mean"]) / runtime["std"]
    return np.transpose(values, (2, 0, 1))[None].astype(np.float32)


def _head_summary(
    probabilities: np.ndarray, crops: list[str]
) -> tuple[str, float, np.ndarray]:
    health_mass = probabilities[:, :2].sum(axis=1)
    crop_index = int(health_mass.argmax())
    return crops[crop_index], float(health_mass[crop_index]), health_mass


def analyze(
    images: list[dict[str, Any]],
    expected_crop: str | None = None,
) -> dict[str, Any]:
    started = time.perf_counter()
    runtime = load_runtime()
    session = runtime["session"]
    crops: list[str] = runtime["crops"]
    classes: list[str] = runtime["classes"]
    raw_expected = str(expected_crop or "").strip().lower()
    expected = CROP_ALIASES.get(raw_expected, raw_expected)
    expected_index = crops.index(expected) if expected in crops else None
    warnings: list[str] = []
    per_image: list[dict[str, Any]] = []
    weighted_heads: list[np.ndarray] = []
    weights: list[float] = []

    for item in images:
        angle = str(item.get("angle_type") or "unknown")
        image = _decode_image(item.get("image") or item.get("image_b64") or item.get("image_bytes"))
        if image is None:
            warnings.append("image_pixels_unavailable_or_invalid")
            per_image.append({"angle_type": angle, "skipped": True})
            continue
        if min(image.size) < 96:
            warnings.append("very_low_resolution")
        logits = session.run(
            ["conditioned_logits"],
            {"pixel_values": _preprocess(image, runtime)},
        )[0][0]
        probabilities = _softmax(np.asarray(logits), runtime["temperature"])
        predicted_crop, crop_confidence, _ = _head_summary(probabilities, crops)
        crop_index = expected_index if expected_index is not None else crops.index(predicted_crop)
        selected = probabilities[crop_index].copy()
        if float(selected.max()) < runtime["abstention_threshold"]:
            selected[:] = (0.0, 0.0, 1.0)
        selected_index = int(selected.argmax())
        weight = ANGLE_WEIGHTS.get(angle, 0.5)
        weighted_heads.append(probabilities * weight)
        weights.append(weight)
        predicted_state = classes[selected_index]
        per_image.append(
            {
                "angle_type": angle,
                "predicted_crop": predicted_crop,
                "crop_confidence": round(crop_confidence, 4),
                "predicted_class": (
                    f"{crops[crop_index]}__{predicted_state}"
                    if predicted_state != "invalid"
                    else "invalid__ood"
                ),
                "confidence": round(float(selected[selected_index]), 4),
                "view_weight": weight,
            }
        )

    if weighted_heads:
        aggregate_heads = np.sum(weighted_heads, axis=0) / max(sum(weights), 1e-12)
    else:
        aggregate_heads = np.zeros((len(crops), 3), dtype=np.float32)
        aggregate_heads[:, 2] = 1.0
        warnings.append("no_usable_image_pixels")

    predicted_crop, crop_confidence, crop_health_mass = _head_summary(aggregate_heads, crops)
    grade = "U"
    grade_label = "unusable_or_out_of_domain"
    recommendation = "recapture"
    decision_confidence = 1.0
    healthy_score = 0.0
    disease_score = 0.0
    invalid_score = 1.0
    selected_class: str | None = None

    if not raw_expected:
        warnings.append("expected_crop_required")
        grade_label = "missing_expected_crop_metadata"
        recommendation = "physical_inspection"
    elif expected_index is None:
        warnings.append("unsupported_crop")
        grade_label = "unsupported_crop"
        recommendation = "physical_inspection"
    elif weighted_heads:
        selected = aggregate_heads[expected_index].copy()
        healthy_score, disease_score, invalid_score = map(float, selected)
        selected_index = int(selected.argmax())
        decision_confidence = float(selected[selected_index])
        mismatch = (
            predicted_crop != expected
            and crop_health_mass[crops.index(predicted_crop)] >= runtime["crop_mismatch_threshold"]
        )
        if mismatch:
            warnings.append("crop_prediction_differs_from_cycle")
            grade_label = "crop_mismatch"
            recommendation = "physical_inspection"
            decision_confidence = crop_confidence
        elif decision_confidence < runtime["abstention_threshold"]:
            grade_label = "low_confidence_unusable"
            recommendation = "recapture"
        elif selected_index == 2:
            grade_label = "unusable_or_out_of_domain"
            recommendation = "recapture"
        elif decision_confidence < runtime["grade_b_threshold"]:
            grade = "B"
            grade_label = "uncertain_manual_review"
            recommendation = "low_confidence_review"
            selected_class = f"{expected}__{classes[selected_index]}"
        elif selected_index == 0:
            grade = "A"
            grade_label = "healthy_leaf_signal"
            recommendation = "normal_human_review"
            selected_class = f"{expected}__healthy"
        else:
            grade = "C"
            grade_label = "disease_pattern_signal"
            recommendation = "normal_human_review"
            selected_class = f"{expected}__disease"

    unique_warnings = list(dict.fromkeys(warnings))
    elapsed = max(int((time.perf_counter() - started) * 1000), 1)
    label = selected_class or grade_label
    return {
        "ok": True,
        "model_id": runtime["repo_id"],
        "model_version": runtime["meta"].get("version", "4.0.0-dinov2-v14"),
        "adapter_type": "crop_health_v4",
        "is_production_validated": False,
        "promotion_status": runtime["meta"].get("promotion_status"),
        "predicted_crop": predicted_crop if weighted_heads else "unknown",
        "crop_confidence": round(crop_confidence if weighted_heads else 0.0, 4),
        "predicted_grade": grade,
        "grade_label": grade_label,
        "grade_confidence": round(decision_confidence, 4),
        "grade_scores": {
            "healthy_signal": round(healthy_score, 4),
            "disease_signal": round(disease_score, 4),
            "invalid_or_ood": round(invalid_score, 4),
        },
        "primary_damage": "healthy" if grade == "A" else "disease" if grade == "C" else "unknown",
        "plant_disease_class": selected_class,
        "label": label,
        "score": round(decision_confidence, 4),
        "severity": None,
        "estimated_affected_area_pct": None,
        "quality_warnings": unique_warnings,
        "anomaly_flags": ["crop_mismatch"] if grade_label == "crop_mismatch" else [],
        "overall_confidence": round(decision_confidence, 4),
        "human_review_recommendation": recommendation,
        "development_disclaimer": (
            "NON-PRODUCTION crop-health screening. A/B/C/U are workflow "
            "buckets, not severity, affected area, yield loss, or payout. "
            "Human review is mandatory."
        ),
        "explanation": {
            "method": "hosted_crop_conditioned_dinov2_vits14_onnx",
            "predicted_class": selected_class,
            "per_image": per_image,
            "aggregation": "angle_weighted_calibrated_probability_mean",
            "expected_crop": expected or None,
            "supported_crops": crops,
        },
        "processing_duration_ms": elapsed,
    }


def _parse_images_json(images_json: str | None, fallback_image: Any, angle_type: str) -> list[dict[str, Any]]:
    text = (images_json or "").strip()
    if text:
        payload = json.loads(text)
        if not isinstance(payload, list) or not payload:
            raise ValueError("images_json must be a non-empty JSON array")
        return payload
    return [{"image": fallback_image, "angle_type": angle_type or "closeup_damage"}]


def predict_ui(image: Any, expected_crop: str, angle_type: str) -> tuple[dict[str, Any], str]:
    result = analyze(
        [{"image": image, "angle_type": angle_type or "closeup_damage"}],
        expected_crop=expected_crop,
    )
    summary = (
        f"**Grade {result['predicted_grade']}** — {result['grade_label']}\n\n"
        f"Crop: `{result['predicted_crop']}` "
        f"(crop confidence {result['crop_confidence']})\n\n"
        f"Class: `{result.get('plant_disease_class') or result['label']}` "
        f"(decision {result['score']})\n\n"
        f"{result['development_disclaimer']}"
    )
    return result, summary


def predict_api(
    image_b64: str,
    expected_crop: str = "",
    angle_type: str = "closeup_damage",
    images_json: str = "",
) -> dict[str, Any]:
    """Stable JSON API used by the Fasal-Pramaan Next.js hosted path."""
    try:
        images = _parse_images_json(images_json, image_b64, angle_type)
        return analyze(images, expected_crop=expected_crop)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


def health() -> dict[str, Any]:
    try:
        runtime = load_runtime()
        return {
            "ok": True,
            "model_id": runtime["repo_id"],
            "model_version": runtime["meta"].get("version"),
            "adapter_type": "crop_health_v4",
            "onnx_loaded": True,
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "onnx_loaded": False, "error": f"{type(exc).__name__}: {exc}"}


_startup_error: str | None = None
try:
    load_runtime()
except Exception as exc:  # noqa: BLE001
    _startup_error = f"{type(exc).__name__}: {exc}"


with gr.Blocks(title="Fasal-Pramaan inference") as demo:
    gr.Markdown(
        "# Fasal-Pramaan crop-health screening\n"
        "DINOv2 ViT-S/14 ONNX (`dhrrishitvdeka/fasal-pramaan-model`). "
        "A/B/C/U are review workflow buckets. Human review is mandatory."
    )
    if _startup_error:
        gr.Markdown(f"**Model failed to load at startup:** `{_startup_error}`")
    with gr.Row():
        image = gr.Image(type="pil", label="Leaf / field photo")
        with gr.Column():
            expected = gr.Dropdown(
                choices=["", "maize", "paddy", "potato", "wheat"],
                value="paddy",
                label="Expected crop (from crop cycle)",
            )
            angle = gr.Dropdown(
                choices=list(ANGLE_WEIGHTS.keys()),
                value="closeup_damage",
                label="Angle type",
            )
            run = gr.Button("Run model", variant="primary")
    json_out = gr.JSON(label="Model response")
    md_out = gr.Markdown()
    run.click(predict_ui, inputs=[image, expected, angle], outputs=[json_out, md_out])

    gr.Markdown("### Hosted API")
    api_b64 = gr.Textbox(label="image_b64", lines=3)
    api_crop = gr.Textbox(label="expected_crop", value="paddy")
    api_angle = gr.Textbox(label="angle_type", value="closeup_damage")
    api_extra = gr.Textbox(label="images_json (optional JSON array)", lines=3)
    api_btn = gr.Button("predict_api")
    api_out = gr.JSON(label="predict_api result")
    api_btn.click(
        predict_api,
        inputs=[api_b64, api_crop, api_angle, api_extra],
        outputs=api_out,
        api_name="predict_api",
    )
    health_btn = gr.Button("health")
    health_out = gr.JSON(label="health")
    health_btn.click(health, inputs=None, outputs=health_out, api_name="health")


if __name__ == "__main__":
    demo.queue(max_size=16).launch()
