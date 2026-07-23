#!/usr/bin/env python3
"""Audit manifest v4 while treating every manifest-v3 row as immutable."""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from audit_manifest_v3 import REQUIRED_FIELDS


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
REPORT = ROOT / "reports" / "dataset_audit_v4.json"
NEW_SOURCES = {"potato_ethiopia_ccby", "maize_seasonal_ccby"}
EXPECTED_NEW_ROWS = 2766
EXPECTED_TEST_HASH = "f00eadb9c0c82ce90cf368441007e4a2364d81a82180a9a011728558b1e1d083"


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def split_overlap(rows: list[dict[str, Any]], field: str) -> list[dict[str, Any]]:
    values: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        values[str(row[field])].add(str(row["split"]))
    return [
        {field: value, "splits": sorted(splits)}
        for value, splits in values.items()
        if len(splits) > 1
    ]


def main() -> int:
    base = load_jsonl(ROOT / "manifest_v3.jsonl")
    rows = load_jsonl(ROOT / "manifest_v4.jsonl")
    summary = json.loads((ROOT / "manifest_summary_v4.json").read_text(encoding="utf-8"))
    qa = json.loads((ROOT / "qa_sample_v4.json").read_text(encoding="utf-8"))
    sources = json.loads(
        (ROOT / "config" / "sources_v4.json").read_text(encoding="utf-8")
    )
    configured = {item["id"]: item for item in sources["added_sources"]}
    aggregate_lock = json.loads(
        (ROOT / "field_expansion_download_lock_v2.json").read_text(encoding="utf-8")
    )
    locked = {item["id"]: item for item in aggregate_lock["sources"]}
    taxonomy = json.loads(
        (ROOT / "config" / "taxonomy_v1.json").read_text(encoding="utf-8")
    )
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
    record(
        "known_splits",
        {row["split"] for row in rows} == {"train", "validation", "test"},
        sorted({row["split"] for row in rows}),
    )
    record(
        "taxonomy_exact",
        {row["model_class"] for row in rows} == set(taxonomy["model_classes"]),
        sorted({row["model_class"] for row in rows}),
    )

    by_id = {row["id"]: row for row in rows}
    base_by_id = {row["id"]: row for row in base}
    changed_base = [
        row["id"] for row in base if row["id"] not in by_id or by_id[row["id"]] != row
    ]
    record("all_v3_rows_unchanged", not changed_base, changed_base[:20])
    new_rows = [row for row in rows if row["id"] not in base_by_id]
    record(
        "v4_is_strict_append_of_v3",
        len(rows) == len(base) + len(new_rows),
        {"v3_rows": len(base), "v4_rows": len(rows), "new_rows": len(new_rows)},
    )
    record(
        "new_row_count_matches_summary",
        len(new_rows) == summary["accepted_new_images"] == EXPECTED_NEW_ROWS,
        len(new_rows),
    )

    base_test = sorted(
        (row for row in base if row["split"] == "test"), key=lambda row: row["id"]
    )
    test = sorted(
        (row for row in rows if row["split"] == "test"), key=lambda row: row["id"]
    )
    test_ids = [row["id"] for row in test]
    test_hash = hashlib.sha256("\n".join(test_ids).encode()).hexdigest()
    record(
        "frozen_test_ids_exact",
        test_hash == EXPECTED_TEST_HASH
        and test_hash == summary["frozen_test_ids_sha256"]
        and [row["id"] for row in base_test] == test_ids,
        test_hash,
    )
    record("frozen_test_rows_byte_equivalent", base_test == test, len(test))
    record(
        "no_new_rows_in_frozen_test",
        not any(row["id"] not in base_by_id for row in test),
        True,
    )

    for field in (
        "image_sha256",
        "near_duplicate_cluster",
        "capture_group",
        "split_group",
    ):
        overlap = split_overlap(rows, field)
        record(f"no_{field}_overlap", not overlap, overlap[:20])

    unexpected_sources = [
        row["id"] for row in new_rows if row["source_dataset"] not in NEW_SOURCES
    ]
    record("only_declared_sources_added", not unexpected_sources, unexpected_sources[:20])
    provenance_errors = []
    for row in new_rows:
        config = configured[row["source_dataset"]]
        expected = {
            "license": config["license"],
            "source_url": config["source_url"],
            "source_revision": config["doi"],
            "archive_sha256": config["archive_sha256"],
        }
        for field, value in expected.items():
            if row[field] != value:
                provenance_errors.append(
                    {"id": row["id"], "field": field, "actual": row[field], "expected": value}
                )
    record("new_source_provenance_matches_config", not provenance_errors, provenance_errors[:20])

    lock_errors = []
    for source_id in sorted(NEW_SOURCES):
        source_lock = locked[source_id]
        local_path = RAW / source_id / "download_lock.json"
        local = json.loads(local_path.read_text(encoding="utf-8"))
        if source_lock != {"id": source_id, **local}:
            lock_errors.append(f"{source_id}: aggregate and local lock mismatch")
        metadata = RAW / source_id / "metadata.jsonl"
        archive = RAW / source_id / source_lock["archive_name"]
        if file_sha256(metadata) != source_lock["metadata_sha256"]:
            lock_errors.append(f"{source_id}: metadata SHA-256 mismatch")
        if archive.stat().st_size != source_lock["archive_bytes"]:
            lock_errors.append(f"{source_id}: archive byte-size mismatch")
        if file_sha256(archive) != source_lock["archive_sha256"]:
            lock_errors.append(f"{source_id}: archive SHA-256 mismatch")
        if source_lock["archive_sha256"] != configured[source_id]["archive_sha256"]:
            lock_errors.append(f"{source_id}: configured archive SHA-256 mismatch")
        if not source_lock["only_original_images"] or source_lock[
            "synthetic_or_augmented_images_included"
        ]:
            lock_errors.append(f"{source_id}: synthetic/original-image policy mismatch")
    record("download_locks_consistent", not lock_errors, lock_errors)

    missing_images, hash_errors, dimension_errors = [], [], []
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
    new_ids = {row["id"] for row in new_rows}
    record(
        "qa_sample_ids_valid_unique_and_new",
        len(set(qa_ids)) == len(qa_ids)
        and all(value in new_ids for value in qa_ids)
        and len(qa_ids) == summary["qa_sample_rows"],
        len(qa_ids),
    )
    record(
        "manual_label_qa_complete",
        bool(qa)
        and not any(status.startswith("pending") for status in qa_statuses)
        and all(item.get("qa_reviewer") and item.get("qa_reviewed_at") for item in qa),
        dict(sorted(qa_statuses.items())),
    )
    record(
        "approved_commercial_licenses",
        all(
            item["license"] == "CC BY 4.0" and item["commercial_use"] is True
            for item in configured.values()
        ),
        {key: value["license"] for key, value in configured.items()},
    )

    report = {
        "version": "dataset-audit-v4",
        "manifest_rows": len(rows),
        "new_rows": len(new_rows),
        "frozen_test_rows": len(test),
        "frozen_test_ids_sha256": test_hash,
        "checks": checks,
        "passed": all(item["passed"] for item in checks.values()),
        "counts_by_source": dict(
            sorted(Counter(row["source_dataset"] for row in rows).items())
        ),
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
