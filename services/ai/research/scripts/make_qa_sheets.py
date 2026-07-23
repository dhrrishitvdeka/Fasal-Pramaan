#!/usr/bin/env python3
"""Render deterministic contact sheets for manual label QA."""

from __future__ import annotations

import hashlib
import json
import os
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
COLS = 4
ROWS = 4
CELL_W = 360
CELL_H = 290
IMAGE_H = 225


def long_path(path: Path) -> str:
    resolved = str(path.resolve())
    return f"\\\\?\\{resolved}" if os.name == "nt" else resolved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--version",
        choices=("v1", "v2", "v3", "v4", "v5", "v6"),
        default="v1",
    )
    args = parser.parse_args()
    qa_path = ROOT / f"qa_sample_{args.version}.json"
    manifest_path = ROOT / f"manifest_{args.version}.jsonl"
    output = ROOT / "data" / f"qa_sheets_{args.version}"
    qa = json.loads(qa_path.read_text(encoding="utf-8"))
    manifest = {
        row["id"]: row
        for row in (
            json.loads(line)
            for line in manifest_path.read_text(encoding="utf-8").splitlines()
            if line
        )
    }
    output.mkdir(parents=True, exist_ok=True)
    index: list[dict[str, object]] = []
    font = ImageFont.load_default(size=15)
    for page_start in range(0, len(qa), COLS * ROWS):
        page_items = qa[page_start : page_start + COLS * ROWS]
        page_no = page_start // (COLS * ROWS) + 1
        sheet = Image.new("RGB", (COLS * CELL_W, ROWS * CELL_H), "white")
        draw = ImageDraw.Draw(sheet)
        for offset, item in enumerate(page_items):
            row = manifest[item["id"]]
            path = RAW / row["source_dataset"] / row["original_path"]
            with Image.open(long_path(path)) as source:
                source = ImageOps.exif_transpose(source).convert("RGB")
                thumb = ImageOps.contain(source, (CELL_W - 12, IMAGE_H - 8))
            col, line = offset % COLS, offset // COLS
            x, y = col * CELL_W, line * CELL_H
            image_x = x + (CELL_W - thumb.width) // 2
            image_y = y + 4 + (IMAGE_H - thumb.height) // 2
            sheet.paste(thumb, (image_x, image_y))
            draw.rectangle((x, y, x + CELL_W - 1, y + CELL_H - 1), outline="#777777")
            ordinal = page_start + offset + 1
            label = str(item["original_label"]).replace("_", " ")[:39]
            target = f"{item['canonical_crop']} / {item['health_state']}"
            draw.text((x + 6, y + IMAGE_H + 3), f"#{ordinal:03d}  {label}", fill="black", font=font)
            draw.text((x + 6, y + IMAGE_H + 23), target, fill="#004477", font=font)
            draw.text((x + 6, y + IMAGE_H + 43), str(item["source_dataset"]), fill="#555555", font=font)
            index.append(
                {
                    "ordinal": ordinal,
                    "id": item["id"],
                    "page": page_no,
                    "source_path": str(path),
                    "expected": target,
                    "original_label": item["original_label"],
                }
            )
        name = f"qa_sheet_{page_no:02d}.jpg"
        sheet.save(output / name, quality=92, subsampling=0)
    payload = {
        "version": f"qa-contact-sheets-{args.version}",
        "sample_sha256": hashlib.sha256(
            qa_path.read_bytes()
        ).hexdigest(),
        "items": index,
    }
    (output / "index.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Rendered {len(qa)} samples on {(len(qa) + COLS * ROWS - 1) // (COLS * ROWS)} sheets in {output}")


if __name__ == "__main__":
    main()
