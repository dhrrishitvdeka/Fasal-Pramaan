#!/usr/bin/env python3
"""Export the strongest experimental ViT and verify PyTorch/ONNX parity."""

from __future__ import annotations

import json
import shutil
import time

import numpy as np
import onnx
import onnxruntime as ort
import torch
from PIL import Image

from ml_common import AI_ROOT, CLASSES, RAW_ROOT, REPORTS, RUNS, load_manifest, set_determinism, sha256_file
from train_candidates import build_model, make_transforms, softmax


MODEL_ID = "vit_tiny_crop_aware_v3"
MODEL_DIR = AI_ROOT / "models" / "crop_health_vit_v3"
OUTPUT = MODEL_DIR / "model.onnx"


def main() -> None:
    set_determinism()
    checkpoint_path = RUNS / MODEL_ID / "best.pt"
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    experiment = checkpoint["experiment"]
    model, _ = build_model(experiment["models"][0])
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".onnx.tmp")
    torch.onnx.export(
        model,
        torch.zeros(1, 3, 224, 224),
        temporary,
        input_names=["pixel_values"],
        output_names=["logits"],
        dynamic_axes={"pixel_values": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    exported = onnx.load(temporary)
    onnx.checker.check_model(exported)
    shutil.move(temporary, OUTPUT)

    _, transform = make_transforms(experiment)
    rows = load_manifest("validation")[:64]
    tensors = torch.stack(
        [
            transform(
                Image.open(
                    RAW_ROOT / str(row["source_dataset"]) / str(row["original_path"])
                ).convert("RGB")
            )
            for row in rows
        ]
    )
    with torch.inference_mode():
        torch_logits = model(tensors).numpy()
    session = ort.InferenceSession(str(OUTPUT), providers=["CPUExecutionProvider"])
    onnx_logits = session.run(["logits"], {"pixel_values": tensors.numpy()})[0]
    torch_probs = softmax(torch_logits, 0.8218026900399514)
    onnx_probs = softmax(onnx_logits, 0.8218026900399514)
    top1 = float((torch_probs.argmax(1) == onnx_probs.argmax(1)).mean())
    max_probability_error = float(np.abs(torch_probs - onnx_probs).max())

    sample = np.zeros((1, 3, 224, 224), dtype=np.float32)
    for _ in range(5):
        session.run(["logits"], {"pixel_values": sample})
    timings = []
    for _ in range(50):
        started = time.perf_counter()
        session.run(["logits"], {"pixel_values": sample})
        timings.append((time.perf_counter() - started) * 1000)
    timings.sort()
    report = {
        "version": "experimental-vit-onnx-export-v1",
        "model_id": MODEL_ID,
        "checkpoint_sha256": sha256_file(checkpoint_path),
        "onnx_sha256": sha256_file(OUTPUT),
        "onnx_size_bytes": OUTPUT.stat().st_size,
        "opset": 17,
        "classes": CLASSES,
        "parity_rows": len(rows),
        "onnx_top1_parity": top1,
        "maximum_probability_absolute_error": max_probability_error,
        "cpu_latency_p50_ms": float(np.median(timings)),
        "cpu_latency_p95_ms": timings[47],
        "quantized": False,
        "quantization_reason": "Not needed: the FP32 ONNX artifact is below the frozen 100 MiB size gate.",
        "promotion_status": "experimental_not_promoted_due_field_and_calibration_gates",
        "is_production_validated": False,
    }
    (REPORTS / "selected_vit_onnx_export_v1.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
