#!/usr/bin/env python3
"""Export the validation-selected conditioned DINOv2 v14 and verify ONNX gates."""

from __future__ import annotations

import json
import shutil
import statistics
import time
from collections import defaultdict

import numpy as np
import onnx
import onnxruntime as ort
import torch

from ml_common import ManifestDataset, REPORTS, ROOT, load_manifest, set_determinism, sha256_file
from train_candidates import make_transforms
from train_conditioned_dino import build_conditioned_model


CONTRACT_PATH = ROOT / "config" / "conditioned_contract_v14.json"
THRESHOLDS_PATH = ROOT / "config" / "promotion_thresholds_v1.json"
MODEL_DIR = ROOT.parent / "models" / "crop_health_dinov2_v14"
OUTPUT = MODEL_DIR / "model.onnx"


def softmax(values: np.ndarray, temperature: float) -> np.ndarray:
    shifted = values.astype(np.float64) / temperature
    shifted -= shifted.max(axis=-1, keepdims=True)
    exponentials = np.exp(shifted)
    return (exponentials / exponentials.sum(axis=-1, keepdims=True)).astype(
        np.float32
    )


def parity_rows(manifest_filename: str) -> list[dict[str, object]]:
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in load_manifest("validation", manifest_filename):
        grouped[str(row["model_class"])].append(row)
    return [
        row
        for model_class in sorted(grouped)
        for row in grouped[model_class][:16]
    ]


def main() -> None:
    set_determinism(26029)
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    thresholds = json.loads(THRESHOLDS_PATH.read_text(encoding="utf-8"))["gates"]
    checkpoint_path = ROOT / str(contract["checkpoint"])
    config_path = ROOT / "config" / str(contract["training_config"])
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if sha256_file(checkpoint_path) != contract["checkpoint_sha256"]:
        raise RuntimeError("checkpoint differs from frozen v14 contract")
    if sha256_file(config_path) != contract["training_config_sha256"]:
        raise RuntimeError("training config differs from frozen v14 contract")

    base_checkpoint = ROOT / str(config["model"]["base_checkpoint"])
    model, initialization = build_conditioned_model(
        str(config["model"]["base_model_id"]), base_checkpoint
    )
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".onnx.tmp")
    torch.onnx.export(
        model,
        torch.zeros(1, 3, 224, 224),
        temporary,
        input_names=["pixel_values"],
        output_names=["conditioned_logits"],
        dynamic_axes={
            "pixel_values": {0: "batch"},
            "conditioned_logits": {0: "batch"},
        },
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    onnx.checker.check_model(str(temporary))
    shutil.move(temporary, OUTPUT)

    _, transform = make_transforms(config)
    rows = parity_rows(str(contract["manifest"]))
    dataset = ManifestDataset(rows, transform)
    tensors = torch.stack([dataset[index][0] for index in range(len(dataset))])
    with torch.inference_mode():
        torch_logits = model(tensors).numpy()

    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(
        str(OUTPUT),
        sess_options=options,
        providers=["CPUExecutionProvider"],
    )
    onnx_logits = session.run(
        ["conditioned_logits"], {"pixel_values": tensors.numpy()}
    )[0]
    temperature = float(contract["temperature"])
    torch_probabilities = softmax(torch_logits, temperature)
    onnx_probabilities = softmax(onnx_logits, temperature)
    top1 = float(
        (
            torch_probabilities.argmax(-1) == onnx_probabilities.argmax(-1)
        ).mean()
    )
    max_probability_error = float(
        np.abs(torch_probabilities - onnx_probabilities).max()
    )
    max_logit_error = float(np.abs(torch_logits - onnx_logits).max())

    sample = np.zeros((1, 3, 224, 224), dtype=np.float32)
    for _ in range(10):
        session.run(["conditioned_logits"], {"pixel_values": sample})
    timings: list[float] = []
    for _ in range(100):
        started = time.perf_counter()
        session.run(["conditioned_logits"], {"pixel_values": sample})
        timings.append((time.perf_counter() - started) * 1000)
    timings.sort()
    latency_p95 = timings[94]
    checks = {
        "onnx_size": OUTPUT.stat().st_size
        <= int(thresholds["maximum_onnx_size_bytes"]),
        "onnx_top1_parity": top1
        >= float(thresholds["minimum_onnx_top1_parity"]),
        "onnx_probability_error": max_probability_error
        <= float(thresholds["maximum_onnx_probability_abs_error"]),
        "cpu_latency_p95": latency_p95
        <= float(thresholds["maximum_cpu_latency_p95_ms"]),
    }
    report = {
        "version": "conditioned-dinov2-onnx-export-v14",
        "model_id": contract["model_id"],
        "contract_sha256": sha256_file(CONTRACT_PATH),
        "checkpoint_sha256": sha256_file(checkpoint_path),
        "initialization": initialization,
        "onnx_sha256": sha256_file(OUTPUT),
        "onnx_size_bytes": OUTPUT.stat().st_size,
        "opset": 17,
        "input": {"name": "pixel_values", "shape": ["batch", 3, 224, 224]},
        "output": {
            "name": "conditioned_logits",
            "shape": ["batch", 4, 3],
            "crop_order": contract["conditioned_crops"],
            "class_order": contract["conditioned_classes"],
        },
        "parity_rows": len(rows),
        "parity_cells": len(rows) * 4,
        "onnx_top1_parity": top1,
        "maximum_logit_absolute_error": max_logit_error,
        "maximum_probability_absolute_error": max_probability_error,
        "cpu_latency_samples": len(timings),
        "cpu_latency_p50_ms": statistics.median(timings),
        "cpu_latency_p95_ms": latency_p95,
        "quantized": False,
        "quantization_reason": "FP32 ONNX is below the frozen 100 MiB size gate.",
        "checks": checks,
        "passed": all(checks.values()),
        "is_production_validated": False,
    }
    report_path = REPORTS / "conditioned_onnx_export_v14.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
