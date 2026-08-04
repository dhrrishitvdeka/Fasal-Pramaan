#!/usr/bin/env python3
"""Append disjoint Ethiopian-potato and seasonal-maize field originals."""

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
from build_manifest_v3 import build_source_rows as build_v3_source_rows


ROOT = Path(__file__).resolve().parents[1]
BASE_MANIFEST = ROOT / "manifest_v3.jsonl"
OUTPUT = ROOT / "manifest_v4.jsonl"
SUMMARY = ROOT / "manifest_summary_v4.json"
QA_SAMPLE = ROOT / "qa_sample_v4.json"
SEED = 26011
SOURCES = {
    "potato_ethiopia_ccby": {
        "crop": "potato",
        "healthy_labels": {"healthy"},
        "source_url": "https://data.mendeley.com/datasets/v4w72bsts5/1",
        "source_revision": "10.17632/v4w72bsts5.1",
        "archive_sha256": "6928a86923c15059a838003b1113ac7fbac8c0790e64190b0c37acb4bbd5f5eb",
    },
    "maize_seasonal_ccby": {
        "crop": "maize",
        "healthy_labels": {"healthy"},
        "source_url": "https://data.mendeley.com/datasets/vy629dngm8/1",
        "source_revision": "10.17632/vy629dngm8.1",
        "archive_sha256": "575628df92e69c169fa82c8506253d7d5886a8931605bf765f0e2577022dc479",
    },
}


def capture_group(source: str, label: str, original_path: str) -> str:
    """Conservatively group adjacent frames from the same camera session."""
    name = Path(original_path).name.lower()
    dated = re.search(r"img_(\d{8})", name)
    if dated:
        key = f"date-{dated.group(1)}"
    else:
        dsc = re.search(r"dsc[_ -]?(\d+)", name)
        if dsc:
            key = f"dsc-bucket-{int(dsc.group(1)) // 50:04d}"
        else:
            number = re.search(r"\((\d+)\)", name)
            key = (
                f"sequence-{int(number.group(1)) // 50:04d}"
                if number
                else re.sub(r"[^a-z0-9]+", "-", Path(name).stem)[:48]
            )
    return f"{source}:{label.lower()}:{key}"


def build_source_rows() -> tuple[list[dict[str, Any]], list[Path], Counter[str]]:
    rows: list[dict[str, Any]] = []
    paths: list[Path] = []
    excluded: Counter[str] = Counter()
    for source, config in SOURCES.items():
        metadata = load_jsonl(RAW_ROOT / source / "metadata.jsonl")
        by_sha: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for item in metadata:
            by_sha[str(item["image_sha256"])].append(item)
        for digest, items in sorted(by_sha.items()):
            labels = sorted({str(item["label"]).strip() for item in items})
            health_values = {
                "healthy"
                if label.lower() in config["healthy_labels"]
                else "disease"
                for label in labels
            }
            if len(health_values) != 1:
                excluded[f"{source}:conflicting_duplicate_health_labels"] += 1
                continue
            health = next(iter(health_values))
            exemplar = min(items, key=lambda item: str(item["relative_path"]))
            path = RAW_ROOT / source / str(exemplar["relative_path"])
            with Image.open(path) as image:
                phash = str(imagehash.phash(ImageOps.exif_transpose(image).convert("RGB")))
            crop = str(config["crop"])
            original_path = str(exemplar["original_path"])
            row_id = hashlib.sha256(f"{source}:{digest}".encode()).hexdigest()[:24]
            rows.append(
                {
                    "id": row_id,
                    "source_dataset": source,
                    "original_path": str(exemplar["relative_path"]),
                    "original_label": "; ".join(labels),
                    "canonical_crop": crop,
                    "canonical_disease": (
                        "healthy" if health == "healthy" else normalized("; ".join(labels))
                    ),
                    "health_state": health,
                    "model_class": f"{crop}__{health}",
                    "invalid_category": None,
                    "capture_group": capture_group(source, labels[0], original_path),
                    "synthetic": False,
                    "source_url": config["source_url"],
                    "license": "CC BY 4.0",
                    "source_revision": config["source_revision"],
                    "archive_sha256": config["archive_sha256"],
                    "image_sha256": digest,
                    "phash": phash,
                    "width": int(exemplar["width"]),
                    "height": int(exemplar["height"]),
                }
            )
            paths.append(path)
    return rows, paths, excluded


def v3_embedding_lookup() -> dict[str, np.ndarray]:
    v2_rows = load_jsonl(ROOT / "manifest_v2.jsonl")
    v2_paths = [RAW_ROOT / row["source_dataset"] / row["original_path"] for row in v2_rows]
    _, v3_paths, _ = build_v3_source_rows()
    cached_paths = v2_paths + v3_paths
    cache_meta = json.loads(
        (CACHE_ROOT / "baseline_mobilenetv2_embeddings_v3.json").read_text(encoding="utf-8")
    )
    fingerprint = hashlib.sha256(
        "\n".join(str(path) for path in cached_paths).encode()
    ).hexdigest()
    embeddings = np.load(CACHE_ROOT / "baseline_mobilenetv2_embeddings_v3.npy")
    if fingerprint != cache_meta["path_fingerprint"] or len(embeddings) != len(cached_paths):
        raise RuntimeError("cannot align verified v3 embedding cache")
    return {str(path): embeddings[index] for index, path in enumerate(cached_paths)}


def compute_incremental_embeddings(
    base_paths: list[Path], new_paths: list[Path]
) -> np.ndarray:
    all_paths = base_paths + new_paths
    fingerprint = hashlib.sha256("\n".join(str(path) for path in all_paths).encode()).hexdigest()
    cache = CACHE_ROOT / "baseline_mobilenetv2_embeddings_v4.npy"
    cache_meta = CACHE_ROOT / "baseline_mobilenetv2_embeddings_v4.json"
    if cache.exists() and cache_meta.exists():
        meta = json.loads(cache_meta.read_text(encoding="utf-8"))
        if meta.get("path_fingerprint") == fingerprint:
            return np.load(cache)
    lookup = v3_embedding_lookup()
    missing = [str(path) for path in base_paths if str(path) not in lookup]
    if missing:
        raise RuntimeError(f"v3 embedding lookup missing {len(missing)} manifest rows")
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
        batch_size=96 if device.type == "cuda" else 24,
        shuffle=False,
        num_workers=4,
        pin_memory=device.type == "cuda",
    )
    output = []
    with torch.inference_mode():
        for images in tqdm(loader, desc=f"v4 new embeddings ({device.type})"):
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
                group, f"v4-split-{len(replacements):06d}"
            )
    return accepted, excluded


def build_qa(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    randomizer = random.Random(SEED)
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[(str(row["source_dataset"]), str(row["original_label"]))].append(row)
    sample = []
    for key in sorted(groups):
        values = sorted(groups[key], key=lambda item: item["id"])
        for row in randomizer.sample(values, min(8, len(values))):
            sample.append(
                {
                    "id": row["id"],
                    "source_dataset": row["source_dataset"],
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
    embedding_ids = cluster_ids(embedding_union, "v4-embed")
    duplicate_union = merge_clusters(phash_union, embedding_union)
    near_ids = cluster_ids(duplicate_union, "v4-near")
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
    v4_test_ids = sorted(row["id"] for row in combined if row["split"] == "test")
    if base_test_ids != v4_test_ids:
        raise RuntimeError("manifest v4 changed the frozen test IDs")
    counts = Counter((row["model_class"], row["split"]) for row in combined)
    added_counts = Counter(
        (row["source_dataset"], row["model_class"], row["split"]) for row in accepted
    )
    summary = {
        "version": "manifest-summary-v4",
        "base_manifest_sha256": sha256_file(BASE_MANIFEST),
        "manifest_sha256": sha256_file(OUTPUT),
        "rows": len(combined),
        "candidate_new_unique_images": len(new_rows),
        "accepted_new_images": len(accepted),
        "excluded_new_images": dict(sorted(excluded.items())),
        "frozen_test_rows": len(v4_test_ids),
        "frozen_test_ids_sha256": hashlib.sha256(
            "\n".join(v4_test_ids).encode()
        ).hexdigest(),
        "counts_by_split": dict(sorted(Counter(row["split"] for row in combined).items())),
        "counts_by_model_class_and_split": {
            f"{key[0]}:{key[1]}": value for key, value in sorted(counts.items())
        },
        "added_counts": {
            f"{key[0]}:{key[1]}:{key[2]}": value
            for key, value in sorted(added_counts.items())
        },
        "qa_sample_rows": len(qa),
        "deduplication": {
            "exact_sha256_plus_phash_embedding_review": True,
            "capture_sessions_grouped_before_split": True,
            "new_rows_matching_frozen_test_are_excluded": True,
        },
        "is_production_validated": False,
    }
    SUMMARY.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
