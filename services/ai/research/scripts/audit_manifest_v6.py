#!/usr/bin/env python3
"""Audit manifest v6 while treating every manifest-v5 row as immutable."""

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
REPORT = ROOT / "reports" / "dataset_audit_v6.json"
EXPECTED_NEW_ROWS = 6_102
EXPECTED_TEST_HASH = "f00eadb9c0c82ce90cf368441007e4a2364d81a82180a9a011728558b1e1d083"
EXPECTED_SOURCE_ROWS = {
    "riceleafbd_ccby": 1_451,
    "rice_field_weeds_ccby": 4_346,
    "potato_blight_sample_ccby": 305,
}


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


def main() -> int:
    base = load_jsonl(ROOT / "manifest_v5.jsonl")
    rows = load_jsonl(ROOT / "manifest_v6.jsonl")
    summary = json.loads((ROOT / "manifest_summary_v6.json").read_text(encoding="utf-8"))
    qa = json.loads((ROOT / "qa_sample_v6.json").read_text(encoding="utf-8"))
    sources_config = json.loads(
        (ROOT / "config" / "sources_v6.json").read_text(encoding="utf-8")
    )
    configs = {item["id"]: item for item in sources_config["added_sources"]}
    aggregate = json.loads(
        (ROOT / "field_expansion_download_lock_v4.json").read_text(encoding="utf-8")
    )
    aggregate_sources = {item["id"]: item for item in aggregate["sources"]}
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
    record("all_v5_rows_unchanged", not changed_base, changed_base[:20])
    new_rows = [row for row in rows if row["id"] not in base_by_id]
    record(
        "v6_is_strict_append_of_v5",
        len(rows) == len(base) + len(new_rows),
        {"v5_rows": len(base), "v6_rows": len(rows), "new_rows": len(new_rows)},
    )
    record(
        "new_row_count_matches_summary",
        len(new_rows) == summary["accepted_new_images"] == EXPECTED_NEW_ROWS,
        len(new_rows),
    )
    actual_source_rows = Counter(row["source_dataset"] for row in new_rows)
    record(
        "new_source_counts_exact",
        dict(actual_source_rows) == EXPECTED_SOURCE_ROWS,
        dict(sorted(actual_source_rows.items())),
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
        test_hash
        == EXPECTED_TEST_HASH
        == summary["frozen_test_ids_sha256"]
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
        "only_declared_sources_added",
        set(actual_source_rows) == set(configs) == set(aggregate_sources),
        sorted(actual_source_rows),
    )
    provenance_errors = []
    for row in new_rows:
        configured = configs[str(row["source_dataset"])]
        expected = {
            "license": configured["license"],
            "source_url": configured["source_url"],
            "source_revision": configured["doi"],
            "archive_sha256": configured["archive_sha256"],
        }
        for field, value in expected.items():
            if row.get(field) != value:
                provenance_errors.append(
                    {
                        "id": row["id"],
                        "field": field,
                        "actual": row.get(field),
                        "expected": value,
                    }
                )
    record("new_source_provenance_matches_config", not provenance_errors, provenance_errors[:20])

    local_lock_errors: list[str] = []
    archive_errors: list[str] = []
    metadata_errors: list[str] = []
    metadata_by_source: dict[str, list[dict[str, Any]]] = {}
    for source in sorted(configs):
        local_lock = json.loads(
            (RAW / source / "download_lock.json").read_text(encoding="utf-8")
        )
        aggregate_source = aggregate_sources[source]
        aggregate_without_id = {
            key: value for key, value in aggregate_source.items() if key != "id"
        }
        if aggregate_without_id != local_lock:
            local_lock_errors.append(source)
        configured = configs[source]
        for item in local_lock["files"]:
            archive_path = RAW / source / item["filename"]
            if not archive_path.is_file():
                archive_errors.append(f"{source}/{item['filename']}: missing")
            elif archive_path.stat().st_size != item["bytes"]:
                archive_errors.append(f"{source}/{item['filename']}: byte-size mismatch")
            elif file_sha256(archive_path) != item["sha256"]:
                archive_errors.append(f"{source}/{item['filename']}: SHA-256 mismatch")
            if item["sha256"] != configured["archive_sha256"]:
                archive_errors.append(f"{source}: source config SHA-256 mismatch")
        metadata_path = RAW / source / "metadata.jsonl"
        metadata = load_jsonl(metadata_path)
        metadata_by_source[source] = metadata
        if (
            len(metadata) != local_lock["rows"]
            or len({item["image_sha256"] for item in metadata})
            != local_lock["unique_image_sha256"]
            or file_sha256(metadata_path) != local_lock["metadata_sha256"]
        ):
            metadata_errors.append(source)
    record(
        "aggregate_and_local_download_locks_match",
        not local_lock_errors,
        local_lock_errors,
    )
    record("source_archives_match_download_locks", not archive_errors, archive_errors)
    record("metadata_matches_download_locks", not metadata_errors, metadata_errors)

    conflicting_health_hashes: list[str] = []
    for source, metadata in metadata_by_source.items():
        health_by_hash: dict[str, set[str]] = defaultdict(set)
        for item in metadata:
            health_by_hash[str(item["image_sha256"])].add(str(item["health_state"]))
        conflicting_health_hashes.extend(
            f"{source}:{digest}"
            for digest, health in health_by_hash.items()
            if len(health) > 1
        )
    record(
        "no_conflicting_exact_health_labels",
        not conflicting_health_hashes,
        conflicting_health_hashes[:20],
    )

    missing_originals: list[str] = []
    original_hash_errors: list[str] = []
    missing_cached: list[str] = []
    cached_hash_errors: list[str] = []
    cache_dimension_errors: list[str] = []
    for row in new_rows:
        original = RAW / row["source_dataset"] / row["original_path"]
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
    record(
        "cached_dimension_policy_declared",
        not cache_dimension_errors,
        cache_dimension_errors[:20],
    )

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
    license_errors = [
        source
        for source, config in configs.items()
        if config["license"] != "CC BY 4.0"
        or config["commercial_use"] is not True
        or json.loads(
            (RAW / source / "download_lock.json").read_text(encoding="utf-8")
        )["synthetic_or_augmented_images_included"]
    ]
    record("approved_commercial_licenses", not license_errors, license_errors)

    report = {
        "version": "dataset-audit-v6",
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
