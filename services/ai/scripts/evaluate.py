#!/usr/bin/env python3
"""Evaluation scaffold — writes a sample report template only."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--predictions", required=False, default=None)
    parser.add_argument("--output", default="models/sample_eval_report.json")
    args = parser.parse_args()

    report = {
        "disclaimer": "Sample evaluation report template. Metrics below are placeholders structure only — not measured accuracy.",
        "metrics_schema": {
            "accuracy": None,
            "macro_f1": None,
            "per_class_recall": {},
            "notes": "Populate after running evaluation on a held-out labelled set.",
        },
        "is_production_validated": False,
    }
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
