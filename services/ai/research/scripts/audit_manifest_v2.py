#!/usr/bin/env python3
"""Audit manifest v2 while treating manifest v1's test set as immutable."""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
REPORT = ROOT / "reports" / "dataset_audit_v2.json"
REQUIRED_FIELDS = {
    "id",
    "source_dataset",
    "source_url",
    "source_revision",
    "license",
    "archive_sha256",
    "original_path",
    "original_label",
    "canonical_crop",
    "canonical_disease",
    "health_state",
    "model_class",
    "invalid_category",
    "capture_group",
    "image_sha256",
    "phash",
    "perceptual_cluster",
    "embedding_cluster",
    "near_duplicate_cluster",
    "split_group",
    "split",
    "width",
    "height",
    "synthetic",
}


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def split_overlap(rows: list[dict[str, Any]], field: str) -> list[dict[str, Any]]:
    values: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        values[str(row[field])].add(str(row["split"]))
    return [
        {field: value, "splits": sorted(splits)}
        for value, splits in values.items()
        if len(splits) > 1
    ]


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    base = load_jsonl(ROOT / "manifest_v1.jsonl")
    rows = load_jsonl(ROOT / "manifest_v2.jsonl")
    qa = json.loads((ROOT / "qa_sample_v2.json").read_text(encoding="utf-8"))
    source_config = json.loads(
        (ROOT / "config" / "sources_v2.json").read_text(encoding="utf-8")
    )["added_sources"][0]
    lock = json.loads((ROOT / "digigreen_download_lock_v1.json").read_text(encoding="utf-8"))
    taxonomy = json.loads((ROOT / "config" / "taxonomy_v1.json").read_text(encoding="utf-8"))
    expected_classes = set(taxonomy["model_classes"])
    checks: dict[str, dict[str, Any]] = {}

    def record(name: str, passed: bool, detail: Any) -> None:
        checks[name] = {"passed": bool(passed), "detail": detail}

    missing = Counter()
    for row in rows:
        for field in REQUIRED_FIELDS - row.keys():
            missing[field] += 1
    record("manifest_required_fields", not missing, dict(missing))
    record("unique_manifest_ids", len({row["id"] for row in rows}) == len(rows), len(rows))
    record("no_synthetic_images", not any(row["synthetic"] for row in rows), True)
    record("known_splits", {row["split"] for row in rows} == {"train", "validation", "test"}, True)
    record("taxonomy_exact", {row["model_class"] for row in rows} == expected_classes, sorted(expected_classes))

    by_id = {row["id"]: row for row in rows}
    base_test = sorted((row for row in base if row["split"] == "test"), key=lambda row: row["id"])
    v2_test = sorted((row for row in rows if row["split"] == "test"), key=lambda row: row["id"])
    test_ids = [row["id"] for row in v2_test]
    test_hash = hashlib.sha256("\n".join(test_ids).encode()).hexdigest()
    record("frozen_test_ids_exact", [row["id"] for row in base_test] == test_ids, test_hash)
    record("frozen_test_rows_byte_equivalent", base_test == v2_test, len(v2_test))
    base_non_test_changed = [
        row["id"] for row in base if row["id"] not in by_id or by_id[row["id"]] != row
    ]
    record("all_v1_rows_unchanged", not base_non_test_changed, base_non_test_changed[:20])

    for field in ("image_sha256", "near_duplicate_cluster", "capture_group", "split_group"):
        overlap = split_overlap(rows, field)
        record(f"no_{field}_overlap", not overlap, overlap[:20])

    new_rows = [row for row in rows if row["source_dataset"] == "digigreen_ccby"]
    unexpected_sources = [
        row["id"] for row in rows if row["id"] not in {base_row["id"] for base_row in base}
        and row["source_dataset"] != "digigreen_ccby"
    ]
    record("only_declared_source_added", not unexpected_sources, unexpected_sources[:20])
    provenance_errors = []
    for row in new_rows:
        expected = {
            "license": source_config["license"],
            "source_url": source_config["source_url"],
            "source_revision": source_config["pinned_revision"],
            "archive_sha256": source_config["annotations_sha256"],
        }
        for field, value in expected.items():
            if row[field] != value:
                provenance_errors.append({"id": row["id"], "field": field})
    record("new_source_provenance_matches_lock", not provenance_errors, provenance_errors[:20])
    record(
        "download_lock_consistent",
        lock["downloaded_and_validated"] == len(new_rows)
        and lock["revision"] == source_config["pinned_revision"]
        and lock["annotations_sha256"] == source_config["annotations_sha256"]
        and not lock["failures"],
        {"locked_images": lock["downloaded_and_validated"], "manifest_images": len(new_rows)},
    )

    missing_images = []
    hash_errors = []
    dimension_errors = []
    for row in new_rows:
        path = RAW / row["source_dataset"] / row["original_path"]
        if not path.is_file():
            missing_images.append(row["id"])
            continue
        if file_sha256(path) != row["image_sha256"]:
            hash_errors.append(row["id"])
        if int(row["width"]) <= 0 or int(row["height"]) <= 0:
            dimension_errors.append(row["id"])
    record("new_images_exist", not missing_images, missing_images[:20])
    record("new_image_hashes_match", not hash_errors, hash_errors[:20])
    record("valid_image_dimensions", not dimension_errors, dimension_errors[:20])

    qa_ids = [item["id"] for item in qa]
    qa_statuses = Counter(item["qa_status"] for item in qa)
    record("qa_sample_ids_valid_and_unique", len(set(qa_ids)) == len(qa_ids) and all(value in by_id for value in qa_ids), len(qa_ids))
    record(
        "manual_label_qa_complete",
        bool(qa) and not any(status.startswith("pending") for status in qa_statuses),
        dict(sorted(qa_statuses.items())),
    )
    record(
        "approved_commercial_license",
        source_config["license"] == "CC BY 4.0" and source_config["commercial_use"] is True,
        source_config["license"],
    )

    report = {
        "version": "dataset-audit-v2",
        "manifest_rows": len(rows),
        "new_rows": len(new_rows),
        "frozen_test_rows": len(v2_test),
        "frozen_test_ids_sha256": test_hash,
        "checks": checks,
        "passed": all(item["passed"] for item in checks.values()),
        "counts_by_source": dict(sorted(Counter(row["source_dataset"] for row in rows).items())),
        "counts_by_class_split": {
            f"{model_class}:{split}": count
            for (model_class, split), count in sorted(
                Counter((row["model_class"], row["split"]) for row in rows).items()
            )
        },
        "is_production_validated": False,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
