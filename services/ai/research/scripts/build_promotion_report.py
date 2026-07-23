#!/usr/bin/env python3
"""Evaluate the strongest candidate against every pre-frozen promotion gate."""

from __future__ import annotations

import json

from ml_common import REPORTS, ROOT


def main() -> None:
    thresholds = json.loads(
        (ROOT / "config" / "promotion_thresholds_v1.json").read_text(encoding="utf-8")
    )["gates"]
    baseline = json.loads(
        (REPORTS / "baseline_field_evaluation_v1.json").read_text(encoding="utf-8")
    )["metrics"]
    candidate = json.loads(
        (REPORTS / "hierarchical_product_evaluation_v2.json").read_text(encoding="utf-8")
    )["metrics"]
    exported = json.loads(
        (REPORTS / "selected_vit_onnx_export_v1.json").read_text(encoding="utf-8")
    )
    minimum_crop_recall = min(
        float(values["recall"]) for values in candidate["per_crop"].values()
    )
    values = {
        "macro_f1_min": candidate["macro_f1"],
        "macro_f1_improvement_over_baseline_min": candidate["macro_f1"] - baseline["macro_f1"],
        "balanced_accuracy_min": candidate["balanced_accuracy"],
        "balanced_accuracy_improvement_over_baseline_min": candidate["balanced_accuracy"] - baseline["balanced_accuracy"],
        "source_held_out_macro_f1_min": candidate["external_field_macro_f1_present_classes"],
        "minimum_per_crop_recall": minimum_crop_recall,
        "maximum_ece_after_calibration": candidate["expected_calibration_error_15_bins"],
        "minimum_ood_rejection_recall": candidate["invalid_ood_rejection_recall"],
        "minimum_id_coverage_at_ood_threshold": candidate["id_coverage"],
        "maximum_cpu_latency_p95_ms": exported["cpu_latency_p95_ms"],
        "maximum_onnx_size_bytes": exported["onnx_size_bytes"],
        "minimum_onnx_top1_parity": exported["onnx_top1_parity"],
        "maximum_onnx_probability_abs_error": exported["maximum_probability_absolute_error"],
    }
    maximum_gates = {
        "maximum_ece_after_calibration",
        "maximum_cpu_latency_p95_ms",
        "maximum_onnx_size_bytes",
        "maximum_onnx_probability_abs_error",
    }
    gates = {}
    for name, threshold in thresholds.items():
        observed = float(values[name])
        passed = observed <= float(threshold) if name in maximum_gates else observed >= float(threshold)
        gates[name] = {"threshold": threshold, "observed": observed, "passed": passed}
    failed = [name for name, value in gates.items() if not value["passed"]]
    report = {
        "version": "promotion-decision-v1",
        "candidate": "vit_tiny_crop_aware_v3_with_expected_crop_hierarchy_v2",
        "decision": "not_promoted" if failed else "promoted_for_mvp_only",
        "failed_gates": failed,
        "gates": gates,
        "integration_status": "experimental_demo_adapter_only",
        "rollback_adapter": "crop_vit",
        "human_review_required": True,
        "is_production_validated": False,
    }
    (REPORTS / "promotion_decision_v1.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
