#!/usr/bin/env python3
"""Download and lock the CC BY 4.0 Digital Green expert image source."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image
from tqdm import tqdm


ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "digigreen_annotations.csv"
OUTPUT = ROOT / "data" / "raw" / "digigreen_ccby"
REVISION = "d47d7eb88b1865062f821edcf58c28d8a7013718"


def sha256_bytes(values: bytes) -> str:
    return hashlib.sha256(values).hexdigest()


def download(row: dict[str, str]) -> dict[str, object]:
    url = row["image_url"].strip()
    image_id = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
    destination = OUTPUT / "images" / f"{image_id}.jpg"
    if destination.exists():
        values = destination.read_bytes()
    else:
        error: Exception | None = None
        for attempt in range(4):
            try:
                request = urllib.request.Request(
                    url,
                    headers={"User-Agent": "FasalPramaan-dataset-audit/1.0"},
                )
                with urllib.request.urlopen(request, timeout=45) as response:
                    values = response.read()
                with Image.open(io.BytesIO(values)) as image:
                    image.verify()
                temporary = destination.with_suffix(".tmp")
                temporary.write_bytes(values)
                temporary.replace(destination)
                break
            except Exception as exc:  # noqa: BLE001
                error = exc
                time.sleep(2**attempt)
        else:
            raise RuntimeError(f"failed {url}: {error}")
    with Image.open(io.BytesIO(values)) as image:
        width, height = image.size
        image_format = image.format
    return {
        "id": image_id,
        "image_url": url,
        "crop": row["crop"].strip(),
        "diagnosis": row["diagnosis"].strip(),
        "details": row["details"].strip(),
        "relative_path": f"images/{image_id}.jpg",
        "image_sha256": sha256_bytes(values),
        "bytes": len(values),
        "width": width,
        "height": height,
        "format": image_format,
    }


def main() -> None:
    OUTPUT.joinpath("images").mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8-sig", newline="")))
    if len(rows) != 1092:
        raise RuntimeError(f"expected 1092 annotations, found {len(rows)}")
    grouped: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        grouped.setdefault(row["image_url"].strip(), []).append(row)
    results: list[dict[str, object]] = []
    failures: list[dict[str, str]] = []
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {
            executor.submit(download, annotations[0]): (url, annotations)
            for url, annotations in grouped.items()
        }
        for future in tqdm(as_completed(futures), total=len(futures), desc="Digital Green"):
            try:
                result = future.result()
                result["annotations"] = [
                    {
                        "crop": row["crop"].strip(),
                        "diagnosis": row["diagnosis"].strip(),
                        "details": row["details"].strip(),
                    }
                    for row in futures[future][1]
                ]
                results.append(result)
            except Exception as exc:  # noqa: BLE001
                failures.append({"image_url": futures[future][0], "error": str(exc)})
    results.sort(key=lambda item: str(item["id"]))
    metadata = OUTPUT / "metadata.jsonl"
    metadata.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in results),
        encoding="utf-8",
    )
    report = {
        "version": "digigreen-download-lock-v1",
        "dataset": "DigiGreen/Crop_Disease_Images",
        "revision": REVISION,
        "license": "CC BY 4.0",
        "source_url": "https://huggingface.co/datasets/DigiGreen/Crop_Disease_Images",
        "annotations_sha256": sha256_bytes(CSV_PATH.read_bytes()),
        "annotation_rows": len(rows),
        "unique_urls": len(grouped),
        "downloaded_and_validated": len(results),
        "failures": failures,
        "metadata_sha256": hashlib.sha256(metadata.read_bytes()).hexdigest(),
        "image_bytes": sum(int(row["bytes"]) for row in results),
    }
    (OUTPUT / "download_lock.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
