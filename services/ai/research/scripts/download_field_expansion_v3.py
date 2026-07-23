#!/usr/bin/env python3
"""Materialize and lock the licensed v3 real-field expansion sources."""

from __future__ import annotations

import hashlib
import json
import shutil
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath
from typing import Any

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
CACHE = ROOT / "data" / "resized_512"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
SOURCES: tuple[dict[str, Any], ...] = (
    {
        "id": "riceleafbd_ccby",
        "dataset": "RiceLeafBD",
        "doi": "10.17632/kx9rx8p2mz.1",
        "version": 1,
        "license": "CC BY 4.0",
        "source_url": "https://data.mendeley.com/datasets/kx9rx8p2mz/1",
        "filename": "Original Images.zip",
        "url": (
            "https://data.mendeley.com/public-files/datasets/kx9rx8p2mz/files/"
            "fdab2bd9-ed8b-4156-8d96-0b5d8f18f4ed/file_downloaded"
        ),
        "bytes": 497_906_237,
        "sha256": "3280cc176c2ee9f6ee4386e5728623fc7e8f9204b31c50f4ebb303edc52d9c83",
        "expected_images": 1_560,
    },
    {
        "id": "rice_field_weeds_ccby",
        "dataset": "Rice Field Weed Dataset V3",
        "doi": "10.17632/mt72bmxz73.3",
        "version": 3,
        "license": "CC BY 4.0",
        "source_url": "https://data.mendeley.com/datasets/mt72bmxz73/3",
        "filename": "Rice Field weed BD Dataset_V3.zip",
        "url": (
            "https://data.mendeley.com/public-files/datasets/mt72bmxz73/files/"
            "fa2ad794-0a3a-4d15-89b4-361f5686d676/file_downloaded"
        ),
        "bytes": 259_896_693,
        "sha256": "9b3f766c2893b6059515cf309fd4b4822132805c64571942b274d971dc0d1914",
        "expected_images": 4_367,
    },
    {
        "id": "potato_blight_sample_ccby",
        "dataset": "Enhanced Field-Based Detection of Potato Leaf Blight (sample)",
        "doi": "10.17632/pbnw43s6kt.1",
        "version": 1,
        "license": "CC BY 4.0",
        "source_url": "https://data.mendeley.com/datasets/pbnw43s6kt/1",
        "filename": "pbnw43s6kt-v1.zip",
        "url": "https://data.mendeley.com/public-api/zip/pbnw43s6kt/download/1",
        "bytes": 1_006_245_483,
        "sha256": "88cd82644a839cb708cf3ea3b1c21da24ff442061883ac5001701ee1c807bcf0",
        "expected_images": 305,
        "official_folder_file_counts": {
            "healthy_rgb": 88,
            "blight_train": 217,
        },
        "official_folder_total_bytes": {
            "healthy_rgb": 429_318_596,
            "blight_train": 585_711_173,
        },
    },
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, target: Path, expected_bytes: int) -> None:
    if target.is_file() and target.stat().st_size == expected_bytes:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".part")
    existing = temporary.stat().st_size if temporary.exists() else 0
    request = urllib.request.Request(
        url,
        headers={
            "Range": f"bytes={existing}-",
            "User-Agent": "Fasal-Pramaan-research-materializer/1.0",
        }
        if existing
        else {"User-Agent": "Fasal-Pramaan-research-materializer/1.0"},
    )
    mode = "ab" if existing else "wb"
    with urllib.request.urlopen(request, timeout=600) as response:
        if existing and response.status != 206:
            mode = "wb"
        with temporary.open(mode) as handle:
            for chunk in iter(lambda: response.read(1024 * 1024), b""):
                handle.write(chunk)
    temporary.replace(target)


def safe_member_path(name: str) -> Path:
    posix = PurePosixPath(name.replace("\\", "/"))
    if posix.is_absolute() or ".." in posix.parts:
        raise RuntimeError(f"unsafe archive member: {name}")
    return Path(*posix.parts)


def extract_original_images(archive: Path, destination: Path) -> list[Path]:
    extracted: list[Path] = []
    with zipfile.ZipFile(archive) as zipped:
        for member in zipped.infolist():
            relative = safe_member_path(member.filename)
            if member.is_dir() or relative.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            output = destination / relative
            if not output.exists() or output.stat().st_size != member.file_size:
                output.parent.mkdir(parents=True, exist_ok=True)
                with zipped.open(member) as source, output.open("wb") as target:
                    shutil.copyfileobj(source, target, 1024 * 1024)
            extracted.append(output)
    return sorted(extracted)


def source_label(source_id: str, relative_path: Path) -> tuple[str, str]:
    parts = relative_path.parts
    if source_id == "riceleafbd_ccby":
        original = parts[1]
        health = "healthy" if original.lower() == "healthy leaf" else "disease"
        return original, health
    if source_id == "rice_field_weeds_ccby":
        return parts[1], "invalid"
    joined = "/".join(part.lower() for part in parts)
    if "healthy_potato_leaf" in joined:
        return "Healthy potato leaf", "healthy"
    if "blight_infected_potato_leaf" in joined:
        return "Blight infected potato leaf", "disease"
    raise RuntimeError(f"unrecognized potato label path: {relative_path}")


def image_record(
    source_root: Path,
    image_root: Path,
    path: Path,
    source_id: str,
) -> dict[str, Any]:
    original_relative = path.relative_to(image_root)
    label, health_state = source_label(source_id, original_relative)
    digest = sha256_file(path)
    with Image.open(path) as opened:
        image_format = str(opened.format or path.suffix.lstrip(".")).upper()
        image = ImageOps.exif_transpose(opened).convert("RGB")
        width, height = image.size
        cached = CACHE / f"{digest}.jpg"
        cache_valid = False
        if cached.exists():
            try:
                with Image.open(cached) as existing:
                    existing.verify()
                cache_valid = True
            except (OSError, SyntaxError):
                cache_valid = False
        if not cache_valid:
            resized = image.copy()
            resized.thumbnail((512, 512), Image.Resampling.LANCZOS)
            temporary = cached.with_suffix(".jpg.tmp")
            resized.save(temporary, "JPEG", quality=92, optimize=True)
            temporary.replace(cached)
    return {
        "relative_path": path.relative_to(source_root).as_posix(),
        "original_path": original_relative.as_posix(),
        "label": label,
        "health_state": health_state,
        "image_sha256": digest,
        "bytes": path.stat().st_size,
        "width": width,
        "height": height,
        "format": image_format,
        "cached_relative_path": cached.relative_to(ROOT).as_posix(),
        "cached_image_sha256": sha256_file(cached),
        "cached_max_dimension": 512,
    }


def materialize(item: dict[str, Any]) -> dict[str, Any]:
    source_root = RAW / str(item["id"])
    source_root.mkdir(parents=True, exist_ok=True)
    archive = source_root / str(item["filename"])
    download(str(item["url"]), archive, int(item["bytes"]))
    archive_sha = sha256_file(archive)
    if archive.stat().st_size != item["bytes"] or archive_sha != item["sha256"]:
        raise RuntimeError(f"{archive}: archive lock mismatch")

    image_root = source_root / "images"
    paths = extract_original_images(archive, image_root)
    if len(paths) != item["expected_images"]:
        raise RuntimeError(
            f"{item['id']}: expected {item['expected_images']} images, got {len(paths)}"
        )
    records = [
        image_record(source_root, image_root, path, str(item["id"])) for path in paths
    ]
    metadata_path = source_root / "metadata.jsonl"
    metadata_path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in records),
        encoding="utf-8",
    )
    health_counts = Counter(str(row["health_state"]) for row in records)
    label_counts = Counter(str(row["label"]) for row in records)
    lock = {
        "lock_version": f"{item['id']}-download-lock-v1",
        "dataset": item["dataset"],
        "doi": item["doi"],
        "dataset_version": item["version"],
        "license": item["license"],
        "source_url": item["source_url"],
        "files": [
            {
                "filename": item["filename"],
                "url": item["url"],
                "bytes": item["bytes"],
                "sha256": item["sha256"],
            }
        ],
        "rows": len(records),
        "unique_image_sha256": len({row["image_sha256"] for row in records}),
        "labels": dict(sorted(label_counts.items())),
        "health_states": dict(sorted(health_counts.items())),
        "metadata_sha256": sha256_file(metadata_path),
        "resized_cache_policy": "longest edge <=512px, RGB JPEG quality 92, LANCZOS",
        "only_original_images": True,
        "synthetic_or_augmented_images_included": False,
    }
    for optional in ("official_folder_file_counts", "official_folder_total_bytes"):
        if optional in item:
            lock[optional] = item[optional]
    (source_root / "download_lock.json").write_text(
        json.dumps(lock, indent=2) + "\n", encoding="utf-8"
    )
    return {"id": item["id"], **lock}


def main() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    locks = [materialize(item) for item in SOURCES]
    aggregate = {
        "lock_version": "field-expansion-download-lock-v4",
        "extends": "field_expansion_download_lock_v3.json",
        "sources": locks,
        "redistribute_raw_images": False,
        "is_production_validated": False,
    }
    target = ROOT / "field_expansion_download_lock_v4.json"
    target.write_text(json.dumps(aggregate, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(aggregate, indent=2))


if __name__ == "__main__":
    main()
