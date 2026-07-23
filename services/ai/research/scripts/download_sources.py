#!/usr/bin/env python3
"""Download, checksum, and extract the pinned licensed research sources."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path


RESEARCH_ROOT = Path(__file__).resolve().parents[1]
CONFIG = RESEARCH_ROOT / "config" / "sources_v1.json"
DATA = RESEARCH_ROOT / "data"
ARCHIVES = DATA / "archives"
RAW = DATA / "raw"
LOCK = RESEARCH_ROOT / "download_lock_v1.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path, expected_bytes: int | None) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".partial")
    start = partial.stat().st_size if partial.exists() else 0
    headers = {"User-Agent": "FasalPramaan-research/1.0"}
    if start:
        headers["Range"] = f"bytes={start}-"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=120) as response:  # noqa: S310
        append = start > 0 and getattr(response, "status", 200) == 206
        mode = "ab" if append else "wb"
        if not append:
            start = 0
        total = expected_bytes or int(response.headers.get("Content-Length", "0")) + start
        written = start
        with partial.open(mode) as handle:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
                written += len(chunk)
                if written % (64 * 1024 * 1024) < len(chunk):
                    print(f"  {destination.name}: {written / 1024**2:.0f}/{total / 1024**2:.0f} MiB", flush=True)
    partial.replace(destination)
    if expected_bytes and destination.stat().st_size != expected_bytes:
        raise RuntimeError(
            f"Size mismatch for {destination}: {destination.stat().st_size} != {expected_bytes}"
        )


def extract(archive: Path, destination: Path) -> None:
    marker = destination / ".extracted"
    if marker.exists():
        return
    if destination.exists():
        remove_path = (
            "\\\\?\\" + str(destination.resolve()) if os.name == "nt" else str(destination)
        )
        shutil.rmtree(remove_path)
    destination.mkdir(parents=True)
    suffix = archive.suffix.lower()
    if suffix == ".zip":
        with zipfile.ZipFile(archive) as bundle:
            base = destination.resolve()
            for member in bundle.infolist():
                parts: list[str] = []
                for original_part in Path(member.filename.replace("/", os.sep)).parts:
                    safe_part = re.sub(r'[<>:"|?*]', "_", original_part).rstrip(". ")
                    if safe_part != original_part:
                        part_path = Path(safe_part)
                        token = hashlib.sha1(
                            original_part.encode("utf-8"), usedforsecurity=False
                        ).hexdigest()[:8]
                        safe_part = f"{part_path.stem}__{token}{part_path.suffix}"
                    parts.append(safe_part)
                relative = Path(*parts)
                target = (base / relative).resolve()
                if base != target and base not in target.parents:
                    raise RuntimeError(f"Unsafe archive member: {member.filename}")
                filesystem_target = (
                    Path("\\\\?\\" + str(target)) if os.name == "nt" else target
                )
                if member.is_dir():
                    filesystem_target.mkdir(parents=True, exist_ok=True)
                    continue
                filesystem_target.parent.mkdir(parents=True, exist_ok=True)
                with (
                    bundle.open(member) as source_handle,
                    filesystem_target.open("wb") as target_handle,
                ):
                    shutil.copyfileobj(source_handle, target_handle)
    elif suffix == ".7z":
        try:
            import py7zr
        except ModuleNotFoundError as exc:
            raise RuntimeError("Install research/requirements.txt for 7z extraction") from exc
        with py7zr.SevenZipFile(archive, mode="r") as bundle:
            bundle.extractall(destination)
    elif suffix == ".rar":
        subprocess.run(["tar", "-xf", str(archive), "-C", str(destination)], check=True)
    else:
        raise RuntimeError(f"Unsupported archive format: {archive}")
    marker.write_text(datetime.now(timezone.utc).isoformat(), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--source", action="append", default=[])
    parser.add_argument("--no-extract", action="store_true")
    args = parser.parse_args()
    if not args.all and not args.source:
        parser.error("choose --all or one or more --source IDs")

    registry = json.loads(CONFIG.read_text(encoding="utf-8"))
    chosen = [
        item
        for item in registry["sources"]
        if item.get("download", True) and (args.all or item["id"] in args.source)
    ]
    missing = set(args.source) - {item["id"] for item in chosen}
    if missing:
        raise SystemExit(f"Unknown or non-download source IDs: {sorted(missing)}")

    lock = {
        "version": "download-lock-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sources_config_sha256": sha256_file(CONFIG),
        "sources": [],
    }
    previous = json.loads(LOCK.read_text(encoding="utf-8")) if LOCK.exists() else None
    previous_rows = {row["id"]: row for row in (previous or {}).get("sources", [])}

    for source in chosen:
        archive = ARCHIVES / source["archive_name"]
        print(f"[{source['id']}]", flush=True)
        if not archive.exists():
            download(source["archive_url"], archive, source.get("expected_bytes"))
        digest = sha256_file(archive)
        expected_hash = source.get("archive_sha256")
        if expected_hash and digest.lower() != expected_hash.lower():
            raise RuntimeError(f"SHA-256 mismatch for {source['id']}")
        row = {
            "id": source["id"],
            "archive_name": archive.name,
            "bytes": archive.stat().st_size,
            "sha256": digest,
            "source_url": source["source_url"],
            "license": source["license"],
        }
        if source.get("pinned_revision"):
            row["pinned_revision"] = source["pinned_revision"]
        lock["sources"].append(row)
        if not args.no_extract:
            extract(archive, RAW / source["id"])

    for source_id, row in previous_rows.items():
        if source_id not in {item["id"] for item in lock["sources"]}:
            lock["sources"].append(row)
    lock["sources"] = sorted(lock["sources"], key=lambda row: row["id"])
    LOCK.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {LOCK}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
