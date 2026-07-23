#!/usr/bin/env python3
"""Audit manifest v3 while treating every manifest-v2 row as immutable."""

from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
REPORT = ROOT / "reports" / "dataset_audit_v3.json"
NEW_SOURCES = {"potato_uncontrolled_ccby", "ricey_field_ccby"}
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
    base = load_jsonl(ROOT / "manifest_v2.jsonl")
    rows = load_jsonl(ROOT / "manifest_v3.jsonl")
    summary = json.loads((ROOT / "manifest_summary_v3.json").read_text(encoding="utf-8"))
    qa = json.loads((ROOT / "qa_sample_v3.json").read_text(encoding="utf-8"))
    source_config = json.loads(
        (ROOT / "config" / "sources_v3.json").read_text(encoding="utf-8")
    )
    configured_sources = {
        item["id"]: item for item in source_config["added_sources"]
    }
    lock = json.loads(
        (ROOT / "field_expansion_download_lock_v1.json").read_text(encoding="utf-8")
    )
    locked_sources = {item["id"]: item for item in lock["sources"]}
    taxonomy = json.loads(
        (ROOT / "config" / "taxonomy_v1.json").read_text(encoding="utf-8")
    )
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
    record(
        "known_splits",
        {row["split"] for row in rows} == {"train", "validation", "test"},
        sorted({row["split"] for row in rows}),
    )
    record(
        "taxonomy_exact",
        {row["model_class"] for row in rows} == expected_classes,
        sorted(expected_classes),
    )

    by_id = {row["id"]: row for row in rows}
    base_by_id = {row["id"]: row for row in base}
    changed_base = [
        row["id"] for row in base if row["id"] not in by_id or by_id[row["id"]] != row
    ]
    record("all_v2_rows_unchanged", not changed_base, changed_base[:20])
    record(
        "v3_is_strict_append_of_v2",
        len(rows) == len(base) + summary["accepted_new_images"],
        {"v2_rows": len(base), "v3_rows": len(rows)},
    )

    base_test = sorted(
        (row for row in base if row["split"] == "test"), key=lambda row: row["id"]
    )
    v3_test = sorted(
        (row for row in rows if row["split"] == "test"), key=lambda row: row["id"]
    )
    test_ids = [row["id"] for row in v3_test]
    test_hash = hashlib.sha256("\n".join(test_ids).encode()).hexdigest()
    record(
        "frozen_test_ids_exact",
        [row["id"] for row in base_test] == test_ids
        and test_hash == summary["frozen_test_ids_sha256"],
        test_hash,
    )
    record("frozen_test_rows_byte_equivalent", base_test == v3_test, len(v3_test))
    record(
        "no_new_rows_in_frozen_test",
        not any(row["id"] not in base_by_id for row in v3_test),
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

    new_rows = [row for row in rows if row["id"] not in base_by_id]
    unexpected_sources = [
        row["id"] for row in new_rows if row["source_dataset"] not in NEW_SOURCES
    ]
    record("only_declared_sources_added", not unexpected_sources, unexpected_sources[:20])
    record(
        "new_row_count_matches_summary",
        len(new_rows) == summary["accepted_new_images"] == 4672,
        len(new_rows),
    )

    provenance_errors = []
    for row in new_rows:
        config = configured_sources[row["source_dataset"]]
        expected_revision = (
            config["pinned_revision"]
            if row["source_dataset"] == "potato_uncontrolled_ccby"
            else config["doi"]
        )
        expected_archive = config.get(
            "source_package_sha256", config.get("archive_sha256")
        )
        expected = {
            "license": config["license"],
            "source_url": config["source_url"],
            "source_revision": expected_revision,
            "archive_sha256": expected_archive,
        }
        for field, value in expected.items():
            if row[field] != value:
                provenance_errors.append(
                    {
                        "id": row["id"],
                        "field": field,
                        "actual": row[field],
                        "expected": value,
                    }
                )
    record(
        "new_source_provenance_matches_lock",
        not provenance_errors,
        provenance_errors[:20],
    )

    lock_errors = []
    for source_id in sorted(NEW_SOURCES):
        source_lock = locked_sources[source_id]
        source_cfg = configured_sources[source_id]
        metadata_path = RAW / source_id / "metadata.jsonl"
        local_lock_path = RAW / source_id / "download_lock.json"
        local_lock = json.loads(local_lock_path.read_text(encoding="utf-8"))
        common_lock_fields = {
            "dataset",
            "license",
            "source_url",
            "doi",
            "rows",
            "unique_image_sha256",
            "metadata_sha256",
        }
        for field in common_lock_fields:
            if source_lock.get(field) != local_lock.get(field):
                lock_errors.append(f"{source_id}: local lock mismatch for {field}")
        if file_sha256(metadata_path) != source_lock["metadata_sha256"]:
            lock_errors.append(f"{source_id}: metadata hash mismatch")
        if source_lock["license"] != source_cfg["license"]:
            lock_errors.append(f"{source_id}: license mismatch")
        if source_lock["source_url"] != source_cfg["source_url"]:
            lock_errors.append(f"{source_id}: URL mismatch")
        if source_id == "potato_uncontrolled_ccby":
            package_fingerprint = hashlib.sha256(
                "\n".join(item["sha256"] for item in source_lock["files"]).encode()
            ).hexdigest()
            if package_fingerprint != source_cfg["source_package_sha256"]:
                lock_errors.append(f"{source_id}: package fingerprint mismatch")
            if source_lock["revision"] != local_lock["revision"]:
                lock_errors.append(f"{source_id}: local lock mismatch for revision")
            if source_lock["files"] != local_lock["files"]:
                lock_errors.append(f"{source_id}: local lock mismatch for files")
            for item in source_lock["files"]:
                parquet_path = RAW / source_id / "parquet" / item["filename"]
                if (
                    not parquet_path.is_file()
                    or parquet_path.stat().st_size != item["bytes"]
                    or file_sha256(parquet_path) != item["sha256"]
                ):
                    lock_errors.append(
                        f"{source_id}: parquet lock mismatch for {item['filename']}"
                    )
        else:
            archive_path = RAW / source_id / "Original Images.zip"
            if source_lock["dataset_version"] != local_lock["version"]:
                lock_errors.append(f"{source_id}: local lock mismatch for version")
            for field in ("archive_url", "archive_bytes", "archive_sha256"):
                if source_lock[field] != local_lock[field]:
                    lock_errors.append(f"{source_id}: local lock mismatch for {field}")
            if (
                not archive_path.is_file()
                or archive_path.stat().st_size != source_lock["archive_bytes"]
                or file_sha256(archive_path) != source_lock["archive_sha256"]
                or source_lock["archive_sha256"] != source_cfg["archive_sha256"]
            ):
                lock_errors.append(f"{source_id}: archive lock mismatch")
    record("download_locks_consistent", not lock_errors, lock_errors)

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
            for item in configured_sources.values()
        ),
        {key: value["license"] for key, value in configured_sources.items()},
    )

    report = {
        "version": "dataset-audit-v3",
        "manifest_rows": len(rows),
        "new_rows": len(new_rows),
        "frozen_test_rows": len(v3_test),
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
