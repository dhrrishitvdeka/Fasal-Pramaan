#!/usr/bin/env python3
"""Download and validate disjoint licensed potato/rice field sources."""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path
from typing import Any

import httpx
import pyarrow.parquet as pq
from huggingface_hub import HfApi, hf_hub_download
from PIL import Image, ImageOps
from tqdm import tqdm


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
POTATO_SOURCE = "potato_uncontrolled_ccby"
POTATO_REPO = "Project-AgML/potato_leaf_disease_classification"
POTATO_REVISION = "d564ae2b7548f8a6ef99139ba69a1f82f2dfed5e"
POTATO_FILES = [
    "data/train-00000-of-00002.parquet",
    "data/train-00001-of-00002.parquet",
]
RICE_SOURCE = "ricey_field_ccby"
RICE_URL = (
    "https://data.mendeley.com/public-files/datasets/t46kkgh2yw/files/"
    "ad910789-b1f6-47d3-8115-70b5865605f8/file_downloaded"
)
RICE_SHA256 = "eb1e804ae414250d7a333a1c3820c49a520c2f09e2e6a38f280e90f58a4f62fb"
RICE_BYTES = 1_664_385_692


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_record(path: Path, label: str, relative_path: str) -> dict[str, Any]:
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image)
        image.verify()
    with Image.open(path) as image:
        width, height = ImageOps.exif_transpose(image).size
        image_format = image.format
    return {
        "relative_path": relative_path,
        "label": label,
        "image_sha256": sha256_file(path),
        "bytes": path.stat().st_size,
        "width": width,
        "height": height,
        "format": image_format,
    }


def download_potato() -> None:
    source = RAW / POTATO_SOURCE
    parquet_root = source / "parquet"
    image_root = source / "images"
    parquet_root.mkdir(parents=True, exist_ok=True)
    image_root.mkdir(parents=True, exist_ok=True)
    info = HfApi().dataset_info(POTATO_REPO, revision=POTATO_REVISION, files_metadata=True)
    if info.sha != POTATO_REVISION:
        raise RuntimeError(f"potato revision mismatch: {info.sha}")
    sibling_meta = {item.rfilename: item for item in info.siblings}
    parquet_paths = []
    file_lock = []
    for filename in POTATO_FILES:
        downloaded = Path(
            hf_hub_download(
                repo_id=POTATO_REPO,
                repo_type="dataset",
                filename=filename,
                revision=POTATO_REVISION,
                local_dir=parquet_root,
            )
        )
        parquet_paths.append(downloaded)
        sibling = sibling_meta[filename]
        file_lock.append(
            {
                "filename": filename,
                "bytes": downloaded.stat().st_size,
                "sha256": sha256_file(downloaded),
                "upstream_blob_sha256": getattr(sibling.lfs, "sha256", None),
            }
        )

    metadata: list[dict[str, Any]] = []
    row_number = 0
    label_names: list[str] | None = None
    for parquet_path in parquet_paths:
        table = pq.read_table(parquet_path)
        huggingface = json.loads(table.schema.metadata[b"huggingface"])
        current_names = huggingface["info"]["features"]["label"]["names"]
        if label_names is None:
            label_names = current_names
        elif label_names != current_names:
            raise RuntimeError("inconsistent potato label metadata")
        for batch in tqdm(
            table.to_batches(max_chunksize=64), desc=f"extract {parquet_path.name}"
        ):
            for row in batch.to_pylist():
                payload = row["image"]
                image_bytes = payload["bytes"]
                digest = hashlib.sha256(image_bytes).hexdigest()
                path_hint = str(payload.get("path") or "")
                suffix = Path(path_hint).suffix.lower() or ".jpg"
                if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
                    suffix = ".jpg"
                relative = f"images/{digest[:24]}{suffix}"
                output = source / relative
                if not output.exists():
                    output.write_bytes(image_bytes)
                record = image_record(
                    output, label_names[int(row["label"])], relative
                )
                record.update({"row": row_number, "original_path": path_hint})
                metadata.append(record)
                row_number += 1

    (source / "metadata.jsonl").write_text(
        "".join(json.dumps(item, sort_keys=True) + "\n" for item in metadata),
        encoding="utf-8",
    )
    lock = {
        "version": "potato-uncontrolled-download-lock-v1",
        "dataset": POTATO_REPO,
        "revision": POTATO_REVISION,
        "license": "CC BY 4.0",
        "source_url": f"https://huggingface.co/datasets/{POTATO_REPO}",
        "doi": "10.17632/ptz377bwb8.1",
        "files": file_lock,
        "rows": len(metadata),
        "unique_image_sha256": len({item["image_sha256"] for item in metadata}),
        "labels": label_names,
        "metadata_sha256": sha256_file(source / "metadata.jsonl"),
    }
    (source / "download_lock.json").write_text(
        json.dumps(lock, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(lock, indent=2))


def download_stream(url: str, target: Path, expected_bytes: int) -> None:
    if target.exists() and target.stat().st_size == expected_bytes:
        return
    temporary = target.with_suffix(target.suffix + ".part")
    headers = {}
    mode = "wb"
    existing = temporary.stat().st_size if temporary.exists() else 0
    if existing:
        headers["Range"] = f"bytes={existing}-"
        mode = "ab"
    timeout = httpx.Timeout(connect=60, read=600, write=60, pool=60)
    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        with client.stream("GET", url, headers=headers) as response:
            response.raise_for_status()
            if existing and response.status_code != 206:
                existing = 0
                mode = "wb"
            total = int(response.headers.get("content-length", "0")) + existing
            with temporary.open(mode) as handle, tqdm(
                total=total, initial=existing, unit="B", unit_scale=True, desc=target.name
            ) as progress:
                for chunk in response.iter_bytes(1024 * 1024):
                    handle.write(chunk)
                    progress.update(len(chunk))
    temporary.replace(target)


def download_rice() -> None:
    source = RAW / RICE_SOURCE
    image_root = source / "images"
    source.mkdir(parents=True, exist_ok=True)
    archive = source / "Original Images.zip"
    download_stream(RICE_URL, archive, RICE_BYTES)
    if archive.stat().st_size != RICE_BYTES or sha256_file(archive) != RICE_SHA256:
        raise RuntimeError("rice archive size or SHA-256 mismatch")
    if not image_root.exists():
        image_root.mkdir(parents=True)
        with zipfile.ZipFile(archive) as zipped:
            for member in tqdm(zipped.infolist(), desc="extract rice originals"):
                if member.is_dir():
                    continue
                relative = Path(member.filename)
                if relative.is_absolute() or ".." in relative.parts:
                    raise RuntimeError(f"unsafe archive member: {member.filename}")
                if relative.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                    continue
                output = image_root / relative
                output.parent.mkdir(parents=True, exist_ok=True)
                with zipped.open(member) as source_handle, output.open("wb") as target_handle:
                    for chunk in iter(lambda: source_handle.read(1024 * 1024), b""):
                        target_handle.write(chunk)

    metadata = []
    for path in tqdm(sorted(image_root.rglob("*")), desc="validate rice originals"):
        if not path.is_file() or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        relative = path.relative_to(source).as_posix()
        label = path.parent.name
        record = image_record(path, label, relative)
        record["original_path"] = path.relative_to(image_root).as_posix()
        metadata.append(record)
    (source / "metadata.jsonl").write_text(
        "".join(json.dumps(item, sort_keys=True) + "\n" for item in metadata),
        encoding="utf-8",
    )
    lock = {
        "lock_version": "ricey-field-download-lock-v1",
        "dataset": "RiceyLeafDisease",
        "doi": "10.17632/t46kkgh2yw.1",
        "version": 1,
        "license": "CC BY 4.0",
        "source_url": "https://data.mendeley.com/datasets/t46kkgh2yw/1",
        "archive_url": RICE_URL,
        "archive_bytes": archive.stat().st_size,
        "archive_sha256": sha256_file(archive),
        "rows": len(metadata),
        "unique_image_sha256": len({item["image_sha256"] for item in metadata}),
        "labels": sorted({item["label"] for item in metadata}),
        "metadata_sha256": sha256_file(source / "metadata.jsonl"),
    }
    (source / "download_lock.json").write_text(
        json.dumps(lock, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(lock, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", choices=("potato", "rice", "all"))
    args = parser.parse_args()
    if args.source in {"potato", "all"}:
        download_potato()
    if args.source in {"rice", "all"}:
        download_rice()


if __name__ == "__main__":
    main()
