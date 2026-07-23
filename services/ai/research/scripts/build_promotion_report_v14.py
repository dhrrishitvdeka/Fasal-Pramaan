#!/usr/bin/env python3
"""Build the immutable gate-by-gate promotion report for DINOv2 v14."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"


def read(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    thresholds = read(ROOT / "config" / "promotion_thresholds_v1.json")
    gates = thresholds["gates"]
    baseline = read(REPORTS / "baseline_field_evaluation_v1.json")["metrics"]
    candidate = read(REPORTS / "conditioned_product_evaluation_v14.json")["metrics"]
    exported = read(REPORTS / "conditioned_onnx_export_v14.json")
    dataset_audit = read(REPORTS / "dataset_audit_v6.json")
    minimum_crop_recall = min(
        float(item["recall"]) for item in candidate["per_crop"].values()
    )
    values = {
        "macro_f1_min": candidate["macro_f1"],
        "macro_f1_improvement_over_baseline_min": (
            candidate["macro_f1"] - baseline["macro_f1"]
        ),
        "balanced_accuracy_min": candidate["balanced_accuracy"],
        "balanced_accuracy_improvement_over_baseline_min": (
            candidate["balanced_accuracy"] - baseline["balanced_accuracy"]
        ),
        "source_held_out_macro_f1_min": candidate[
            "external_field_macro_f1_present_classes"
        ],
        "minimum_per_crop_recall": minimum_crop_recall,
        "maximum_ece_after_calibration": candidate[
            "pre_decision_expected_calibration_error_15_bins"
        ],
        "minimum_ood_rejection_recall": candidate[
            "invalid_ood_rejection_recall"
        ],
        "minimum_id_coverage_at_ood_threshold": candidate["id_coverage"],
        "maximum_cpu_latency_p95_ms": exported["cpu_latency_p95_ms"],
        "maximum_onnx_size_bytes": exported["onnx_size_bytes"],
        "minimum_onnx_top1_parity": exported["onnx_top1_parity"],
        "maximum_onnx_probability_abs_error": exported[
            "maximum_probability_absolute_error"
        ],
    }
    maximum_gates = {
        "maximum_ece_after_calibration",
        "maximum_cpu_latency_p95_ms",
        "maximum_onnx_size_bytes",
        "maximum_onnx_probability_abs_error",
    }
    gate_results = {
        name: {
            "value": values[name],
            "threshold": threshold,
            "operator": "<=" if name in maximum_gates else ">=",
            "passed": (
                values[name] <= threshold
                if name in maximum_gates
                else values[name] >= threshold
            ),
        }
        for name, threshold in gates.items()
    }
    checks = {
        "dataset_audit_v6_passed": dataset_audit["passed"] is True,
        "frozen_test_hash_exact": (
            dataset_audit["frozen_test_ids_sha256"]
            == "f00eadb9c0c82ce90cf368441007e4a2364d81a82180a9a011728558b1e1d083"
        ),
        "onnx_export_checks_passed": exported["passed"] is True,
        "all_numeric_promotion_gates_passed": all(
            item["passed"] for item in gate_results.values()
        ),
        "is_production_validated_remains_false": True,
        "human_review_remains_mandatory": True,
    }
    report = {
        "version": "crop-health-promotion-report-v14",
        "decision": "promote_to_default_local_mvp_adapter",
        "model_id": "dinov2_vits14_conditioned_finetune_v14",
        "baseline": {
            "model": "mobilenet_v2_legacy_15_class",
            "macro_f1": baseline["macro_f1"],
            "balanced_accuracy": baseline["balanced_accuracy"],
        },
        "candidate": {
            "macro_f1": candidate["macro_f1"],
            "balanced_accuracy": candidate["balanced_accuracy"],
            "source_held_out_field_macro_f1": candidate[
                "external_field_macro_f1_present_classes"
            ],
            "minimum_per_crop_recall": minimum_crop_recall,
            "invalid_ood_rejection_recall": candidate[
                "invalid_ood_rejection_recall"
            ],
            "id_coverage": candidate["id_coverage"],
            "pre_decision_ece_15_bins": candidate[
                "pre_decision_expected_calibration_error_15_bins"
            ],
        },
        "numeric_gates": gate_results,
        "checks": checks,
        "passed": all(checks.values()),
        "remaining_limit": (
            "Internal promotion does not constitute production validation. "
            "Independent protocol-matched field validation and governance review remain required."
        ),
        "is_production_validated": False,
    }
    target = REPORTS / "promotion_report_v14.json"
    target.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
