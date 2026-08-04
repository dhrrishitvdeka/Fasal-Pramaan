#!/usr/bin/env python3
"""Evaluate the vendored public ViT-Tiny before local fine-tuning."""

from __future__ import annotations

import json
import statistics
import time

import numpy as np
import torch
from torch.utils.data import DataLoader
from torchvision import transforms
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
from vit_onnx_transfer import load_vit_tiny_from_onnx


SOURCE_LABELS = [
    "Corn___Common_Rust",
    "Corn___Gray_Leaf_Spot",
    "Corn___Healthy",
    "Invalid",
    "Potato___Early_Blight",
    "Potato___Healthy",
    "Potato___Late_Blight",
    "Rice___Brown_Spot",
    "Rice___Healthy",
    "Rice___Leaf_Blast",
    "Wheat___Brown_Rust",
    "Wheat___Healthy",
    "Wheat___Yellow_Rust",
]


def mapped_label(label: str) -> str:
    if label == "Invalid":
        return "invalid__ood"
    crop = {"Corn": "maize", "Rice": "paddy", "Potato": "potato", "Wheat": "wheat"}[label.split("___")[0]]
    return f"{crop}__{'healthy' if 'Healthy' in label else 'disease'}"


def main() -> None:
    set_determinism()
    path = AI_ROOT / "models" / "crop_vit" / "crop_leaf_diseases_vit.onnx"
    model, _ = load_vit_tiny_from_onnx(path, 13, keep_source_head=True)
    model.eval()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    transform = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.5] * 3, [0.5] * 3),
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
        for images, labels, _ in tqdm(loader, desc=f"public ViT test ({device.type})"):
            source_probs = torch.softmax(model(images.to(device)), dim=1).cpu().numpy()
            mapped = np.zeros((len(images), len(CLASSES)), dtype=np.float32)
            for index, label in enumerate(SOURCE_LABELS):
                mapped[:, CLASS_TO_INDEX[mapped_label(label)]] += source_probs[:, index]
            probabilities.append(mapped)
            targets.append(labels.numpy())
    probs, truth = np.concatenate(probabilities), np.concatenate(targets)
    metrics = classification_metrics(rows, truth, probs)
    cpu = model.to("cpu")
    sample = torch.zeros(1, 3, 224, 224)
    with torch.inference_mode():
        for _ in range(5):
            cpu(sample)
        latency = []
        for _ in range(50):
            start = time.perf_counter()
            cpu(sample)
            latency.append((time.perf_counter() - start) * 1000)
    latency.sort()
    metrics.update(
        {
            "cpu_latency_p50_ms": statistics.median(latency),
            "cpu_latency_p95_ms": latency[47],
            "model_size_bytes": path.stat().st_size,
            "model_sha256": sha256_file(path),
        }
    )
    report = {
        "version": "public-vit-prefinetune-evaluation-v1",
        "model": "wambugu71_crop_leaf_diseases_vit_tiny",
        "metrics": metrics,
        "promotion_eligible": False,
        "reason": "External source training IDs are unavailable, so overlap with public evaluation sources cannot be ruled out.",
        "is_production_validated": False,
    }
    (REPORTS / "public_vit_field_evaluation_v1.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    save_reliability_diagram(metrics, REPORTS / "public_vit_reliability_v1.png", "Public ViT-Tiny before local fine-tuning")
    print(json.dumps({k: metrics[k] for k in ("accuracy", "macro_f1", "balanced_accuracy", "expected_calibration_error_15_bins", "invalid_ood_rejection_recall", "id_coverage")}, indent=2))


if __name__ == "__main__":
    main()
