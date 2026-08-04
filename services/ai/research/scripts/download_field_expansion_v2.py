#!/usr/bin/env python3
"""Download, extract, and lock the Ethiopian-potato and seasonal-maize sources."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}

POTATO = {
    "id": "potato_ethiopia_ccby",
    "dataset": "Potato Leaf Healthy and Late Blight",
    "doi": "10.17632/v4w72bsts5.1",
    "source_url": "https://data.mendeley.com/datasets/v4w72bsts5/1",
    "archive_url": (
        "https://data.mendeley.com/public-files/datasets/v4w72bsts5/files/"
        "e5edcf03-1734-4f75-87e0-895f08727b19/file_downloaded"
    ),
    "archive_name": "Local.rar",
    "archive_bytes": 5_334_258,
    "archive_sha256": "6928a86923c15059a838003b1113ac7fbac8c0790e64190b0c37acb4bbd5f5eb",
}
MAIZE = {
    "id": "maize_seasonal_ccby",
    "dataset": "Seasonal Corn Leaf Disease Dataset",
    "doi": "10.17632/vy629dngm8.1",
    "source_url": "https://data.mendeley.com/datasets/vy629dngm8/1",
    "archive_url": (
        "https://data.mendeley.com/public-files/datasets/vy629dngm8/files/"
        "e086f779-470a-4c7c-ba81-97734e9f8dd6/file_downloaded"
    ),
    "archive_name": "Corn leaf disease dataset.zip",
    "archive_bytes": 4_599_036_050,
    "archive_sha256": "575628df92e69c169fa82c8506253d7d5886a8931605bf765f0e2577022dc479",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_stream(url: str, target: Path, expected_bytes: int) -> None:
    if target.is_file() and target.stat().st_size == expected_bytes:
        return
    temporary = target.with_suffix(target.suffix + ".part")
    existing = temporary.stat().st_size if temporary.exists() else 0
    headers = {"Range": f"bytes={existing}-"} if existing else {}
    mode = "ab" if existing else "wb"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=600) as response:
        if existing and response.status != 206:
            existing, mode = 0, "wb"
        with temporary.open(mode) as handle:
            for chunk in iter(lambda: response.read(1024 * 1024), b""):
                handle.write(chunk)
    temporary.replace(target)


def validate_archive(path: Path, source: dict[str, Any]) -> None:
    if path.stat().st_size != source["archive_bytes"]:
        raise RuntimeError(f"{path.name}: byte-size mismatch")
    digest = sha256_file(path)
    if digest != source["archive_sha256"]:
        raise RuntimeError(f"{path.name}: SHA-256 mismatch ({digest})")


def safe_zip_extract(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zipped:
        for member in zipped.infolist():
            if member.is_dir():
                continue
            relative = Path(member.filename)
            if relative.is_absolute() or ".." in relative.parts:
                raise RuntimeError(f"unsafe archive member: {member.filename}")
            if relative.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            output = destination / relative
            output.parent.mkdir(parents=True, exist_ok=True)
            with zipped.open(member) as source, output.open("wb") as target:
                shutil.copyfileobj(source, target, 1024 * 1024)


def extract_rar_with_bsdtar(archive: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    tar = shutil.which("bsdtar") or shutil.which("tar")
    if not tar:
        raise RuntimeError("A libarchive-compatible bsdtar/tar executable is required")
    subprocess.run(
        [tar, "-xf", str(archive), "-C", str(destination)],
        check=True,
    )


def image_record(path: Path, source_root: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image)
        image.verify()
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image)
        width, height = image.size
        image_format = image.format
    label = path.parent.name
    return {
        "relative_path": path.relative_to(source_root).as_posix(),
        "original_path": path.relative_to(source_root / "images").as_posix(),
        "label": label,
        "image_sha256": sha256_file(path),
        "bytes": path.stat().st_size,
        "width": width,
        "height": height,
        "format": image_format,
    }


def materialize(source: dict[str, Any], archive_kind: str) -> dict[str, Any]:
    source_root = RAW / source["id"]
    source_root.mkdir(parents=True, exist_ok=True)
    archive = source_root / source["archive_name"]
    download_stream(source["archive_url"], archive, source["archive_bytes"])
    validate_archive(archive, source)
    image_root = source_root / "images"
    if not any(image_root.rglob("*")):
        if archive_kind == "zip":
            safe_zip_extract(archive, image_root)
        else:
            extract_rar_with_bsdtar(archive, image_root)
    paths = sorted(
        path
        for path in image_root.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )
    metadata = [image_record(path, source_root) for path in paths]
    metadata_path = source_root / "metadata.jsonl"
    metadata_path.write_text(
        "".join(json.dumps(item, sort_keys=True) + "\n" for item in metadata),
        encoding="utf-8",
    )
    lock = {
        "lock_version": f"{source['id']}-download-lock-v1",
        "dataset": source["dataset"],
        "doi": source["doi"],
        "dataset_version": 1,
        "license": "CC BY 4.0",
        "source_url": source["source_url"],
        "archive_url": source["archive_url"],
        "archive_name": source["archive_name"],
        "archive_bytes": archive.stat().st_size,
        "archive_sha256": sha256_file(archive),
        "rows": len(metadata),
        "unique_image_sha256": len({item["image_sha256"] for item in metadata}),
        "labels": sorted({item["label"] for item in metadata}),
        "metadata_sha256": sha256_file(metadata_path),
        "only_original_images": True,
        "synthetic_or_augmented_images_included": False,
    }
    (source_root / "download_lock.json").write_text(
        json.dumps(lock, indent=2) + "\n", encoding="utf-8"
    )
    return lock


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", choices=("potato", "maize", "all"))
    args = parser.parse_args()
    locks = []
    if args.source in {"potato", "all"}:
        locks.append(materialize(POTATO, "rar"))
    if args.source in {"maize", "all"}:
        locks.append(materialize(MAIZE, "zip"))
    print(json.dumps(locks, indent=2))


if __name__ == "__main__":
    main()
