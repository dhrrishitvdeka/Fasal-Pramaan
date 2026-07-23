#!/usr/bin/env python3
"""Audit provenance, licences, class coverage, and split leakage."""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config"
REPORTS = ROOT / "reports"
FIXED_TEST_SOURCES = {
    "maize_mld_ccby",
    "potato_field_ccby",
    "rice_field_ccby",
    "plantdoc_ccby",
}
SPLITS = {"train", "validation", "test"}
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


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def split_overlap(rows: list[dict[str, Any]], field: str) -> list[dict[str, Any]]:
    values: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        values[str(row[field])].add(row["split"])
    return [
        {field: value, "splits": sorted(splits)}
        for value, splits in values.items()
        if len(splits) > 1
    ]


def main() -> int:
    rows = [
        json.loads(line)
        for line in (ROOT / "manifest_v1.jsonl").read_text(encoding="utf-8").splitlines()
        if line
    ]
    sources_config = load_json(CONFIG / "sources_v1.json")
    source_meta = {item["id"]: item for item in sources_config["sources"]}
    lock = load_json(ROOT / "download_lock_v1.json")
    lock_meta = {item["id"]: item for item in lock["sources"]}
    taxonomy = load_json(CONFIG / "taxonomy_v1.json")
    expected_classes = set(taxonomy["model_classes"])
    qa = load_json(ROOT / "qa_sample_v1.json")

    checks: dict[str, dict[str, Any]] = {}

    def record(name: str, passed: bool, detail: Any) -> None:
        checks[name] = {"passed": bool(passed), "detail": detail}

    missing_fields = Counter()
    for row in rows:
        for field in REQUIRED_FIELDS - row.keys():
            missing_fields[field] += 1
    record("manifest_required_fields", not missing_fields, dict(missing_fields))
    record("unique_manifest_ids", len({row["id"] for row in rows}) == len(rows), len(rows))
    record("no_synthetic_images", not any(row["synthetic"] for row in rows), True)
    record("known_splits", {row["split"] for row in rows} == SPLITS, sorted(SPLITS))
    actual_classes = {row["model_class"] for row in rows}
    record(
        "taxonomy_exact",
        actual_classes == expected_classes,
        {"expected": sorted(expected_classes), "actual": sorted(actual_classes)},
    )
    class_split_counts = Counter((row["model_class"], row["split"]) for row in rows)
    missing_class_splits = [
        f"{model_class}:{split}"
        for model_class in sorted(expected_classes)
        for split in sorted(SPLITS)
        if class_split_counts[(model_class, split)] == 0
    ]
    record("every_class_in_every_split", not missing_class_splits, missing_class_splits)

    for field in ("image_sha256", "near_duplicate_cluster", "capture_group", "split_group"):
        overlap = split_overlap(rows, field)
        record(f"no_{field}_overlap", not overlap, overlap[:20])

    fixed_violations = [
        row["id"]
        for row in rows
        if row["source_dataset"] in FIXED_TEST_SOURCES and row["split"] != "test"
    ]
    record("fixed_sources_are_test_only", not fixed_violations, fixed_violations[:20])

    provenance_errors: list[dict[str, str]] = []
    for row in rows:
        source = row["source_dataset"]
        expected = source_meta.get(source)
        locked = lock_meta.get(source)
        if not expected or not locked:
            provenance_errors.append({"id": row["id"], "error": "source absent from config/lock"})
            continue
        for field in ("license", "source_url"):
            if row[field] != expected[field]:
                provenance_errors.append({"id": row["id"], "error": f"{field} mismatch"})
        if row["archive_sha256"] != locked["sha256"]:
            provenance_errors.append({"id": row["id"], "error": "archive sha256 mismatch"})
    record("provenance_matches_source_lock", not provenance_errors, provenance_errors[:20])

    used_sources = {row["source_dataset"] for row in rows}
    unlicensed = [
        source
        for source in sorted(used_sources)
        if source_meta[source].get("license") not in {"CC BY 4.0", "CC0 1.0"}
        or source_meta[source].get("commercial_use") is not True
    ]
    record("selected_data_has_approved_licence", not unlicensed, unlicensed)

    qa_counts = Counter(item["qa_status"] for item in qa)
    qa_complete = bool(qa) and not any(status.startswith("pending") for status in qa_counts)
    qa_rejected = sum(count for status, count in qa_counts.items() if status == "rejected")
    record(
        "manual_label_qa_complete",
        qa_complete,
        {"rows": len(qa), "statuses": dict(sorted(qa_counts.items())), "rejected": qa_rejected},
    )

    by_source = Counter(row["source_dataset"] for row in rows)
    report = {
        "version": "dataset-audit-v1",
        "manifest_rows": len(rows),
        "checks": checks,
        "passed": all(item["passed"] for item in checks.values()),
        "class_split_counts": {
            f"{model_class}:{split}": class_split_counts[(model_class, split)]
            for model_class in sorted(expected_classes)
            for split in sorted(SPLITS)
        },
        "source_counts": dict(sorted(by_source.items())),
        "is_production_validated": False,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "dataset_audit_v1.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )

    licence_lines = [
        "# Dataset licence and lineage report",
        "",
        "Raw images are downloaded locally and are not redistributed by this repository. "
        "Every selected source permits commercial use, but attribution obligations remain.",
        "",
        "| Source | Role | Images used | Licence | Revision / DOI | Source |",
        "|---|---:|---:|---|---|---|",
    ]
    for source in sorted(used_sources):
        item = source_meta[source]
        revision = item.get("pinned_revision") or item.get("doi") or "dataset version 1"
        licence_lines.append(
            f"| {item['dataset']} | {item['role']} | {by_source[source]} | "
            f"{item['license']} | `{revision}` | [upstream]({item['source_url']}) |"
        )
    isolated = source_meta["plantvillage_isolated"]
    licence_lines.extend(
        [
            "",
            "## Deliberately excluded source",
            "",
            f"PlantVillage ({isolated['license']}) is not downloaded or used in selected weights: "
            f"{isolated['isolation_reason']}",
            "",
            "## Product boundary",
            "",
            "These licences and this audit do not establish field efficacy. The model remains "
            "`is_production_validated=false` and requires independent field validation and governance review.",
        ]
    )
    (REPORTS / "LICENSE_REPORT.md").write_text("\n".join(licence_lines) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
