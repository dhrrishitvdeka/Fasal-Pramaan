#!/usr/bin/env python3
"""Append licensed paddy, potato, and real-field OOD originals to manifest v5."""

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
from build_manifest_v5 import build_source_rows as build_v5_source_rows


ROOT = Path(__file__).resolve().parents[1]
BASE_MANIFEST = ROOT / "manifest_v5.jsonl"
OUTPUT = ROOT / "manifest_v6.jsonl"
SUMMARY = ROOT / "manifest_summary_v6.json"
QA_SAMPLE = ROOT / "qa_sample_v6.json"
SEED = 26017
SOURCE_CONFIGS: dict[str, dict[str, Any]] = {
    "riceleafbd_ccby": {
        "crop": "paddy",
        "source_url": "https://data.mendeley.com/datasets/kx9rx8p2mz/1",
        "source_revision": "10.17632/kx9rx8p2mz.1",
        "archive_sha256": "3280cc176c2ee9f6ee4386e5728623fc7e8f9204b31c50f4ebb303edc52d9c83",
    },
    "rice_field_weeds_ccby": {
        "crop": "invalid",
        "source_url": "https://data.mendeley.com/datasets/mt72bmxz73/3",
        "source_revision": "10.17632/mt72bmxz73.3",
        "archive_sha256": "9b3f766c2893b6059515cf309fd4b4822132805c64571942b274d971dc0d1914",
    },
    "potato_blight_sample_ccby": {
        "crop": "potato",
        "source_url": "https://data.mendeley.com/datasets/pbnw43s6kt/1",
        "source_revision": "10.17632/pbnw43s6kt.1",
        "archive_sha256": "88cd82644a839cb708cf3ea3b1c21da24ff442061883ac5001701ee1c807bcf0",
    },
}


def capture_group(source: str, label: str, original_path: str) -> str:
    """Keep filename variants and adjacent field-camera sequences indivisible."""
    name = Path(original_path).stem.lower()
    if source == "rice_field_weeds_ccby":
        match = re.search(r"(\d+)_(\d{8})_(\d+)", name)
        key = (
            f"camera-{match.group(1)}-date-{match.group(2)}-bucket-{int(match.group(3)) // 50:04d}"
            if match
            else re.sub(r"[^a-z0-9]+", "-", name)[:48]
        )
    elif source == "potato_blight_sample_ccby":
        match = re.search(r"\((\d+)\)", name)
        key = (
            f"sequence-{int(match.group(1)) // 50:04d}"
            if match
            else re.sub(r"[^a-z0-9]+", "-", name)[:48]
        )
    else:
        # RiceLeafBD contains repeated "(1)/(2)" exports of the same phone image.
        key = re.sub(r"\s*\(\d+\)$", "", name)
        key = re.sub(r"[^a-z0-9]+", "-", key)[:64]
    return f"{source}:{normalized(label)}:{key}"


def build_source_rows() -> tuple[list[dict[str, Any]], list[Path], Counter[str]]:
    rows: list[dict[str, Any]] = []
    paths: list[Path] = []
    excluded: Counter[str] = Counter()
    for source, config in SOURCE_CONFIGS.items():
        metadata = load_jsonl(RAW_ROOT / source / "metadata.jsonl")
        by_sha: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for item in metadata:
            by_sha[str(item["image_sha256"])].append(item)
        for digest, items in sorted(by_sha.items()):
            health_values = {str(item["health_state"]) for item in items}
            if len(health_values) != 1:
                excluded[f"{source}:conflicting_duplicate_health_labels"] += 1
                continue
            health = next(iter(health_values))
            labels = sorted({str(item["label"]).strip() for item in items})
            exemplar = min(items, key=lambda item: str(item["relative_path"]))
            cached_path = ROOT / str(exemplar["cached_relative_path"])
            with Image.open(cached_path) as image:
                phash = str(
                    imagehash.phash(ImageOps.exif_transpose(image).convert("RGB"))
                )
            crop = str(config["crop"])
            if crop == "invalid":
                model_class = "invalid__ood"
                canonical_disease = "rice_field_weed"
                invalid_category = "unsupported_rice_field_weed"
            else:
                model_class = f"{crop}__{health}"
                canonical_disease = (
                    "healthy" if health == "healthy" else normalized("; ".join(labels))
                )
                invalid_category = None
            rows.append(
                {
                    "id": hashlib.sha256(f"{source}:{digest}".encode()).hexdigest()[:24],
                    "source_dataset": source,
                    "original_path": str(exemplar["relative_path"]),
                    "cached_relative_path": str(exemplar["cached_relative_path"]),
                    "cached_image_sha256": str(exemplar["cached_image_sha256"]),
                    "cached_max_dimension": int(exemplar["cached_max_dimension"]),
                    "original_label": "; ".join(labels),
                    "canonical_crop": crop,
                    "canonical_disease": canonical_disease,
                    "health_state": health,
                    "model_class": model_class,
                    "invalid_category": invalid_category,
                    "capture_group": capture_group(
                        source, labels[0], str(exemplar["original_path"])
                    ),
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
            paths.append(cached_path)
    return rows, paths, excluded


def v5_embedding_lookup() -> dict[str, np.ndarray]:
    v4_rows = load_jsonl(ROOT / "manifest_v4.jsonl")
    v4_paths = [
        RAW_ROOT / row["source_dataset"] / row["original_path"] for row in v4_rows
    ]
    v5_rows, v5_paths, excluded = build_v5_source_rows()
    if excluded != Counter({"conflicting_duplicate_health_labels": 5}):
        raise RuntimeError(f"unexpected v5 source-row exclusions: {dict(excluded)}")
    cached_paths = v4_paths + v5_paths
    cache_meta = json.loads(
        (CACHE_ROOT / "baseline_mobilenetv2_embeddings_v5.json").read_text(
            encoding="utf-8"
        )
    )
    fingerprint = hashlib.sha256(
        "\n".join(str(path) for path in cached_paths).encode()
    ).hexdigest()
    embeddings = np.load(CACHE_ROOT / "baseline_mobilenetv2_embeddings_v5.npy")
    if fingerprint != cache_meta["path_fingerprint"] or len(embeddings) != len(
        cached_paths
    ):
        raise RuntimeError("cannot align verified v5 embedding cache")
    row_order = v4_rows + v5_rows
    if len({row["id"] for row in row_order}) != len(row_order):
        raise RuntimeError("duplicate row IDs in reconstructed v5 embedding order")
    return {
        str(row["id"]): embeddings[index] for index, row in enumerate(row_order)
    }


def compute_incremental_embeddings(
    base_rows: list[dict[str, Any]], new_paths: list[Path]
) -> np.ndarray:
    fingerprint = hashlib.sha256(
        (
            "\n".join(str(row["id"]) for row in base_rows)
            + "\n--new-paths--\n"
            + "\n".join(str(path) for path in new_paths)
        ).encode()
    ).hexdigest()
    cache = CACHE_ROOT / "baseline_mobilenetv2_embeddings_v6.npy"
    cache_meta = CACHE_ROOT / "baseline_mobilenetv2_embeddings_v6.json"
    if cache.exists() and cache_meta.exists():
        meta = json.loads(cache_meta.read_text(encoding="utf-8"))
        if meta.get("row_and_path_fingerprint") == fingerprint:
            return np.load(cache)

    lookup = v5_embedding_lookup()
    missing = [str(row["id"]) for row in base_rows if str(row["id"]) not in lookup]
    if missing:
        raise RuntimeError(f"v5 embedding lookup missing {len(missing)} manifest rows")
    base_embeddings = np.stack([lookup[str(row["id"])] for row in base_rows])
    checkpoint = torch.load(
        AI_ROOT / "models" / "plant_disease" / "checkpoint.pt",
        map_location="cpu",
        weights_only=False,
    )
    model = models.mobilenet_v2(weights=None)
    model.classifier[1] = nn.Linear(model.last_channel, len(checkpoint["classes"]))
    model.load_state_dict(checkpoint["model_state_dict"])
    feature_model = nn.Sequential(
        model.features, nn.AdaptiveAvgPool2d(1), nn.Flatten()
    )
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    feature_model.to(device).eval()
    transform = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                checkpoint["normalize_mean"], checkpoint["normalize_std"]
            ),
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
        for images in tqdm(loader, desc=f"v6 new embeddings ({device.type})"):
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
        json.dumps(
            {"row_and_path_fingerprint": fingerprint, "rows": len(combined)},
            indent=2,
        )
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
                group, f"v6-split-{len(replacements):06d}"
            )
    return accepted, excluded


def build_qa(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    randomizer = random.Random(SEED)
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[(str(row["source_dataset"]), str(row["original_label"]))].append(row)
    sample: list[dict[str, Any]] = []
    for (source, _), values in sorted(groups.items()):
        values = sorted(values, key=lambda item: item["id"])
        amount = 2 if source == "rice_field_weeds_ccby" else 8
        for row in randomizer.sample(values, min(amount, len(values))):
            sample.append(
                {
                    "id": row["id"],
                    "source_dataset": source,
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
    new_rows, new_paths, pre_excluded = build_source_rows()
    rows = base_rows + new_rows
    embeddings = compute_incremental_embeddings(base_rows, new_paths)
    phash_ids, phash_union = perceptual_clusters(rows, embeddings)
    embedding_union = incremental_embedding_clusters(embeddings, rows, len(base_rows))
    embedding_ids = cluster_ids(embedding_union, "v6-embed")
    duplicate_union = merge_clusters(phash_union, embedding_union)
    near_ids = cluster_ids(duplicate_union, "v6-near")
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
    test_ids = sorted(row["id"] for row in combined if row["split"] == "test")
    if base_test_ids != test_ids:
        raise RuntimeError("manifest v6 changed the frozen test IDs")
    summary = {
        "version": "manifest-summary-v6",
        "base_manifest_sha256": sha256_file(BASE_MANIFEST),
        "manifest_sha256": sha256_file(OUTPUT),
        "rows": len(combined),
        "candidate_new_unique_images": len(new_rows),
        "accepted_new_images": len(accepted),
        "excluded_new_images": dict(sorted(excluded.items())),
        "frozen_test_rows": len(test_ids),
        "frozen_test_ids_sha256": hashlib.sha256(
            "\n".join(test_ids).encode()
        ).hexdigest(),
        "counts_by_split": dict(
            sorted(Counter(row["split"] for row in combined).items())
        ),
        "counts_by_model_class_and_split": {
            f"{key[0]}:{key[1]}": value
            for key, value in sorted(
                Counter(
                    (row["model_class"], row["split"]) for row in combined
                ).items()
            )
        },
        "added_counts": {
            f"{key[0]}:{key[1]}": value
            for key, value in sorted(
                Counter(
                    (row["model_class"], row["split"]) for row in accepted
                ).items()
            )
        },
        "added_counts_by_source": dict(
            sorted(Counter(row["source_dataset"] for row in accepted).items())
        ),
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
