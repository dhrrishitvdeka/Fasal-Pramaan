#!/usr/bin/env python3
"""Audit manifest v5 while treating every manifest-v4 row as immutable."""

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
REPORT = ROOT / "reports" / "dataset_audit_v5.json"
SOURCE = "potato_pldd_up_ccby"
EXPECTED_NEW_ROWS = 15260
EXPECTED_TEST_HASH = "f00eadb9c0c82ce90cf368441007e4a2364d81a82180a9a011728558b1e1d083"
EXPECTED_ARCHIVE_SET_SHA = "aa45fc6e55f73edf71e8d77c13587d59c5cb2f7afdcedab86e1a800f4da703af"


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
        value = row.get(field)
        if value:
            values[str(value)].add(str(row["split"]))
    return [
        {field: value, "splits": sorted(splits)}
        for value, splits in values.items()
        if len(splits) > 1
    ]


def canonical_archive_set_sha(files: list[dict[str, Any]]) -> str:
    payload = "\n".join(f"{item['filename']}:{item['sha256']}" for item in files)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def main() -> int:
    base = load_jsonl(ROOT / "manifest_v4.jsonl")
    rows = load_jsonl(ROOT / "manifest_v5.jsonl")
    summary = json.loads((ROOT / "manifest_summary_v5.json").read_text(encoding="utf-8"))
    qa = json.loads((ROOT / "qa_sample_v5.json").read_text(encoding="utf-8"))
    sources = json.loads((ROOT / "config" / "sources_v5.json").read_text(encoding="utf-8"))
    configured = sources["added_sources"][0]
    aggregate_lock = json.loads(
        (ROOT / "field_expansion_download_lock_v3.json").read_text(encoding="utf-8")
    )
    aggregate_source = aggregate_lock["sources"][0]
    local_lock = json.loads(
        (RAW / SOURCE / "download_lock.json").read_text(encoding="utf-8")
    )
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
    record("all_v4_rows_unchanged", not changed_base, changed_base[:20])
    new_rows = [row for row in rows if row["id"] not in base_by_id]
    record(
        "v5_is_strict_append_of_v4",
        len(rows) == len(base) + len(new_rows),
        {"v4_rows": len(base), "v5_rows": len(rows), "new_rows": len(new_rows)},
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
        "cached_image_sha256",
        "near_duplicate_cluster",
        "capture_group",
        "split_group",
    ):
        overlap = split_overlap(rows, field)
        record(f"no_{field}_overlap", not overlap, overlap[:20])

    record(
        "only_declared_source_added",
        all(row["source_dataset"] == SOURCE for row in new_rows),
        sorted({row["source_dataset"] for row in new_rows}),
    )
    expected_provenance = {
        "license": configured["license"],
        "source_url": configured["source_url"],
        "source_revision": configured["doi"],
        "archive_sha256": configured["archive_set_sha256"],
    }
    provenance_errors = [
        {"id": row["id"], "field": field, "actual": row.get(field), "expected": value}
        for row in new_rows
        for field, value in expected_provenance.items()
        if row.get(field) != value
    ]
    record("new_source_provenance_matches_config", not provenance_errors, provenance_errors[:20])

    aggregate_without_extra = {
        key: value
        for key, value in aggregate_source.items()
        if key not in {"id", "archive_set_sha256"}
    }
    record(
        "aggregate_and_local_download_locks_match",
        aggregate_source["id"] == SOURCE and aggregate_without_extra == local_lock,
        SOURCE,
    )
    archive_set_sha = canonical_archive_set_sha(local_lock["files"])
    record(
        "archive_set_sha256_exact",
        archive_set_sha
        == EXPECTED_ARCHIVE_SET_SHA
        == configured["archive_set_sha256"]
        == aggregate_source["archive_set_sha256"],
        archive_set_sha,
    )
    archive_errors = []
    for item in local_lock["files"]:
        archive = RAW / SOURCE / item["filename"]
        if not archive.is_file():
            archive_errors.append(f"{item['filename']}: missing")
        elif archive.stat().st_size != item["bytes"]:
            archive_errors.append(f"{item['filename']}: byte-size mismatch")
        elif file_sha256(archive) != item["sha256"]:
            archive_errors.append(f"{item['filename']}: SHA-256 mismatch")
    record("source_archives_match_download_lock", not archive_errors, archive_errors)
    metadata_path = RAW / SOURCE / "metadata.jsonl"
    metadata = load_jsonl(metadata_path)
    record(
        "metadata_matches_download_lock",
        len(metadata) == local_lock["rows"]
        and len({item["image_sha256"] for item in metadata})
        == local_lock["unique_image_sha256"]
        and file_sha256(metadata_path) == local_lock["metadata_sha256"],
        {"rows": len(metadata), "unique_hashes": len({item["image_sha256"] for item in metadata})},
    )
    labels_by_hash: dict[str, set[str]] = defaultdict(set)
    for item in metadata:
        labels_by_hash[str(item["image_sha256"])].add(str(item["label"]))
    conflicting = {digest for digest, labels in labels_by_hash.items() if len(labels) > 1}
    manifest_hashes = {row["image_sha256"] for row in new_rows}
    record(
        "conflicting_exact_label_groups_excluded",
        len(conflicting) == 5
        and not conflicting.intersection(manifest_hashes)
        and summary["excluded_new_images"].get("conflicting_duplicate_health_labels") == 5,
        len(conflicting),
    )

    missing_originals, original_hash_errors = [], []
    missing_cached, cached_hash_errors, cache_dimension_errors = [], [], []
    for row in new_rows:
        original = RAW / SOURCE / row["original_path"]
        cached = ROOT / row["cached_relative_path"]
        if not original.is_file():
            missing_originals.append(row["id"])
        elif file_sha256(original) != row["image_sha256"]:
            original_hash_errors.append(row["id"])
        if not cached.is_file():
            missing_cached.append(row["id"])
        elif file_sha256(cached) != row["cached_image_sha256"]:
            cached_hash_errors.append(row["id"])
        if int(row["cached_max_dimension"]) != 512:
            cache_dimension_errors.append(row["id"])
    record("new_original_images_exist", not missing_originals, missing_originals[:20])
    record("new_original_hashes_match", not original_hash_errors, original_hash_errors[:20])
    record("new_cached_images_exist", not missing_cached, missing_cached[:20])
    record("new_cached_hashes_match", not cached_hash_errors, cached_hash_errors[:20])
    record("cached_dimension_policy_declared", not cache_dimension_errors, cache_dimension_errors[:20])

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
        "approved_commercial_license",
        configured["license"] == "CC BY 4.0"
        and configured["commercial_use"] is True
        and local_lock["only_original_images"]
        and not local_lock["synthetic_or_augmented_images_included"],
        configured["license"],
    )

    report = {
        "version": "dataset-audit-v5",
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
