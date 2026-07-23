#!/usr/bin/env python3
"""Record a completed contact-sheet review without hand-editing every sample."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    parser.add_argument("--reviewer", required=True)
    parser.add_argument("--reviewed-at", required=True)
    parser.add_argument("--status", choices=("accepted", "rejected"), required=True)
    parser.add_argument("--notes", required=True)
    args = parser.parse_args()
    datetime.fromisoformat(args.reviewed_at)
    path = ROOT / f"qa_sample_{args.version}.json"
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not rows:
        raise RuntimeError("QA sample is empty")
    if any(row.get("qa_status") != "pending_manual_review" for row in rows):
        raise RuntimeError("QA sample contains a previously recorded decision")
    for row in rows:
        row.update(
            {
                "qa_status": args.status,
                "qa_notes": args.notes,
                "qa_reviewer": args.reviewer,
                "qa_reviewed_at": args.reviewed_at,
            }
        )
    path.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
    print(f"Recorded {args.status} for {len(rows)} rows in {path.name}")


if __name__ == "__main__":
    main()
