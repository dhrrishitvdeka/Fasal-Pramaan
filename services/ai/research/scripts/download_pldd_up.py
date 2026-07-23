#!/usr/bin/env python3
"""Materialize and lock the source-disjoint PLDD-UP potato field dataset."""

from __future__ import annotations

import hashlib
import json
import shutil
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ID = "potato_pldd_up_ccby"
SOURCE = ROOT / "data" / "raw" / SOURCE_ID
CACHE = ROOT / "data" / "resized_512"
FILES = [
    {
        "filename": "EB.zip",
        "label": "Early Blight",
        "url": (
            "https://data.mendeley.com/public-files/datasets/3j4nfkvp2n/files/"
            "5717ac85-cf61-461d-bf70-e1e5af2f2c53/file_downloaded"
        ),
        "bytes": 2_766_326_616,
        "sha256": "cffd37bbb79e75c0e23c1486f88f0a7c873b3fe67f643c41db3abd794bdc01e5",
    },
    {
        "filename": "Healthy.zip",
        "label": "Healthy",
        "url": (
            "https://data.mendeley.com/public-files/datasets/3j4nfkvp2n/files/"
            "d4ce2acf-3af8-416e-90bc-bb834ba9da66/file_downloaded"
        ),
        "bytes": 3_683_027_938,
        "sha256": "2b7e4107d7ba03c0ef9636831aa4de7d333435df238f667f562e27b1e46e59e2",
    },
    {
        "filename": "LB.zip",
        "label": "Late Blight",
        "url": (
            "https://data.mendeley.com/public-files/datasets/3j4nfkvp2n/files/"
            "35ff7712-865c-41bf-96b1-d25d84af7b95/file_downloaded"
        ),
        "bytes": 2_323_338_293,
        "sha256": "f4d31182b5d2f147c256e1c73838eac9b17592b89ed2b1ae394f58863e74a447",
    },
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, target: Path, expected_bytes: int) -> None:
    if target.is_file() and target.stat().st_size == expected_bytes:
        return
    temporary = target.with_suffix(target.suffix + ".part")
    existing = temporary.stat().st_size if temporary.exists() else 0
    request = urllib.request.Request(
        url, headers={"Range": f"bytes={existing}-"} if existing else {}
    )
    mode = "ab" if existing else "wb"
    with urllib.request.urlopen(request, timeout=600) as response:
        if existing and response.status != 206:
            mode = "wb"
        with temporary.open(mode) as handle:
            for chunk in iter(lambda: response.read(1024 * 1024), b""):
                handle.write(chunk)
    temporary.replace(target)


def extract(archive: Path, destination: Path) -> None:
    with zipfile.ZipFile(archive) as zipped:
        for member in zipped.infolist():
            if member.is_dir():
                continue
            relative = Path(member.filename)
            if relative.is_absolute() or ".." in relative.parts:
                raise RuntimeError(f"unsafe archive member: {member.filename}")
            if relative.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            output = destination / relative
            if output.exists() and output.stat().st_size == member.file_size:
                continue
            output.parent.mkdir(parents=True, exist_ok=True)
            with zipped.open(member) as source, output.open("wb") as target:
                shutil.copyfileobj(source, target, 1024 * 1024)


def image_record(path: Path, label: str) -> dict[str, Any]:
    digest = sha256_file(path)
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        width, height = image.size
        cached = CACHE / f"{digest}.jpg"
        if not cached.exists():
            resized = image.copy()
            resized.thumbnail((512, 512), Image.Resampling.LANCZOS)
            resized.save(cached, "JPEG", quality=92, optimize=True)
    return {
        "relative_path": path.relative_to(SOURCE).as_posix(),
        "original_path": path.relative_to(SOURCE / "images").as_posix(),
        "label": label,
        "image_sha256": digest,
        "bytes": path.stat().st_size,
        "width": width,
        "height": height,
        "format": "JPEG",
        "cached_relative_path": cached.relative_to(ROOT).as_posix(),
        "cached_image_sha256": sha256_file(cached),
        "cached_max_dimension": 512,
    }


def main() -> None:
    SOURCE.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    image_root = SOURCE / "images"
    image_root.mkdir(parents=True, exist_ok=True)
    file_locks = []
    labels_by_archive = {}
    for item in FILES:
        archive = SOURCE / item["filename"]
        download(item["url"], archive, item["bytes"])
        digest = sha256_file(archive)
        if archive.stat().st_size != item["bytes"] or digest != item["sha256"]:
            raise RuntimeError(f"{archive.name}: archive lock mismatch")
        extract(archive, image_root)
        file_locks.append(
            {
                "filename": item["filename"],
                "url": item["url"],
                "bytes": item["bytes"],
                "sha256": item["sha256"],
            }
        )
        labels_by_archive[Path(item["filename"]).stem.lower()] = item["label"]

    metadata = []
    for path in sorted(image_root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        folder = path.relative_to(image_root).parts[0].lower()
        label = labels_by_archive[folder]
        metadata.append(image_record(path, label))
    metadata_path = SOURCE / "metadata.jsonl"
    metadata_path.write_text(
        "".join(json.dumps(row, sort_keys=True) + "\n" for row in metadata),
        encoding="utf-8",
    )
    lock = {
        "lock_version": "potato-pldd-up-download-lock-v1",
        "dataset": "PLDD-UP: Potato Leaf Disease Dataset from Uttar Pradesh, India",
        "doi": "10.17632/3j4nfkvp2n.1",
        "dataset_version": 1,
        "license": "CC BY 4.0",
        "source_url": "https://data.mendeley.com/datasets/3j4nfkvp2n/1",
        "files": file_locks,
        "rows": len(metadata),
        "unique_image_sha256": len({row["image_sha256"] for row in metadata}),
        "labels": sorted({row["label"] for row in metadata}),
        "metadata_sha256": sha256_file(metadata_path),
        "resized_cache_policy": "longest edge <=512px, RGB JPEG quality 92, LANCZOS",
        "only_original_images": True,
        "synthetic_or_augmented_images_included": False,
    }
    (SOURCE / "download_lock.json").write_text(
        json.dumps(lock, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(lock, indent=2))


if __name__ == "__main__":
    main()
