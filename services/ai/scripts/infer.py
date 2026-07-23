#!/usr/bin/env python3
"""CLI inference against the local AI HTTP service or in-process adapter."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.adapters import get_adapter  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--submission-id", default="cli-demo")
    parser.add_argument("--crop", default="soybean")
    parser.add_argument("--adapter", default="mock")
    args = parser.parse_args()
    adapter = get_adapter(args.adapter)
    result = adapter.analyze(
        {
            "submission_id": args.submission_id,
            "expected_crop": args.crop,
            "images": [{"angle_type": "wide_field", "byte_size": 100000}],
            "metadata": {},
        }
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
