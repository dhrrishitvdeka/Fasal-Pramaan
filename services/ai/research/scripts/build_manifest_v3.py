#!/usr/bin/env python3
"""Extend manifest v2 with disjoint potato and rice field originals."""

from __future__ import annotations

import hashlib
import json
import random
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
    merge_clusters,
    perceptual_clusters,
    sha256_file,
)
from build_manifest_v2 import (
    assign_new_splits as assign_v2_splits,
    build_digigreen_rows,
    incremental_embedding_clusters,
    load_jsonl,
    normalized,
)


ROOT = Path(__file__).resolve().parents[1]
BASE_MANIFEST = ROOT / "manifest_v2.jsonl"
OUTPUT = ROOT / "manifest_v3.jsonl"
SUMMARY = ROOT / "manifest_summary_v3.json"
QA_SAMPLE = ROOT / "qa_sample_v3.json"
SEED = 26007
SOURCES = {
    "potato_uncontrolled_ccby": {
        "crop": "potato",
        "healthy_labels": {"healthy"},
        "source_url": "https://huggingface.co/datasets/Project-AgML/potato_leaf_disease_classification",
        "source_revision": "d564ae2b7548f8a6ef99139ba69a1f82f2dfed5e",
        "archive_sha256": hashlib.sha256(
            (
                "b7d1992bcc763ae3148082acc3bb1c987551fcf2859efd8ae1c46c1061254c80\n"
                "5a972eedc52d380725fec634a15d931bd85a534056fc2b503180fbb35125ce78"
            ).encode()
        ).hexdigest(),
    },
    "ricey_field_ccby": {
        "crop": "paddy",
        "healthy_labels": {"healthy rice leaf"},
        "source_url": "https://data.mendeley.com/datasets/t46kkgh2yw/1",
        "source_revision": "10.17632/t46kkgh2yw.1",
        "archive_sha256": "eb1e804ae414250d7a333a1c3820c49a520c2f09e2e6a38f280e90f58a4f62fb",
    },
}


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
            crop = str(config["crop"])
            exemplar = min(items, key=lambda item: str(item["relative_path"]))
            path = RAW_ROOT / source / str(exemplar["relative_path"])
            with Image.open(path) as image:
                phash = str(imagehash.phash(ImageOps.exif_transpose(image).convert("RGB")))
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
                    "capture_group": f"{source}:{digest}",
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


def v2_embedding_lookup(base_rows: list[dict[str, Any]]) -> dict[str, np.ndarray]:
    v1_rows = load_jsonl(ROOT / "manifest_v1.jsonl")
    v1_paths = [RAW_ROOT / row["source_dataset"] / row["original_path"] for row in v1_rows]
    _, digigreen_paths = build_digigreen_rows()
    cached_paths = v1_paths + digigreen_paths
    cache_meta = json.loads(
        (CACHE_ROOT / "baseline_mobilenetv2_embeddings_v2.json").read_text(encoding="utf-8")
    )
    fingerprint = hashlib.sha256(
        "\n".join(str(path) for path in cached_paths).encode()
    ).hexdigest()
    embeddings = np.load(CACHE_ROOT / "baseline_mobilenetv2_embeddings_v2.npy")
    if fingerprint != cache_meta["path_fingerprint"] or len(embeddings) != len(cached_paths):
        raise RuntimeError("cannot align verified v2 embedding cache")
    lookup = {str(path): embeddings[index] for index, path in enumerate(cached_paths)}
    missing = [
        row["id"]
        for row in base_rows
        if str(RAW_ROOT / row["source_dataset"] / row["original_path"]) not in lookup
    ]
    if missing:
        raise RuntimeError(f"v2 embedding lookup missing {len(missing)} rows")
    return lookup


def compute_incremental_embeddings(
    base_rows: list[dict[str, Any]], base_paths: list[Path], new_paths: list[Path]
) -> np.ndarray:
    all_paths = base_paths + new_paths
    fingerprint = hashlib.sha256("\n".join(str(path) for path in all_paths).encode()).hexdigest()
    cache = CACHE_ROOT / "baseline_mobilenetv2_embeddings_v3.npy"
    cache_meta = CACHE_ROOT / "baseline_mobilenetv2_embeddings_v3.json"
    if cache.exists() and cache_meta.exists():
        meta = json.loads(cache_meta.read_text(encoding="utf-8"))
        if meta.get("path_fingerprint") == fingerprint:
            return np.load(cache)
    lookup = v2_embedding_lookup(base_rows)
    reordered_base = np.stack([lookup[str(path)] for path in base_paths])
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
        for images in tqdm(loader, desc=f"v3 new embeddings ({device.type})"):
            features = feature_model(images.to(device, non_blocking=True))
            output.append(
                torch.nn.functional.normalize(features, dim=1)
                .cpu()
                .numpy()
                .astype(np.float16)
            )
    combined = np.concatenate([reordered_base, np.concatenate(output)])
    np.save(cache, combined)
    cache_meta.write_text(
        json.dumps({"path_fingerprint": fingerprint, "rows": len(combined)}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    return combined


def assign_splits(
    base_rows: list[dict[str, Any]], new_rows: list[dict[str, Any]], duplicate_union: UnionFind
) -> tuple[list[dict[str, Any]], Counter[str]]:
    # Reuse the verified test-link and ambiguous-bridge policy, then replace the
    # newly generated group prefix so it cannot collide with v2 groups.
    accepted, excluded = assign_v2_splits(base_rows, new_rows, duplicate_union)
    replacements: dict[str, str] = {}
    for row in accepted:
        group = str(row["split_group"])
        if group.startswith("v2-split-"):
            row["split_group"] = replacements.setdefault(
                group, f"v3-split-{len(replacements):06d}"
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
        for row in randomizer.sample(values, min(5, len(values))):
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
    embeddings = compute_incremental_embeddings(base_rows, base_paths, new_paths)
    phash_ids, phash_union = perceptual_clusters(rows, embeddings)
    embedding_union = incremental_embedding_clusters(embeddings, rows, len(base_rows))
    embedding_ids = cluster_ids(embedding_union, "v3-embed")
    duplicate_union = merge_clusters(phash_union, embedding_union)
    near_ids = cluster_ids(duplicate_union, "v3-near")
    for offset, row in enumerate(new_rows, start=len(base_rows)):
        row["perceptual_cluster"] = phash_ids[offset]
        row["embedding_cluster"] = embedding_ids[offset]
        row["near_duplicate_cluster"] = near_ids[offset]
    accepted, split_excluded = assign_splits(base_rows, new_rows, duplicate_union)
    excluded = pre_excluded + split_excluded
    combined = sorted(base_rows + accepted, key=lambda item: item["id"])
    OUTPUT.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in combined),
        encoding="utf-8",
    )
    qa = build_qa(accepted)
    QA_SAMPLE.write_text(json.dumps(qa, indent=2) + "\n", encoding="utf-8")
    base_test_ids = sorted(row["id"] for row in base_rows if row["split"] == "test")
    v3_test_ids = sorted(row["id"] for row in combined if row["split"] == "test")
    if base_test_ids != v3_test_ids:
        raise RuntimeError("manifest v3 changed the frozen test IDs")
    counts = Counter((row["model_class"], row["split"]) for row in combined)
    added_counts = Counter((row["source_dataset"], row["model_class"], row["split"]) for row in accepted)
    summary = {
        "version": "manifest-summary-v3",
        "base_manifest_sha256": sha256_file(BASE_MANIFEST),
        "manifest_sha256": sha256_file(OUTPUT),
        "rows": len(combined),
        "candidate_new_unique_images": len(new_rows),
        "accepted_new_images": len(accepted),
        "excluded_new_images": dict(sorted(excluded.items())),
        "frozen_test_rows": len(v3_test_ids),
        "frozen_test_ids_sha256": hashlib.sha256("\n".join(v3_test_ids).encode()).hexdigest(),
        "counts_by_split": dict(sorted(Counter(row["split"] for row in combined).items())),
        "counts_by_model_class_and_split": {
            f"{key[0]}:{key[1]}": value for key, value in sorted(counts.items())
        },
        "added_counts": {
            f"{key[0]}:{key[1]}:{key[2]}": value for key, value in sorted(added_counts.items())
        },
        "qa_sample_rows": len(qa),
        "deduplication": {
            "exact_sha256_plus_phash_embedding_review": True,
            "phash_hamming_threshold": 5,
            "phash_confirmation_embedding_cosine_threshold": 0.9999,
            "embedding_candidate_cosine_threshold": 0.99999,
            "embedding_confirmation_phash_hamming_threshold": 10,
            "new_rows_matching_frozen_test_are_excluded": True,
        },
        "is_production_validated": False,
    }
    SUMMARY.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
