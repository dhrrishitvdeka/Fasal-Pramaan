"""Shared deterministic data and metric helpers for model research."""

from __future__ import annotations

import hashlib
import json
import os
import random
from collections import Counter
from pathlib import Path
from typing import Any, Callable, Sequence

import numpy as np
import torch
from PIL import Image, ImageOps
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from torch.utils.data import Dataset


ROOT = Path(__file__).resolve().parents[1]
AI_ROOT = ROOT.parent
RAW_ROOT = ROOT / "data" / "raw"
REPORTS = ROOT / "reports"
RUNS = ROOT / "runs"
SEED = 26007
CLASSES = [
    "maize__healthy",
    "maize__disease",
    "paddy__healthy",
    "paddy__disease",
    "potato__healthy",
    "potato__disease",
    "wheat__healthy",
    "wheat__disease",
    "invalid__ood",
]
CLASS_TO_INDEX = {name: index for index, name in enumerate(CLASSES)}


def long_path(path: Path) -> str:
    resolved = str(path.resolve())
    return f"\\\\?\\{resolved}" if os.name == "nt" else resolved


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def set_determinism(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = True


def load_manifest(
    split: str | None = None, manifest_filename: str = "manifest_v1.jsonl"
) -> list[dict[str, Any]]:
    rows = [
        json.loads(line)
        for line in (ROOT / manifest_filename).read_text(encoding="utf-8").splitlines()
        if line
    ]
    if split:
        rows = [row for row in rows if row["split"] == split]
    return sorted(rows, key=lambda row: row["id"])


def deterministic_cap(
    rows: Sequence[dict[str, Any]], per_class: int | None
) -> list[dict[str, Any]]:
    if per_class is None:
        return list(rows)
    selected: list[dict[str, Any]] = []
    by_class: dict[str, list[dict[str, Any]]] = {name: [] for name in CLASSES}
    for row in rows:
        by_class[row["model_class"]].append(row)
    for model_class in CLASSES:
        ordered = sorted(
            by_class[model_class],
            key=lambda row: hashlib.sha256(f"{SEED}:{row['id']}".encode()).hexdigest(),
        )
        selected.extend(ordered[:per_class])
    return sorted(selected, key=lambda row: row["id"])


class ManifestDataset(Dataset):
    def __init__(
        self,
        rows: Sequence[dict[str, Any]],
        transform: Callable[[Image.Image], torch.Tensor],
    ) -> None:
        self.rows = list(rows)
        self.transform = transform

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int, int]:
        row = self.rows[index]
        cached = row.get("cached_relative_path")
        path = ROOT / str(cached) if cached else RAW_ROOT / row["source_dataset"] / row["original_path"]
        with Image.open(long_path(path)) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            tensor = self.transform(image)
        return tensor, CLASS_TO_INDEX[row["model_class"]], index


def expected_calibration_error(
    probabilities: np.ndarray, targets: np.ndarray, bins: int = 15
) -> tuple[float, list[dict[str, float]]]:
    confidences = probabilities.max(axis=1)
    predictions = probabilities.argmax(axis=1)
    correct = predictions == targets
    edges = np.linspace(0.0, 1.0, bins + 1)
    ece = 0.0
    details: list[dict[str, float]] = []
    for index in range(bins):
        lower, upper = edges[index], edges[index + 1]
        mask = (confidences > lower) & (confidences <= upper)
        if index == 0:
            mask |= confidences == 0.0
        count = int(mask.sum())
        accuracy = float(correct[mask].mean()) if count else 0.0
        confidence = float(confidences[mask].mean()) if count else 0.0
        if count:
            ece += count / len(targets) * abs(accuracy - confidence)
        details.append(
            {
                "lower": float(lower),
                "upper": float(upper),
                "count": count,
                "accuracy": accuracy,
                "confidence": confidence,
            }
        )
    return float(ece), details


def classification_metrics(
    rows: Sequence[dict[str, Any]],
    targets: np.ndarray,
    probabilities: np.ndarray,
) -> dict[str, Any]:
    predictions = probabilities.argmax(axis=1)
    labels = list(range(len(CLASSES)))
    precision, recall, f1, support = precision_recall_fscore_support(
        targets, predictions, labels=labels, zero_division=0
    )
    ece, reliability = expected_calibration_error(probabilities, targets)
    per_class = {
        name: {
            "precision": float(precision[index]),
            "recall": float(recall[index]),
            "f1": float(f1[index]),
            "support": int(support[index]),
        }
        for index, name in enumerate(CLASSES)
    }
    crop_metrics: dict[str, dict[str, float | int]] = {}
    for crop in ("maize", "paddy", "potato", "wheat"):
        indices = [index for index, row in enumerate(rows) if row["canonical_crop"] == crop]
        true_crop = np.isin(targets, [CLASS_TO_INDEX[f"{crop}__healthy"], CLASS_TO_INDEX[f"{crop}__disease"]])
        pred_crop = np.isin(predictions, [CLASS_TO_INDEX[f"{crop}__healthy"], CLASS_TO_INDEX[f"{crop}__disease"]])
        tp = int((true_crop & pred_crop).sum())
        fp = int((~true_crop & pred_crop).sum())
        crop_metrics[crop] = {
            "precision": tp / (tp + fp) if tp + fp else 0.0,
            "recall": tp / int(true_crop.sum()) if true_crop.sum() else 0.0,
            "support": len(indices),
            "healthy_recall": float(recall[CLASS_TO_INDEX[f"{crop}__healthy"]]),
            "disease_recall": float(recall[CLASS_TO_INDEX[f"{crop}__disease"]]),
        }

    source_metrics: dict[str, dict[str, float | int]] = {}
    for source in sorted({row["source_dataset"] for row in rows}):
        mask = np.array([row["source_dataset"] == source for row in rows])
        source_metrics[source] = {
            "rows": int(mask.sum()),
            "accuracy": float(accuracy_score(targets[mask], predictions[mask])),
            "macro_f1_present_classes": float(
                f1_score(targets[mask], predictions[mask], average="macro", zero_division=0)
            ),
        }

    invalid_index = CLASS_TO_INDEX["invalid__ood"]
    invalid_mask = targets == invalid_index
    id_mask = ~invalid_mask
    wrong = np.flatnonzero(predictions != targets)
    failures = [
        {
            "id": rows[index]["id"],
            "source": rows[index]["source_dataset"],
            "true": CLASSES[int(targets[index])],
            "predicted": CLASSES[int(predictions[index])],
            "confidence": float(probabilities[index].max()),
        }
        for index in sorted(wrong, key=lambda i: -float(probabilities[i].max()))[:100]
    ]
    return {
        "rows": len(rows),
        "accuracy": float(accuracy_score(targets, predictions)),
        "macro_f1": float(f1_score(targets, predictions, labels=labels, average="macro", zero_division=0)),
        "balanced_accuracy": float(balanced_accuracy_score(targets, predictions)),
        "per_class": per_class,
        "per_crop": crop_metrics,
        "per_source": source_metrics,
        "confusion_matrix": confusion_matrix(targets, predictions, labels=labels).tolist(),
        "expected_calibration_error_15_bins": ece,
        "reliability_bins": reliability,
        "invalid_ood_rejection_recall": float((predictions[invalid_mask] == invalid_index).mean()) if invalid_mask.any() else 0.0,
        "id_coverage": float((predictions[id_mask] != invalid_index).mean()) if id_mask.any() else 0.0,
        "prediction_counts": dict(sorted(Counter(CLASSES[index] for index in predictions).items())),
        "high_confidence_failures": failures,
    }


def save_reliability_diagram(report: dict[str, Any], path: Path, title: str) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    bins = report["reliability_bins"]
    confidence = [item["confidence"] for item in bins if item["count"]]
    accuracy = [item["accuracy"] for item in bins if item["count"]]
    plt.figure(figsize=(5.5, 5.5))
    plt.plot([0, 1], [0, 1], "--", color="gray", label="perfect calibration")
    plt.plot(confidence, accuracy, "o-", label="measured")
    plt.xlabel("Mean confidence")
    plt.ylabel("Accuracy")
    plt.title(title)
    plt.xlim(0, 1)
    plt.ylim(0, 1)
    plt.grid(alpha=0.25)
    plt.legend()
    path.parent.mkdir(parents=True, exist_ok=True)
    plt.tight_layout()
    plt.savefig(path, dpi=160)
    plt.close()
