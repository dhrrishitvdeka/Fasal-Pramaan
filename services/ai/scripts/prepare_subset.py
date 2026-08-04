#!/usr/bin/env python3
"""Create a tiny PlantVillage-style training subset with synthetic leaf images.

Uses legally safe generated images (no copyrighted photos). Class names follow
PlantVillage conventions so fine-tuned weights share the same label space as
public plant-disease literature.

Usage:
  python scripts/prepare_subset.py --out datasets/plantvillage_subset --per-class 24
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


def _load_classes(labels_path: Path) -> list[str]:
    data = json.loads(labels_path.read_text(encoding="utf-8"))
    return list(data["classes"])


def _leaf_image(seed: int, disease: bool, hue: tuple[int, int, int]) -> Image.Image:
    rng = random.Random(seed)
    img = Image.new("RGB", (224, 224), (240, 248, 240))
    draw = ImageDraw.Draw(img)
    # background noise
    for _ in range(40):
        x, y = rng.randint(0, 223), rng.randint(0, 223)
        c = rng.randint(200, 245)
        draw.ellipse((x, y, x + 6, y + 6), fill=(c, c + 5, c))
    # leaf body
    base = hue if not disease else (
        max(20, hue[0] - 40),
        max(40, hue[1] - 20),
        max(20, hue[2]),
    )
    draw.ellipse((40, 30, 180, 200), fill=base)
    draw.ellipse((55, 45, 165, 185), fill=(
        min(255, base[0] + 20),
        min(255, base[1] + 25),
        min(255, base[2] + 10),
    ))
    # vein
    draw.line((112, 40, 112, 190), fill=(30, 80, 30), width=2)
    if disease:
        for _ in range(rng.randint(8, 18)):
            x, y = rng.randint(50, 170), rng.randint(40, 180)
            r = rng.randint(4, 12)
            spot = (
                rng.randint(40, 90),
                rng.randint(20, 60),
                rng.randint(10, 40),
            )
            draw.ellipse((x - r, y - r, x + r, y + r), fill=spot)
    img = img.filter(ImageFilter.SMOOTH)
    return img


def _crop_hue(class_name: str) -> tuple[int, int, int]:
    crop = class_name.split("___")[0]
    table = {
        "Apple": (70, 140, 50),
        "Corn_(maize)": (90, 160, 40),
        "Potato": (60, 130, 55),
        "Tomato": (50, 150, 60),
    }
    return table.get(crop, (70, 140, 50))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="datasets/plantvillage_subset")
    parser.add_argument("--per-class", type=int, default=24)
    parser.add_argument(
        "--labels",
        default="app/labels/plantvillage_subset.json",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    labels_path = root / args.labels
    out = root / args.out
    classes = _load_classes(labels_path)

    counts = {"train": 0, "val": 0}
    for ci, cls in enumerate(classes):
        healthy = cls.endswith("healthy")
        hue = _crop_hue(cls)
        n = args.per_class
        n_val = max(2, n // 5)
        n_train = n - n_val
        for split, count in (("train", n_train), ("val", n_val)):
            d = out / split / cls
            d.mkdir(parents=True, exist_ok=True)
            for i in range(count):
                seed = ci * 10_000 + i + (0 if split == "train" else 5000)
                img = _leaf_image(seed, disease=not healthy, hue=hue)
                img.save(d / f"{cls.replace('/', '_')}_{split}_{i:03d}.jpg", quality=90)
                counts[split] += 1

    meta = {
        "classes": classes,
        "per_class": args.per_class,
        "counts": counts,
        "path": str(out),
        "note": "Synthetic PlantVillage-named subset for fine-tuning demos",
    }
    (out / "subset_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
