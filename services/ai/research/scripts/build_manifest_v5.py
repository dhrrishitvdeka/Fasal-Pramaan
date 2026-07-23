#!/usr/bin/env python3
"""Append the disjoint PLDD-UP whole-plant potato field originals."""

from __future__ import annotations

import hashlib
import json
import random
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import imagehash
import numpy as np
import torch
from PIL import Image, ImageOps
from torch import nn
from torch.utils.data import DataLoader
from torchvision import models, transforms
from tqdm import tqdm

from build_manifest import (
    AI_ROOT,
    CACHE_ROOT,
    ImageRows,
    RAW_ROOT,
    UnionFind,
    cluster_ids,
    merge_capture_groups,
    merge_clusters,
    perceptual_clusters,
    sha256_file,
)
from build_manifest_v2 import (
    assign_new_splits as assign_v2_splits,
    incremental_embedding_clusters,
    load_jsonl,
    normalized,
)
from build_manifest_v4 import build_source_rows as build_v4_source_rows


ROOT = Path(__file__).resolve().parents[1]
BASE_MANIFEST = ROOT / "manifest_v4.jsonl"
OUTPUT = ROOT / "manifest_v5.jsonl"
SUMMARY = ROOT / "manifest_summary_v5.json"
QA_SAMPLE = ROOT / "qa_sample_v5.json"
SOURCE = "potato_pldd_up_ccby"
SOURCE_ROOT = RAW_ROOT / SOURCE
SEED = 26013
SOURCE_URL = "https://data.mendeley.com/datasets/3j4nfkvp2n/1"
SOURCE_REVISION = "10.17632/3j4nfkvp2n.1"
ARCHIVE_SET_SHA256 = "aa45fc6e55f73edf71e8d77c13587d59c5cb2f7afdcedab86e1a800f4da703af"


def capture_group(label: str, original_path: str) -> str:
    """Keep adjacent frames and same-number resolution variants indivisible."""
    name = Path(original_path).stem.lower()
    match = re.search(r"\((\d+)\)", name)
    bucket = f"{int(match.group(1)) // 100:04d}" if match else hashlib.sha256(
        name.encode("utf-8")
    ).hexdigest()[:10]
    return f"{SOURCE}:{normalized(label)}:sequence-{bucket}"


def build_source_rows() -> tuple[list[dict[str, Any]], list[Path], Counter[str]]:
    metadata = load_jsonl(SOURCE_ROOT / "metadata.jsonl")
    by_sha: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in metadata:
        by_sha[str(item["image_sha256"])].append(item)

    rows: list[dict[str, Any]] = []
    cached_paths: list[Path] = []
    excluded: Counter[str] = Counter()
    for digest, items in sorted(by_sha.items()):
        labels = sorted({str(item["label"]).strip() for item in items})
        health_values = {
            "healthy" if label.lower() == "healthy" else "disease" for label in labels
        }
        if len(health_values) != 1:
            excluded["conflicting_duplicate_health_labels"] += 1
            continue
        health = next(iter(health_values))
        exemplar = min(items, key=lambda item: str(item["relative_path"]))
        cached_path = ROOT / str(exemplar["cached_relative_path"])
        with Image.open(cached_path) as image:
            phash = str(imagehash.phash(ImageOps.exif_transpose(image).convert("RGB")))
        label = "; ".join(labels)
        rows.append(
            {
                "id": hashlib.sha256(f"{SOURCE}:{digest}".encode()).hexdigest()[:24],
                "source_dataset": SOURCE,
                "original_path": str(exemplar["relative_path"]),
                "cached_relative_path": str(exemplar["cached_relative_path"]),
                "cached_image_sha256": str(exemplar["cached_image_sha256"]),
                "cached_max_dimension": int(exemplar["cached_max_dimension"]),
                "original_label": label,
                "canonical_crop": "potato",
                "canonical_disease": "healthy" if health == "healthy" else normalized(label),
                "health_state": health,
                "model_class": f"potato__{health}",
                "invalid_category": None,
                "capture_group": capture_group(labels[0], str(exemplar["original_path"])),
                "synthetic": False,
                "source_url": SOURCE_URL,
                "license": "CC BY 4.0",
                "source_revision": SOURCE_REVISION,
                "archive_sha256": ARCHIVE_SET_SHA256,
                "image_sha256": digest,
                "phash": phash,
                "width": int(exemplar["width"]),
                "height": int(exemplar["height"]),
            }
        )
        cached_paths.append(cached_path)
    return rows, cached_paths, excluded


def v4_embedding_lookup() -> dict[str, np.ndarray]:
    v3_rows = load_jsonl(ROOT / "manifest_v3.jsonl")
    v3_paths = [RAW_ROOT / row["source_dataset"] / row["original_path"] for row in v3_rows]
    _, v4_paths, _ = build_v4_source_rows()
    cached_paths = v3_paths + v4_paths
    cache_meta = json.loads(
        (CACHE_ROOT / "baseline_mobilenetv2_embeddings_v4.json").read_text(encoding="utf-8")
    )
    fingerprint = hashlib.sha256(
        "\n".join(str(path) for path in cached_paths).encode()
    ).hexdigest()
    embeddings = np.load(CACHE_ROOT / "baseline_mobilenetv2_embeddings_v4.npy")
    if fingerprint != cache_meta["path_fingerprint"] or len(embeddings) != len(cached_paths):
        raise RuntimeError("cannot align verified v4 embedding cache")
    return {str(path): embeddings[index] for index, path in enumerate(cached_paths)}


def compute_incremental_embeddings(
    base_paths: list[Path], new_paths: list[Path]
) -> np.ndarray:
    all_paths = base_paths + new_paths
    fingerprint = hashlib.sha256("\n".join(str(path) for path in all_paths).encode()).hexdigest()
    cache = CACHE_ROOT / "baseline_mobilenetv2_embeddings_v5.npy"
    cache_meta = CACHE_ROOT / "baseline_mobilenetv2_embeddings_v5.json"
    if cache.exists() and cache_meta.exists():
        meta = json.loads(cache_meta.read_text(encoding="utf-8"))
        if meta.get("path_fingerprint") == fingerprint:
            return np.load(cache)

    lookup = v4_embedding_lookup()
    missing = [str(path) for path in base_paths if str(path) not in lookup]
    if missing:
        raise RuntimeError(f"v4 embedding lookup missing {len(missing)} manifest rows")
    base_embeddings = np.stack([lookup[str(path)] for path in base_paths])
    checkpoint = torch.load(
        AI_ROOT / "models" / "plant_disease" / "checkpoint.pt",
        map_location="cpu",
        weights_only=False,
    )
    model = models.mobilenet_v2(weights=None)
    model.classifier[1] = nn.Linear(model.last_channel, len(checkpoint["classes"]))
    model.load_state_dict(checkpoint["model_state_dict"])
    feature_model = nn.Sequential(model.features, nn.AdaptiveAvgPool2d(1), nn.Flatten())
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    feature_model.to(device).eval()
    transform = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(checkpoint["normalize_mean"], checkpoint["normalize_std"]),
        ]
    )
    loader = DataLoader(
        ImageRows(new_paths, transform),
        batch_size=128 if device.type == "cuda" else 24,
        shuffle=False,
        num_workers=4,
        pin_memory=device.type == "cuda",
    )
    output: list[np.ndarray] = []
    with torch.inference_mode():
        for images in tqdm(loader, desc=f"v5 new embeddings ({device.type})"):
            features = feature_model(images.to(device, non_blocking=True))
            output.append(
                torch.nn.functional.normalize(features, dim=1)
                .cpu()
                .numpy()
                .astype(np.float16)
            )
    combined = np.concatenate([base_embeddings, np.concatenate(output)])
    np.save(cache, combined)
    cache_meta.write_text(
        json.dumps({"path_fingerprint": fingerprint, "rows": len(combined)}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    return combined


def assign_splits(
    base_rows: list[dict[str, Any]],
    new_rows: list[dict[str, Any]],
    split_union: UnionFind,
) -> tuple[list[dict[str, Any]], Counter[str]]:
    accepted, excluded = assign_v2_splits(base_rows, new_rows, split_union)
    replacements: dict[str, str] = {}
    for row in accepted:
        group = str(row["split_group"])
        if group.startswith("v2-split-"):
            row["split_group"] = replacements.setdefault(
                group, f"v5-split-{len(replacements):06d}"
            )
    return accepted, excluded


def build_qa(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    randomizer = random.Random(SEED)
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row["original_label"])].append(row)
    sample: list[dict[str, Any]] = []
    for key in sorted(groups):
        values = sorted(groups[key], key=lambda item: item["id"])
        for row in randomizer.sample(values, min(12, len(values))):
            sample.append(
                {
                    "id": row["id"],
                    "source_dataset": SOURCE,
                    "original_path": row["original_path"],
                    "original_label": row["original_label"],
                    "canonical_crop": row["canonical_crop"],
                    "health_state": row["health_state"],
                    "model_class": row["model_class"],
                    "qa_status": "pending_manual_review",
                    "qa_notes": "",
                }
            )
    return sample


def main() -> None:
    base_rows = load_jsonl(BASE_MANIFEST)
    base_paths = [RAW_ROOT / row["source_dataset"] / row["original_path"] for row in base_rows]
    new_rows, new_paths, pre_excluded = build_source_rows()
    rows = base_rows + new_rows
    embeddings = compute_incremental_embeddings(base_paths, new_paths)
    phash_ids, phash_union = perceptual_clusters(rows, embeddings)
    embedding_union = incremental_embedding_clusters(embeddings, rows, len(base_rows))
    embedding_ids = cluster_ids(embedding_union, "v5-embed")
    duplicate_union = merge_clusters(phash_union, embedding_union)
    near_ids = cluster_ids(duplicate_union, "v5-near")
    for offset, row in enumerate(new_rows, start=len(base_rows)):
        row["perceptual_cluster"] = phash_ids[offset]
        row["embedding_cluster"] = embedding_ids[offset]
        row["near_duplicate_cluster"] = near_ids[offset]

    split_union = merge_capture_groups(rows, duplicate_union)
    accepted, split_excluded = assign_splits(base_rows, new_rows, split_union)
    excluded = pre_excluded + split_excluded
    combined = sorted(base_rows + accepted, key=lambda item: item["id"])
    OUTPUT.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in combined),
        encoding="utf-8",
    )
    qa = build_qa(accepted)
    QA_SAMPLE.write_text(json.dumps(qa, indent=2) + "\n", encoding="utf-8")
    base_test_ids = sorted(row["id"] for row in base_rows if row["split"] == "test")
    v5_test_ids = sorted(row["id"] for row in combined if row["split"] == "test")
    if base_test_ids != v5_test_ids:
        raise RuntimeError("manifest v5 changed the frozen test IDs")
    summary = {
        "version": "manifest-summary-v5",
        "base_manifest_sha256": sha256_file(BASE_MANIFEST),
        "manifest_sha256": sha256_file(OUTPUT),
        "rows": len(combined),
        "candidate_new_unique_images": len(new_rows),
        "accepted_new_images": len(accepted),
        "excluded_new_images": dict(sorted(excluded.items())),
        "frozen_test_rows": len(v5_test_ids),
        "frozen_test_ids_sha256": hashlib.sha256("\n".join(v5_test_ids).encode()).hexdigest(),
        "counts_by_split": dict(sorted(Counter(row["split"] for row in combined).items())),
        "counts_by_model_class_and_split": {
            f"{key[0]}:{key[1]}": value
            for key, value in sorted(
                Counter((row["model_class"], row["split"]) for row in combined).items()
            )
        },
        "added_counts": {
            f"{key[0]}:{key[1]}": value
            for key, value in sorted(
                Counter((row["model_class"], row["split"]) for row in accepted).items()
            )
        },
        "qa_sample_rows": len(qa),
        "deduplication": {
            "exact_sha256_plus_phash_embedding_review": True,
            "conflicting_exact_label_groups_excluded": True,
            "capture_sessions_grouped_before_split": True,
            "new_rows_matching_frozen_test_are_excluded": True,
        },
        "is_production_validated": False,
    }
    SUMMARY.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
