#!/usr/bin/env python3
"""Evaluate the shipped MobileNetV2 checkpoint on frozen field-style data."""

from __future__ import annotations

import json
import statistics
import time

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision import models, transforms
from tqdm import tqdm

from ml_common import (
    AI_ROOT,
    CLASSES,
    CLASS_TO_INDEX,
    ManifestDataset,
    REPORTS,
    classification_metrics,
    load_manifest,
    save_reliability_diagram,
    set_determinism,
    sha256_file,
)


def legacy_target(name: str) -> str:
    if name.startswith("Corn_(maize)___"):
        return "maize__healthy" if "healthy" in name.lower() else "maize__disease"
    if name.startswith("Potato___"):
        return "potato__healthy" if "healthy" in name.lower() else "potato__disease"
    return "invalid__ood"


def main() -> None:
    set_determinism()
    checkpoint_path = AI_ROOT / "models" / "plant_disease" / "checkpoint.pt"
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    legacy_classes = list(checkpoint["classes"])
    model = models.mobilenet_v2(weights=None)
    model.classifier[1] = nn.Linear(model.last_channel, len(legacy_classes))
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    transform = transforms.Compose(
        [
            transforms.Resize((int(checkpoint.get("image_size", 224)),) * 2),
            transforms.ToTensor(),
            transforms.Normalize(checkpoint["normalize_mean"], checkpoint["normalize_std"]),
        ]
    )
    rows = load_manifest("test")
    loader = DataLoader(
        ManifestDataset(rows, transform),
        batch_size=128 if device.type == "cuda" else 32,
        shuffle=False,
        num_workers=0,
        pin_memory=device.type == "cuda",
    )
    probabilities: list[np.ndarray] = []
    targets: list[np.ndarray] = []
    with torch.inference_mode():
        for images, labels, _ in tqdm(loader, desc=f"baseline test ({device.type})"):
            legacy_probs = torch.softmax(model(images.to(device)), dim=1).cpu().numpy()
            mapped = np.zeros((len(images), len(CLASSES)), dtype=np.float32)
            for old_index, old_name in enumerate(legacy_classes):
                mapped[:, CLASS_TO_INDEX[legacy_target(old_name)]] += legacy_probs[:, old_index]
            probabilities.append(mapped)
            targets.append(labels.numpy())
    probs = np.concatenate(probabilities)
    truth = np.concatenate(targets)
    metrics = classification_metrics(rows, truth, probs)

    cpu_model = model.to("cpu")
    sample = torch.zeros(1, 3, int(checkpoint.get("image_size", 224)), int(checkpoint.get("image_size", 224)))
    with torch.inference_mode():
        for _ in range(10):
            cpu_model(sample)
        latencies = []
        for _ in range(100):
            start = time.perf_counter()
            cpu_model(sample)
            latencies.append((time.perf_counter() - start) * 1000)
    latencies.sort()
    metrics["cpu_latency_p50_ms"] = statistics.median(latencies)
    metrics["cpu_latency_p95_ms"] = latencies[94]
    metrics["model_size_bytes"] = checkpoint_path.stat().st_size
    metrics["checkpoint_sha256"] = sha256_file(checkpoint_path)

    report = {
        "version": "legacy-baseline-field-evaluation-v1",
        "model": "mobilenet_v2_legacy_15_class",
        "mapping": {name: legacy_target(name) for name in legacy_classes},
        "metrics": metrics,
        "limitations": [
            "No paddy or wheat output classes exist in the legacy checkpoint.",
            "Training used only 240 synthetic PlantVillage-named images.",
            "Classification confidence is uncalibrated and is not severity or loss.",
        ],
        "is_production_validated": False,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "baseline_field_evaluation_v1.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    save_reliability_diagram(
        metrics,
        REPORTS / "baseline_reliability_v1.png",
        "Legacy MobileNetV2 reliability (frozen field-style test)",
    )
    print(json.dumps({"model": report["model"], "metrics": {k: metrics[k] for k in ("rows", "accuracy", "macro_f1", "balanced_accuracy", "expected_calibration_error_15_bins", "invalid_ood_rejection_recall", "id_coverage", "cpu_latency_p50_ms", "cpu_latency_p95_ms")}}, indent=2))


if __name__ == "__main__":
    main()
