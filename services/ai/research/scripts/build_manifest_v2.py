#!/usr/bin/env python3
"""Extend manifest v1 with a disjoint Digital Green field source.

The frozen test rows and their splits are immutable. New images that match a
test duplicate component are excluded rather than moved into training.
"""

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


ROOT = Path(__file__).resolve().parents[1]
BASE_MANIFEST = ROOT / "manifest_v1.jsonl"
OUTPUT = ROOT / "manifest_v2.jsonl"
SUMMARY = ROOT / "manifest_summary_v2.json"
QA_SAMPLE = ROOT / "qa_sample_v2.json"
SOURCE = "digigreen_ccby"
SOURCE_ROOT = RAW_ROOT / SOURCE
REVISION = "d47d7eb88b1865062f821edcf58c28d8a7013718"
ANNOTATIONS_SHA256 = "c628b93090847189b432f1a884c1bffdf054be4de5f1b1913028b0548138d3b3"
SOURCE_URL = "https://huggingface.co/datasets/DigiGreen/Crop_Disease_Images"
SUPPORTED = {"maize", "paddy", "potato", "wheat"}
CROP_MAP = {"maize": "maize", "potato": "potato", "wheat": "wheat", "rice": "paddy", "paddy": "paddy"}
SEED = 26007


def normalized(value: str) -> str:
    return "_".join(value.lower().replace("/", " ").replace(";", " ").split())


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def compute_incremental_embeddings(
    base_rows: list[dict[str, Any]], base_paths: list[Path], new_paths: list[Path]
) -> np.ndarray:
    all_paths = base_paths + new_paths
    fingerprint = hashlib.sha256("\n".join(str(path) for path in all_paths).encode()).hexdigest()
    cache = CACHE_ROOT / "baseline_mobilenetv2_embeddings_v2.npy"
    cache_meta = CACHE_ROOT / "baseline_mobilenetv2_embeddings_v2.json"
    if cache.exists() and cache_meta.exists():
        meta = json.loads(cache_meta.read_text(encoding="utf-8"))
        if meta.get("path_fingerprint") == fingerprint:
            return np.load(cache)

    v1_meta = json.loads(
        (CACHE_ROOT / "baseline_mobilenetv2_embeddings.json").read_text(encoding="utf-8")
    )
    v1_embeddings = np.load(CACHE_ROOT / "baseline_mobilenetv2_embeddings.npy")
    path_lookup = {
        (str(row["source_dataset"]), str(row["original_path"])): path
        for row, path in zip(base_rows, base_paths, strict=True)
    }
    original_paths: list[Path] = []
    for source_dir in sorted(path for path in RAW_ROOT.iterdir() if path.is_dir()):
        for path in sorted(source_dir.rglob("*")):
            if not path.is_file():
                continue
            key = (source_dir.name, path.relative_to(source_dir).as_posix())
            if key in path_lookup:
                original_paths.append(path)
    if len(original_paths) != len(base_rows) or len(v1_embeddings) != len(base_rows):
        raise RuntimeError("cannot align the verified v1 embedding cache")
    original_fingerprint = hashlib.sha256(
        "\n".join(str(path) for path in original_paths).encode()
    ).hexdigest()
    if original_fingerprint != v1_meta["path_fingerprint"]:
        raise RuntimeError("v1 embedding path fingerprint mismatch")
    embedding_by_path = {
        str(path): v1_embeddings[index] for index, path in enumerate(original_paths)
    }
    reordered_base = np.stack([embedding_by_path[str(path)] for path in base_paths])

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
    output: list[np.ndarray] = []
    with torch.inference_mode():
        for images in tqdm(loader, desc=f"new embeddings ({device.type})"):
            features = feature_model(images.to(device, non_blocking=True))
            output.append(torch.nn.functional.normalize(features, dim=1).cpu().numpy().astype(np.float16))
    combined = np.concatenate([reordered_base, np.concatenate(output)])
    np.save(cache, combined)
    cache_meta.write_text(
        json.dumps({"path_fingerprint": fingerprint, "rows": len(combined)}, indent=2) + "\n",
        encoding="utf-8",
    )
    return combined


def incremental_embedding_clusters(
    embeddings: np.ndarray, rows: list[dict[str, Any]], base_count: int
) -> UnionFind:
    union = UnionFind(len(rows))
    by_base_cluster: dict[str, int] = {}
    for index, row in enumerate(rows[:base_count]):
        cluster = str(row["embedding_cluster"])
        if cluster in by_base_cluster:
            union.union(index, by_base_cluster[cluster])
        else:
            by_base_cluster[cluster] = index
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    matrix = torch.from_numpy(embeddings.astype(np.float32)).to(device)
    hashes = [imagehash.hex_to_hash(row["phash"]) for row in rows]
    with torch.inference_mode():
        for start in tqdm(range(base_count, len(rows), 256), desc="new embedding candidates"):
            values, indices = torch.topk(
                matrix[start : start + 256] @ matrix.T,
                k=min(8, len(matrix)),
                dim=1,
            )
            for offset, (row_values, row_indices) in enumerate(zip(values, indices, strict=True)):
                current = start + offset
                for score, other in zip(row_values.tolist(), row_indices.tolist(), strict=True):
                    if other != current and score >= 0.99999 and hashes[current] - hashes[other] <= 10:
                        union.union(current, other)
    return union


def build_digigreen_rows() -> tuple[list[dict[str, Any]], list[Path]]:
    metadata = load_jsonl(SOURCE_ROOT / "metadata.jsonl")
    rows: list[dict[str, Any]] = []
    paths: list[Path] = []
    for item in metadata:
        annotations = item.get("annotations") or [
            {"crop": item["crop"], "diagnosis": item["diagnosis"], "details": item["details"]}
        ]
        crops = {CROP_MAP.get(str(value["crop"]).strip().lower(), "invalid") for value in annotations}
        crop = next(iter(crops)) if len(crops) == 1 else "invalid"
        diagnoses = sorted({str(value["diagnosis"]).strip() for value in annotations})
        healthy = all(value.lower() == "healthy" for value in diagnoses)
        if crop in SUPPORTED:
            health = "healthy" if healthy else "disease"
            model_class = f"{crop}__{health}"
            invalid_category = None
            disease = "healthy" if healthy else normalized("; ".join(diagnoses))
        else:
            crop = "invalid"
            health = "invalid"
            model_class = "invalid__ood"
            invalid_category = "unsupported_crop" if len(crops) == 1 else "ambiguous_crop_annotation"
            disease = invalid_category
        path = SOURCE_ROOT / str(item["relative_path"])
        with Image.open(path) as image:
            phash = str(imagehash.phash(ImageOps.exif_transpose(image).convert("RGB")))
        row_id = hashlib.sha256(f"{SOURCE}:{item['id']}".encode("utf-8")).hexdigest()[:24]
        rows.append(
            {
                "id": row_id,
                "source_dataset": SOURCE,
                "original_path": str(item["relative_path"]),
                "original_label": f"{'; '.join(sorted(str(v['crop']) for v in annotations))}___{'; '.join(diagnoses)}",
                "canonical_crop": crop,
                "canonical_disease": disease,
                "health_state": health,
                "model_class": model_class,
                "invalid_category": invalid_category,
                "capture_group": f"{SOURCE}:{item['id']}",
                "synthetic": False,
                "source_url": SOURCE_URL,
                "license": "CC BY 4.0",
                "source_revision": REVISION,
                "archive_sha256": ANNOTATIONS_SHA256,
                "image_sha256": item["image_sha256"],
                "phash": phash,
                "width": item["width"],
                "height": item["height"],
            }
        )
        paths.append(path)
    return rows, paths


def assign_new_splits(
    base_rows: list[dict[str, Any]],
    new_rows: list[dict[str, Any]],
    duplicate_union: Any,
) -> tuple[list[dict[str, Any]], Counter[str]]:
    base_count = len(base_rows)
    members: dict[int, list[int]] = defaultdict(list)
    for index in range(base_count + len(new_rows)):
        members[duplicate_union.find(index)].append(index)
    excluded: Counter[str] = Counter()
    accepted: list[dict[str, Any]] = []
    root_to_new_group: dict[int, str] = {}
    for offset, row in enumerate(new_rows):
        index = base_count + offset
        root = duplicate_union.find(index)
        base_indices = [value for value in members[root] if value < base_count]
        if any(base_rows[value]["split"] == "test" for value in base_indices):
            excluded["near_duplicate_of_frozen_test"] += 1
            continue
        base_clusters = {base_rows[value]["near_duplicate_cluster"] for value in base_indices}
        base_splits = {base_rows[value]["split"] for value in base_indices}
        if len(base_clusters) > 1 or len(base_splits) > 1:
            excluded["ambiguous_bridge_between_base_components"] += 1
            continue
        if base_indices:
            exemplar = base_rows[base_indices[0]]
            row["split"] = exemplar["split"]
            row["split_group"] = exemplar["split_group"]
            row["near_duplicate_cluster"] = exemplar["near_duplicate_cluster"]
            row["perceptual_cluster"] = exemplar["perceptual_cluster"]
            row["embedding_cluster"] = exemplar["embedding_cluster"]
        else:
            group_id = root_to_new_group.setdefault(root, f"v2-split-{len(root_to_new_group):06d}")
            fraction = int(hashlib.sha256(group_id.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
            row["split"] = "validation" if fraction < 0.30 else "train"
            row["split_group"] = group_id
        accepted.append(row)
    return accepted, excluded


def build_qa(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    randomizer = random.Random(SEED)
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        original_crop = row["original_label"].split("___", 1)[0].split(";", 1)[0]
        key = row["model_class"] if row["model_class"] != "invalid__ood" else f"invalid:{original_crop}"
        groups[key].append(row)
    sample: list[dict[str, Any]] = []
    for key in sorted(groups):
        values = sorted(groups[key], key=lambda item: item["id"])
        for row in randomizer.sample(values, min(2 if key.startswith("invalid:") else 8, len(values))):
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
    new_rows, new_paths = build_digigreen_rows()
    rows = base_rows + new_rows
    embeddings = compute_incremental_embeddings(base_rows, base_paths, new_paths)
    phash_ids, phash_union = perceptual_clusters(rows, embeddings)
    embedding_union = incremental_embedding_clusters(embeddings, rows, len(base_rows))
    embedding_ids = cluster_ids(embedding_union, "v2-embed")
    duplicate_union = merge_clusters(phash_union, embedding_union)
    all_near_ids = cluster_ids(duplicate_union, "v2-near")
    for offset, row in enumerate(new_rows, start=len(base_rows)):
        row["perceptual_cluster"] = phash_ids[offset]
        row["embedding_cluster"] = embedding_ids[offset]
        row["near_duplicate_cluster"] = all_near_ids[offset]
    accepted, excluded = assign_new_splits(base_rows, new_rows, duplicate_union)
    combined = sorted(base_rows + accepted, key=lambda item: item["id"])
    OUTPUT.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in combined),
        encoding="utf-8",
    )
    qa = build_qa(accepted)
    QA_SAMPLE.write_text(json.dumps(qa, indent=2) + "\n", encoding="utf-8")
    base_test_ids = sorted(row["id"] for row in base_rows if row["split"] == "test")
    v2_test_ids = sorted(row["id"] for row in combined if row["split"] == "test")
    test_ids_sha256 = hashlib.sha256("\n".join(v2_test_ids).encode()).hexdigest()
    if base_test_ids != v2_test_ids:
        raise RuntimeError("manifest v2 changed the frozen test IDs")
    counts = Counter((row["model_class"], row["split"]) for row in combined)
    summary = {
        "version": "manifest-summary-v2",
        "base_manifest_sha256": sha256_file(BASE_MANIFEST),
        "manifest_sha256": sha256_file(OUTPUT),
        "rows": len(combined),
        "added_source": SOURCE,
        "downloaded_unique_images": len(new_rows),
        "accepted_new_images": len(accepted),
        "excluded_new_images": dict(sorted(excluded.items())),
        "frozen_test_rows": len(v2_test_ids),
        "frozen_test_ids_sha256": test_ids_sha256,
        "counts_by_split": dict(sorted(Counter(row["split"] for row in combined).items())),
        "counts_by_model_class_and_split": {
            f"{key[0]}:{key[1]}": value for key, value in sorted(counts.items())
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
