#!/usr/bin/env python3
"""Build the canonical per-image manifest and leakage-safe grouped splits."""

from __future__ import annotations

import csv
import hashlib
import json
import os
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import imagehash
import numpy as np
import torch
from PIL import Image, ImageOps
from torch import nn
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms
from tqdm import tqdm


RESEARCH_ROOT = Path(__file__).resolve().parents[1]
AI_ROOT = RESEARCH_ROOT.parent
RAW_ROOT = RESEARCH_ROOT / "data" / "raw"
CACHE_ROOT = RESEARCH_ROOT / "data" / "cache"
CONFIG_ROOT = RESEARCH_ROOT / "config"
OUTPUT = RESEARCH_ROOT / "manifest_v1.jsonl"
SUMMARY = RESEARCH_ROOT / "manifest_summary_v1.json"
QA_SAMPLE = RESEARCH_ROOT / "qa_sample_v1.json"
QA_DECISIONS = RESEARCH_ROOT / "qa_decisions_v1.json"
LOCK = RESEARCH_ROOT / "download_lock_v1.json"
SEED = 26007
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
FIXED_TEST_SOURCES = {
    "maize_mld_ccby",
    "potato_field_ccby",
    "rice_field_ccby",
    "plantdoc_ccby",
}
GROUPED_TEST_SOURCES = {"paddy_doctor_cc0", "wheat_iari_cc0"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(long_path(path), "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def long_path(path: Path) -> str:
    resolved = str(path.resolve())
    return f"\\\\?\\{resolved}" if os.name == "nt" else resolved


def normalized(value: str) -> str:
    value = value.lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "_", value).strip("_")


def disease_name(label: str) -> str:
    token = normalized(label)
    replacements = {
        "healthy": "healthy",
        "normal": "healthy",
        "control": "healthy",
        "gray_spot": "gray_leaf_spot",
        "maize_leaf_blight": "blight",
        "leaf_blight": "blight",
        "fungal_late_blight": "late_blight",
        "fungi": "other_disease",
        "nematode": "other_disease",
        "diseased": "leaf_rust",
        "corn_rust_leaf": "common_rust",
        "corn_gray_leaf_spot": "gray_leaf_spot",
        "corn_leaf_blight": "blight",
        "potato_leaf_early_blight": "early_blight",
        "potato_leaf_late_blight": "late_blight",
        "brownspot": "brown_spot",
        "bacterialblight": "bacterial_leaf_blight",
        "leaf_blast": "blast",
    }
    return replacements.get(token, token)


def numeric_bucket(path: Path, size: int = 5) -> str:
    digits = re.findall(r"\d+", path.stem)
    if not digits:
        return hashlib.sha256(path.stem.encode("utf-8")).hexdigest()[:10]
    return str(int(digits[-1]) // size)


def row_for_image(source: str, path: Path, paddy_meta: dict[str, dict[str, str]]) -> dict[str, Any] | None:
    relative = path.relative_to(RAW_ROOT / source).as_posix()
    parts = path.relative_to(RAW_ROOT / source).parts
    label = path.parent.name
    crop = "invalid"
    health = "invalid"
    disease = "unsupported_or_ood"
    split_hint = "train"
    invalid_category: str | None = None

    if source == "multicrop_ccby":
        if len(parts) < 4:
            return None
        crop_folder = normalized(parts[-3])
        crop = {"corn": "maize", "rice": "paddy", "potato": "potato"}.get(
            crop_folder, "invalid"
        )
        if crop == "invalid":
            invalid_category = "unsupported_crop"
        else:
            disease = disease_name(label)
            health = "healthy" if "healthy" in normalized(label) else "disease"
    elif source == "paddy_doctor_cc0":
        if "train_images" not in {part.lower() for part in parts}:
            return None
        crop = "paddy"
        disease = disease_name(label)
        if disease == "healthy":
            health = "healthy"
        elif disease in {"hispa", "dead_heart"}:
            crop = "invalid"
            health = "invalid"
            invalid_category = "unsupported_condition"
        else:
            health = "disease"
    elif source == "wheat_iari_cc0":
        crop = "wheat"
        disease = disease_name(label)
        health = "healthy" if disease == "healthy" else "disease"
        lower_parts = {part.lower() for part in parts}
        split_hint = "test" if "test" in lower_parts else "validation" if "val" in lower_parts else "train"
    elif source == "maize_mld_ccby":
        split_hint = "test"
        if normalized(label) == "fall_armyworm":
            crop = "invalid"
            health = "invalid"
            disease = "fall_armyworm"
            invalid_category = "unsupported_condition"
        else:
            crop = "maize"
            disease = disease_name(label)
            health = "healthy" if disease == "healthy" else "disease"
    elif source == "potato_field_ccby":
        if not path.name.lower().startswith("orig_"):
            return None
        crop = "potato"
        disease = disease_name(label)
        health = "healthy" if disease == "healthy" else "disease"
        split_hint = "test"
    elif source == "rice_field_ccby":
        crop = "paddy"
        disease = disease_name(label)
        health = "disease"
        split_hint = "test"
    elif source == "plantdoc_ccby":
        token = normalized(label)
        split_hint = "test"
        if token.startswith("corn_"):
            crop = "maize"
            health = "healthy" if token in {"corn_leaf", "corn_healthy"} else "disease"
            disease = "healthy" if health == "healthy" else disease_name(label)
        elif token.startswith("potato_"):
            crop = "potato"
            health = "healthy" if token in {"potato_leaf", "potato_healthy"} else "disease"
            disease = "healthy" if health == "healthy" else disease_name(label)
        else:
            crop = "invalid"
            health = "invalid"
            disease = "unsupported_crop"
            invalid_category = "unsupported_crop"
    else:
        return None

    model_class = "invalid__ood" if health == "invalid" else f"{crop}__{health}"
    metadata = paddy_meta.get(path.name, {})
    capture_bits = [source, normalized(label)]
    if metadata:
        capture_bits.extend([metadata.get("variety", "unknown"), metadata.get("age", "unknown")])
    capture_bits.append(numeric_bucket(path))
    return {
        "id": hashlib.sha256(f"{source}:{relative}".encode("utf-8")).hexdigest()[:24],
        "source_dataset": source,
        "original_path": relative,
        "original_label": label,
        "canonical_crop": crop,
        "canonical_disease": disease,
        "health_state": health,
        "model_class": model_class,
        "invalid_category": invalid_category,
        "capture_group": ":".join(capture_bits),
        "split_hint": split_hint,
        "synthetic": False,
    }


def load_paddy_metadata() -> dict[str, dict[str, str]]:
    candidates = list((RAW_ROOT / "paddy_doctor_cc0").rglob("train.csv"))
    if not candidates:
        return {}
    with candidates[0].open(encoding="utf-8", newline="") as handle:
        return {row["image_id"]: row for row in csv.DictReader(handle)}


class UnionFind:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))

    def find(self, value: int) -> int:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left: int, right: int) -> None:
        a, b = self.find(left), self.find(right)
        if a != b:
            self.parent[max(a, b)] = min(a, b)


def cluster_ids(union: UnionFind, prefix: str) -> list[str]:
    roots: dict[int, str] = {}
    output: list[str] = []
    for index in range(len(union.parent)):
        root = union.find(index)
        roots.setdefault(root, f"{prefix}-{len(roots):06d}")
        output.append(roots[root])
    return output


def add_hash_and_phash(rows: list[dict[str, Any]], paths: list[Path]) -> None:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    cache = CACHE_ROOT / "hash_phash_v1.json"
    fingerprint = hashlib.sha256(
        "\n".join(row["id"] for row in rows).encode("utf-8")
    ).hexdigest()
    cached_rows: dict[str, dict[str, Any]] = {}
    if cache.exists():
        payload = json.loads(cache.read_text(encoding="utf-8"))
        if payload.get("fingerprint") == fingerprint:
            cached_rows = payload.get("rows", {})
    elif OUTPUT.exists():
        # A completed manifest is a safe seed because every source archive is
        # already pinned and verified by download_lock_v1.json.
        cached_rows = {
            item["id"]: item
            for item in (
                json.loads(line)
                for line in OUTPUT.read_text(encoding="utf-8").splitlines()
                if line
            )
        }
    if len(cached_rows) == len(rows) and all(row["id"] in cached_rows for row in rows):
        for row in rows:
            cached = cached_rows[row["id"]]
            for field in ("image_sha256", "phash", "width", "height"):
                row[field] = cached[field]
        cache.write_text(
            json.dumps(
                {
                    "fingerprint": fingerprint,
                    "provenance": "verified source archives and prior complete manifest",
                    "rows": {
                        row["id"]: {
                            field: row[field]
                            for field in ("image_sha256", "phash", "width", "height")
                        }
                        for row in rows
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        return
    for row, path in tqdm(zip(rows, paths, strict=True), total=len(rows), desc="hash/phash"):
        row["image_sha256"] = sha256_file(path)
        with Image.open(long_path(path)) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            row["width"], row["height"] = image.size
            row["phash"] = str(imagehash.phash(image))
    cache.write_text(
        json.dumps(
            {
                "fingerprint": fingerprint,
                "provenance": "computed from verified source archives",
                "rows": {
                    row["id"]: {
                        field: row[field]
                        for field in ("image_sha256", "phash", "width", "height")
                    }
                    for row in rows
                },
            }
        )
        + "\n",
        encoding="utf-8",
    )


def perceptual_clusters(
    rows: list[dict[str, Any]], embeddings: np.ndarray
) -> tuple[list[str], UnionFind]:
    union = UnionFind(len(rows))
    exact: dict[str, int] = {}
    bands: dict[tuple[int, str], list[int]] = defaultdict(list)
    hashes = [imagehash.hex_to_hash(row["phash"]) for row in rows]
    for index, row in enumerate(rows):
        digest = row["image_sha256"]
        if digest in exact:
            union.union(index, exact[digest])
        else:
            exact[digest] = index
        token = row["phash"]
        candidates: set[int] = set()
        for band in range(4):
            key = (band, token[band * 4 : (band + 1) * 4])
            candidates.update(bands[key])
        # Compare with a component representative, not merely an arbitrary
        # member. This prevents long transitive pHash chains from collapsing a
        # whole capture session into one false duplicate component.
        candidate_roots = sorted({union.find(other) for other in candidates})
        for root in candidate_roots:
            if (
                hashes[index] - hashes[root] <= 5
                and float(embeddings[index].astype(np.float32) @ embeddings[root].astype(np.float32))
                >= 0.9999
            ):
                union.union(index, root)
                break
        for band in range(4):
            bands[(band, token[band * 4 : (band + 1) * 4])].append(index)
    return cluster_ids(union, "phash"), union


class ImageRows(Dataset):
    def __init__(self, paths: list[Path], transform: Any) -> None:
        self.paths = paths
        self.transform = transform

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, index: int) -> torch.Tensor:
        with Image.open(long_path(self.paths[index])) as image:
            return self.transform(ImageOps.exif_transpose(image).convert("RGB"))


def compute_embeddings(paths: list[Path]) -> np.ndarray:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    cache = CACHE_ROOT / "baseline_mobilenetv2_embeddings.npy"
    cache_meta = CACHE_ROOT / "baseline_mobilenetv2_embeddings.json"
    path_fingerprint = hashlib.sha256(
        "\n".join(str(path) for path in paths).encode("utf-8")
    ).hexdigest()
    if cache.exists() and cache_meta.exists():
        meta = json.loads(cache_meta.read_text(encoding="utf-8"))
        if meta.get("path_fingerprint") == path_fingerprint:
            return np.load(cache)

    checkpoint = torch.load(
        AI_ROOT / "models" / "plant_disease" / "checkpoint.pt",
        map_location="cpu",
        weights_only=False,
    )
    model = models.mobilenet_v2(weights=None)
    model.classifier[1] = nn.Linear(model.last_channel, len(checkpoint["classes"]))
    model.load_state_dict(checkpoint["model_state_dict"])
    feature_model = nn.Sequential(model.features, nn.AdaptiveAvgPool2d(1), nn.Flatten())
    feature_model.eval()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    feature_model.to(device)
    transform = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(checkpoint["normalize_mean"], checkpoint["normalize_std"]),
        ]
    )
    loader = DataLoader(
        ImageRows(paths, transform),
        batch_size=96 if device.type == "cuda" else 24,
        shuffle=False,
        num_workers=0,
        pin_memory=device.type == "cuda",
    )
    output: list[np.ndarray] = []
    with torch.inference_mode():
        for images in tqdm(loader, desc=f"embeddings ({device.type})"):
            features = feature_model(images.to(device, non_blocking=True))
            features = torch.nn.functional.normalize(features, dim=1)
            output.append(features.cpu().numpy().astype(np.float16))
    embeddings = np.concatenate(output)
    np.save(cache, embeddings)
    cache_meta.write_text(
        json.dumps(
            {
                "path_fingerprint": path_fingerprint,
                "model": "in_repo_mobilenet_v2_baseline_features",
                "checkpoint_sha256": sha256_file(
                    AI_ROOT / "models" / "plant_disease" / "checkpoint.pt"
                ),
                "rows": len(paths),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return embeddings


def embedding_clusters(
    embeddings: np.ndarray, rows: list[dict[str, Any]]
) -> tuple[list[str], UnionFind]:
    """Find only visually confirmed near duplicates.

    The legacy MobileNet features are useful for candidate retrieval but are not
    discriminative enough to merge on cosine similarity alone (wheat images in
    particular occupy a very tight feature region).  A high cosine score and a
    relaxed pHash confirmation are therefore both required.  Exact/pHash<=5
    matches are handled independently by ``perceptual_clusters``.
    """
    union = UnionFind(len(embeddings))
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    matrix = torch.from_numpy(embeddings.astype(np.float32)).to(device)
    hashes = [imagehash.hex_to_hash(row["phash"]) for row in rows]
    with torch.inference_mode():
        for start in tqdm(range(0, len(matrix), 256), desc="embedding clusters"):
            scores = matrix[start : start + 256] @ matrix.T
            values, indices = torch.topk(scores, k=min(6, len(matrix)), dim=1)
            for offset, (row_values, row_indices) in enumerate(zip(values, indices, strict=True)):
                current = start + offset
                for score, other in zip(row_values.tolist(), row_indices.tolist(), strict=True):
                    if (
                        other != current
                        and score >= 0.99999
                        and hashes[current] - hashes[other] <= 10
                    ):
                        union.union(current, other)
    return cluster_ids(union, "embed"), union


def merge_clusters(*unions: UnionFind) -> UnionFind:
    merged = UnionFind(len(unions[0].parent))
    for union in unions:
        groups: dict[int, int] = {}
        for index in range(len(union.parent)):
            root = union.find(index)
            if root in groups:
                merged.union(index, groups[root])
            else:
                groups[root] = index
    return merged


def merge_capture_groups(rows: list[dict[str, Any]], duplicate_union: UnionFind) -> UnionFind:
    """Connect duplicate clusters and all images from the same capture group."""
    leakage_union = merge_clusters(duplicate_union)
    first_by_capture: dict[str, int] = {}
    for index, row in enumerate(rows):
        key = row["capture_group"]
        if key in first_by_capture:
            leakage_union.union(index, first_by_capture[key])
        else:
            first_by_capture[key] = index
    return leakage_union


def assign_splits(rows: list[dict[str, Any]], leakage_union: UnionFind) -> None:
    groups: dict[int, list[int]] = defaultdict(list)
    for index in range(len(rows)):
        groups[leakage_union.find(index)].append(index)
    for indices in groups.values():
        sources = {rows[index]["source_dataset"] for index in indices}
        group_key = min(rows[index]["capture_group"] for index in indices)
        fraction = (
            int(hashlib.sha256(group_key.encode("utf-8")).hexdigest()[:8], 16)
            / 0xFFFFFFFF
        )
        if any(
            rows[index]["source_dataset"] in FIXED_TEST_SOURCES
            for index in indices
        ):
            split = "test"
        elif sources.intersection(GROUPED_TEST_SOURCES):
            split = (
                "test"
                if fraction < 0.15
                else "validation"
                if fraction < 0.30
                else "train"
            )
        elif any(rows[index]["split_hint"] == "validation" for index in indices):
            split = "validation"
        else:
            split = "validation" if fraction < 0.15 else "train"
        for index in indices:
            rows[index]["split"] = split
            rows[index]["split_group"] = f"split-{leakage_union.find(index):06d}"


def build_qa_sample(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    randomizer = random.Random(SEED)
    by_label: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_label[(row["source_dataset"], row["original_label"])].append(row)
    sample: list[dict[str, Any]] = []
    for key in sorted(by_label):
        values = sorted(by_label[key], key=lambda row: row["id"])
        chosen = randomizer.sample(values, min(5, len(values)))
        for row in chosen:
            sample.append(
                {
                    "id": row["id"],
                    "source_dataset": row["source_dataset"],
                    "original_path": row["original_path"],
                    "original_label": row["original_label"],
                    "canonical_crop": row["canonical_crop"],
                    "health_state": row["health_state"],
                    "qa_status": "pending_manual_review",
                    "qa_notes": "",
                }
            )
    if QA_DECISIONS.exists():
        payload = json.loads(QA_DECISIONS.read_text(encoding="utf-8"))
        ids_sha256 = hashlib.sha256(
            "\n".join(item["id"] for item in sample).encode("utf-8")
        ).hexdigest()
        if ids_sha256 != payload.get("reviewed_sample_ids_sha256"):
            raise RuntimeError(
                "QA decisions do not match the deterministic QA sample; manual review must be repeated"
            )
        decisions = payload.get("decisions", {})
        for item in sample:
            decision = decisions.get(item["id"])
            item["qa_status"] = (
                decision["status"] if decision else payload["default_status"]
            )
            item["qa_notes"] = decision.get("notes", "") if decision else ""
            item["qa_reviewer"] = payload.get("reviewer")
            item["qa_reviewed_at"] = payload.get("reviewed_at")
    return sample


def apply_qa_overrides(rows: list[dict[str, Any]]) -> int:
    if not QA_DECISIONS.exists():
        return 0
    payload = json.loads(QA_DECISIONS.read_text(encoding="utf-8"))
    by_id = {row["id"]: row for row in rows}
    changed = 0
    for image_id, decision in payload.get("decisions", {}).items():
        override = decision.get("override")
        if not override:
            continue
        if image_id not in by_id:
            raise RuntimeError(f"QA override references missing manifest row: {image_id}")
        by_id[image_id].update(override)
        changed += 1
    return changed


def main() -> None:
    if not LOCK.exists():
        raise SystemExit("Missing download lock; run download_sources.py first")
    sources_config = json.loads((CONFIG_ROOT / "sources_v1.json").read_text(encoding="utf-8"))
    source_meta = {source["id"]: source for source in sources_config["sources"]}
    lock = json.loads(LOCK.read_text(encoding="utf-8"))
    lock_meta = {source["id"]: source for source in lock["sources"]}
    paddy_meta = load_paddy_metadata()
    rows: list[dict[str, Any]] = []
    paths: list[Path] = []
    excluded = Counter()

    for source_dir in sorted(path for path in RAW_ROOT.iterdir() if path.is_dir()):
        source = source_dir.name
        if source not in source_meta:
            continue
        for path in sorted(source_dir.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            row = row_for_image(source, path, paddy_meta)
            if row is None:
                if source == "potato_field_ccby" and path.name.lower().startswith("aug_"):
                    excluded["synthetic_potato_augmentation"] += 1
                elif source == "paddy_doctor_cc0" and "test_images" in path.parts:
                    excluded["unlabelled_paddy_competition_test"] += 1
                else:
                    excluded[f"unmapped:{source}"] += 1
                continue
            meta = source_meta[source]
            row.update(
                {
                    "source_url": meta["source_url"],
                    "license": meta["license"],
                    "source_revision": meta.get("pinned_revision") or meta.get("doi") or "version-1",
                    "archive_sha256": lock_meta[source]["sha256"],
                }
            )
            rows.append(row)
            paths.append(path)

    corrected = apply_qa_overrides(rows)
    if corrected:
        excluded["qa_corrected_to_invalid"] += corrected
    add_hash_and_phash(rows, paths)
    embeddings = compute_embeddings(paths)
    phash_ids, phash_union = perceptual_clusters(rows, embeddings)
    embedding_ids, embedding_union = embedding_clusters(embeddings, rows)
    duplicate_union = merge_clusters(phash_union, embedding_union)
    leakage_union = merge_capture_groups(rows, duplicate_union)
    duplicate_ids = cluster_ids(duplicate_union, "near")
    for index, row in enumerate(rows):
        row["perceptual_cluster"] = phash_ids[index]
        row["embedding_cluster"] = embedding_ids[index]
        row["near_duplicate_cluster"] = duplicate_ids[index]
    assign_splits(rows, leakage_union)
    for row in rows:
        row.pop("split_hint", None)

    with OUTPUT.open("w", encoding="utf-8", newline="\n") as handle:
        for row in sorted(rows, key=lambda value: value["id"]):
            handle.write(json.dumps(row, sort_keys=True) + "\n")

    qa_sample = build_qa_sample(rows)
    QA_SAMPLE.write_text(json.dumps(qa_sample, indent=2) + "\n", encoding="utf-8")
    counts = {
        "by_split": Counter(row["split"] for row in rows),
        "by_model_class_and_split": Counter((row["model_class"], row["split"]) for row in rows),
        "by_source": Counter(row["source_dataset"] for row in rows),
    }
    summary = {
        "version": "manifest-summary-v1",
        "seed": SEED,
        "manifest_sha256": sha256_file(OUTPUT),
        "rows": len(rows),
        "counts": {
            "by_split": dict(sorted(counts["by_split"].items())),
            "by_model_class_and_split": {
                f"{key[0]}:{key[1]}": value
                for key, value in sorted(counts["by_model_class_and_split"].items())
            },
            "by_source": dict(sorted(counts["by_source"].items())),
            "excluded": dict(sorted(excluded.items())),
        },
        "deduplication": {
            "sha256_unique": len({row["image_sha256"] for row in rows}),
            "perceptual_clusters": len(set(phash_ids)),
            "embedding_clusters": len(set(embedding_ids)),
            "near_duplicate_clusters": len(set(duplicate_ids)),
            "phash_hamming_threshold": 5,
            "phash_confirmation_embedding_cosine_threshold": 0.9999,
            "embedding_candidate_cosine_threshold": 0.99999,
            "embedding_confirmation_phash_hamming_threshold": 10,
            "embedding_model": "in_repo_mobilenet_v2_baseline_features",
            "leakage_split_groups": len({leakage_union.find(i) for i in range(len(rows))}),
            "capture_group_rule": "indivisible and merged with all duplicate evidence",
        },
        "qa_sample_rows": len(qa_sample),
        "is_production_validated": False,
    }
    SUMMARY.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
