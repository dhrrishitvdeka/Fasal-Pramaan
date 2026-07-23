#!/usr/bin/env python3
"""Training entrypoint placeholder for crop-damage fine-tuning.

Usage (after preparing a labelled dataset):
  python scripts/train.py --manifest datasets/manifest.json --output models/run-001

This script intentionally does not claim accuracy. Provide real labelled data
before any production evaluation.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="FasalPramaan model training scaffold")
    parser.add_argument("--manifest", required=True, help="Path to dataset manifest JSON")
    parser.add_argument("--output", required=True, help="Output directory for checkpoints")
    parser.add_argument("--epochs", type=int, default=10)
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        raise SystemExit(f"Manifest not found: {manifest_path}")

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    meta = {
        "status": "scaffold_only",
        "message": (
            "Training pipeline scaffold. Implement fine-tuning with PyTorch/ONNX "
            "using your labelled crop-damage dataset. Do not report fabricated metrics."
        ),
        "manifest": str(manifest_path),
        "epochs": args.epochs,
    }
    (out / "training_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
