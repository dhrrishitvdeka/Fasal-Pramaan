#!/usr/bin/env python3
"""Evaluate the shipped plant_disease adapter on a labelled ImageFolder val set.

Drives PlantDiseaseAdapter (same checkpoint as /v1/analyze), not a reimplemented classifier.

Usage (from services/ai):
  python scripts/evaluate_checkpoint.py --data datasets/plantvillage_subset --split val
  python scripts/evaluate_checkpoint.py --adapter hierarchical --limit 30

Writes JSON report (measured metrics only). Always is_production_validated: false.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _image_to_b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def _class_to_crop(class_name: str) -> str:
    head = class_name.split("___")[0]
    mapping = {
        "Apple": "apple",
        "Corn_(maize)": "maize",
        "Potato": "potato",
        "Tomato": "tomato",
    }
    return mapping.get(head, head.lower().replace(" ", "_"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate shipped AI adapter on labelled images")
    parser.add_argument("--data", default="datasets/plantvillage_subset")
    parser.add_argument("--split", default="val", choices=("val", "train"))
    parser.add_argument("--adapter", default="plant_disease", help="plant_disease|hierarchical|mock")
    parser.add_argument("--limit", type=int, default=0, help="Max images (0 = all)")
    parser.add_argument(
        "--output",
        default="models/plant_disease/live_eval_report.json",
        help="Where to write measured report",
    )
    args = parser.parse_args()

    data_root = ROOT / args.data / args.split
    if not data_root.is_dir():
        raise SystemExit(f"Missing labelled split: {data_root}")

    from app.adapters import get_adapter
    from app.adapters.plant_disease import PlantDiseaseAdapter

    adapter = get_adapter(args.adapter)
    adapter_type = getattr(adapter, "adapter_type", args.adapter)
    pd_available = PlantDiseaseAdapter().available()

    # Collect (path, folder_class_label)
    samples: list[tuple[Path, str]] = []
    for class_dir in sorted(p for p in data_root.iterdir() if p.is_dir()):
        for img_path in sorted(class_dir.glob("*.jpg")) + sorted(class_dir.glob("*.JPG")):
            samples.append((img_path, class_dir.name))
            if args.limit and len(samples) >= args.limit:
                break
        if args.limit and len(samples) >= args.limit:
            break

    if not samples:
        raise SystemExit(f"No images under {data_root}")

    correct = 0
    total = 0
    per_class: dict[str, dict[str, int]] = defaultdict(lambda: {"correct": 0, "total": 0})
    damage_map_hits = 0
    backends_seen: set[str] = set()
    t0 = time.perf_counter()

    for path, true_class in samples:
        b64 = _image_to_b64(path)
        crop = _class_to_crop(true_class)
        req = {
            "submission_id": f"eval-{path.stem}",
            "expected_crop": crop,
            "images": [
                {
                    "image_id": path.name,
                    "angle_type": "closeup_damage",
                    "image_bytes": b64,
                    "byte_size": path.stat().st_size,
                    "label": true_class,
                }
            ],
            "adapter": args.adapter,
        }
        result = adapter.analyze(req)
        backends_seen.add(str(result.get("adapter_type") or adapter_type))
        if result.get("pipeline"):
            for st in result["pipeline"].get("stages") or []:
                if st.get("backend"):
                    backends_seen.add(str(st["backend"]))

        # Prefer exact PlantVillage class from shipped adapter fields
        expl = result.get("explanation") or {}
        pred_class = (
            result.get("plant_disease_class")
            or expl.get("primary_class")
            or expl.get("top_class")
            or expl.get("predicted_class")
        )
        per_imgs = expl.get("per_image") or expl.get("images") or []
        if not pred_class and per_imgs and isinstance(per_imgs, list):
            pred_class = (
                per_imgs[0].get("predicted_class")
                or per_imgs[0].get("class_name")
                or pred_class
            )

        total += 1
        per_class[true_class]["total"] += 1
        hit = False
        if pred_class and pred_class == true_class:
            hit = True
        elif not pred_class:
            # Damage-category proxy only when class label not returned (honest secondary metric)
            mapped = PlantDiseaseAdapter()._map_damage(true_class)
            if result.get("primary_damage") == mapped:
                hit = True
                damage_map_hits += 1
        if hit:
            correct += 1
            per_class[true_class]["correct"] += 1

    elapsed = time.perf_counter() - t0
    accuracy = correct / total if total else 0.0
    report = {
        "disclaimer": (
            "Measured on public/in-repo PlantVillage-named subset via shipped adapter path. "
            "NOT production-validated for insurance or PMFBY. Lab leaf photos ≠ Indian field multi-peril."
        ),
        "is_production_validated": False,
        "adapter_requested": args.adapter,
        "adapter_type_observed": sorted(backends_seen),
        "plant_disease_checkpoint_available": pd_available,
        "data_root": str(data_root.relative_to(ROOT)),
        "split": args.split,
        "num_images": total,
        "top1_class_accuracy": round(accuracy, 4),
        "correct": correct,
        "damage_map_proxy_hits": damage_map_hits,
        "per_class": {
            k: {
                "correct": v["correct"],
                "total": v["total"],
                "accuracy": round(v["correct"] / v["total"], 4) if v["total"] else 0.0,
            }
            for k, v in sorted(per_class.items())
        },
        "elapsed_seconds": round(elapsed, 2),
        "vit_note": (
            "HF ViT (wambugu71/crop_leaf_diseases_vit) is optional via AI_ENABLE_HF_CROP_VIT; "
            "default hierarchical crop stage is heuristic when transformers/weights absent."
        ),
    }

    out = ROOT / args.output
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
