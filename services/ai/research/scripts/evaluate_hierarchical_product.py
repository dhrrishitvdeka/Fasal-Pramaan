#!/usr/bin/env python3
"""Evaluate the selected ViT through the product's expected-crop hierarchy."""

from __future__ import annotations

import argparse
import hashlib
import json

import numpy as np
import torch
from sklearn.metrics import f1_score

from ml_common import (
    CLASSES,
    CLASS_TO_INDEX,
    REPORTS,
    ROOT,
    RUNS,
    classification_metrics,
    load_manifest,
    save_reliability_diagram,
    set_determinism,
)
from train_candidates import (
    FIXED_TEST_SOURCES,
    build_model,
    calibration_sample_weights,
    make_transforms,
    run_inference,
    softmax,
    temperature_scale,
)


CROPS = ["maize", "paddy", "potato", "wheat"]
INVALID = CLASS_TO_INDEX["invalid__ood"]


def expected_crop(row: dict[str, object]) -> str:
    crop = str(row["canonical_crop"])
    if crop in CROPS:
        return crop
    value = int(hashlib.sha256(f"expected:{row['id']}".encode()).hexdigest()[:8], 16)
    return CROPS[value % len(CROPS)]


def hierarchical_probabilities(
    rows: list[dict[str, object]],
    probabilities: np.ndarray,
    mismatch_threshold: float,
    confidence_threshold: float,
) -> np.ndarray:
    result = np.zeros_like(probabilities)
    for index, row in enumerate(rows):
        values = probabilities[index]
        crop_scores = {
            crop: float(
                values[CLASS_TO_INDEX[f"{crop}__healthy"]]
                + values[CLASS_TO_INDEX[f"{crop}__disease"]]
            )
            for crop in CROPS
        }
        predicted_crop = max(CROPS, key=crop_scores.get)  # type: ignore[arg-type]
        expected = expected_crop(row)
        if predicted_crop != expected and crop_scores[predicted_crop] >= mismatch_threshold:
            result[index, INVALID] = 1.0
            continue
        allowed = [
            CLASS_TO_INDEX[f"{expected}__healthy"],
            CLASS_TO_INDEX[f"{expected}__disease"],
            INVALID,
        ]
        restricted = values[allowed]
        restricted = restricted / max(float(restricted.sum()), 1e-12)
        if float(restricted.max()) < confidence_threshold:
            result[index, INVALID] = 1.0
        else:
            result[index, allowed] = restricted
    return result


def fit_thresholds(
    rows: list[dict[str, object]], probabilities: np.ndarray, targets: np.ndarray
) -> dict[str, object]:
    invalid_mask = targets == INVALID
    id_mask = ~invalid_mask
    candidates: list[dict[str, float]] = []
    for mismatch in np.arange(0.4, 0.901, 0.05):
        for confidence in np.arange(0.0, 0.951, 0.05):
            operational = hierarchical_probabilities(
                rows, probabilities, float(mismatch), float(confidence)
            )
            predictions = operational.argmax(1)
            ood_recall = float((predictions[invalid_mask] == INVALID).mean())
            id_coverage = float((predictions[id_mask] != INVALID).mean())
            macro = float(
                f1_score(
                    targets,
                    predictions,
                    labels=range(len(CLASSES)),
                    average="macro",
                    zero_division=0,
                )
            )
            shortfall = max(0.0, 0.80 - ood_recall) + max(0.0, 0.70 - id_coverage)
            candidates.append(
                {
                    "mismatch_threshold": float(mismatch),
                    "confidence_threshold": float(confidence),
                    "invalid_ood_recall": ood_recall,
                    "id_coverage": id_coverage,
                    "macro_f1": macro,
                    "constraint_shortfall": shortfall,
                }
            )
    feasible = [item for item in candidates if item["constraint_shortfall"] == 0.0]
    if feasible:
        best_macro = max(item["macro_f1"] for item in feasible)
        tied = [
            item for item in feasible
            if abs(item["macro_f1"] - best_macro) <= 1e-12
        ]
        selected = max(
            tied,
            key=lambda item: (
                item["mismatch_threshold"],
                -item["confidence_threshold"],
            ),
        )
        status = "constraints_feasible"
    else:
        selected = min(
            candidates,
            key=lambda item: (
                item["constraint_shortfall"],
                -item["macro_f1"],
                -item["mismatch_threshold"],
                item["confidence_threshold"],
            ),
        )
        status = "constraints_infeasible_minimum_shortfall"
    return {
        **selected,
        "selection_status": status,
        "exact_tie_break": "highest_mismatch_then_lowest_confidence",
        "numeric_tolerance": 1e-12,
    }


def fixed_threshold_metrics(
    rows: list[dict[str, object]],
    probabilities: np.ndarray,
    targets: np.ndarray,
    mismatch: float,
    confidence: float,
) -> dict[str, object]:
    operational = hierarchical_probabilities(
        rows, probabilities, mismatch, confidence
    )
    predictions = operational.argmax(1)
    invalid_mask = targets == INVALID
    id_mask = ~invalid_mask
    return {
        "mismatch_threshold": mismatch,
        "confidence_threshold": confidence,
        "invalid_ood_recall": float((predictions[invalid_mask] == INVALID).mean()),
        "id_coverage": float((predictions[id_mask] != INVALID).mean()),
        "macro_f1": float(
            f1_score(
                targets,
                predictions,
                labels=range(len(CLASSES)),
                average="macro",
                zero_division=0,
            )
        ),
        "selection_status": "preexisting_fixed_product_thresholds",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-id", default="vit_tiny_full_data_v2")
    parser.add_argument("--contract", default="hierarchical_contract_v1.json")
    parser.add_argument("--report-version", default="v1")
    parser.add_argument("--validation-only", action="store_true")
    args = parser.parse_args()
    set_determinism()
    checkpoint_path = RUNS / args.model_id / "best.pt"
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    experiment = checkpoint["experiment"]
    model_config = experiment["models"][0]
    model, _ = build_model(model_config)
    model.load_state_dict(checkpoint["model_state_dict"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device).eval()
    _, evaluate = make_transforms(experiment)
    contract = json.loads(
        (ROOT / "config" / args.contract).read_text(encoding="utf-8")
    )
    manifest_filename = experiment.get("manifest_filename", "manifest_v1.jsonl")
    validation_rows = load_manifest("validation", manifest_filename)
    test_rows = load_manifest("test", manifest_filename)
    validation_logits, validation_targets = run_inference(
        model, validation_rows, evaluate, device, "hierarchical validation"
    )
    calibration_weights, calibration_policy = calibration_sample_weights(
        validation_rows, experiment["training"]
    )
    temperature = temperature_scale(
        validation_logits,
        validation_targets,
        calibration_weights,
        float(experiment["training"].get("minimum_temperature", 0.05)),
    )
    validation_probabilities = softmax(validation_logits, temperature)
    if contract.get("fixed_thresholds"):
        fixed = contract["fixed_thresholds"]
        thresholds = fixed_threshold_metrics(
            validation_rows,
            validation_probabilities,
            validation_targets,
            float(fixed["mismatch_threshold"]),
            float(fixed["confidence_threshold"]),
        )
    else:
        thresholds = fit_thresholds(
            validation_rows, validation_probabilities, validation_targets
        )
    if args.validation_only:
        validation_operational = hierarchical_probabilities(
            validation_rows,
            validation_probabilities,
            float(thresholds["mismatch_threshold"]),
            float(thresholds["confidence_threshold"]),
        )
        validation_metrics = classification_metrics(
            validation_rows, validation_targets, validation_operational
        )
        payload = {
            "version": "hierarchical-validation-only-v1",
            "base_model": args.model_id,
            "contract": contract,
            "temperature": temperature,
            "thresholds": thresholds,
            "validation_metrics": validation_metrics,
            "frozen_test_evaluated": False,
            "is_production_validated": False,
        }
        output = REPORTS / f"hierarchical_validation_only_{args.report_version}.json"
        output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(payload, indent=2))
        return
    test_logits, test_targets = run_inference(
        model, test_rows, evaluate, device, "hierarchical frozen test"
    )
    calibrated = softmax(test_logits, temperature)
    operational = hierarchical_probabilities(
        test_rows,
        calibrated,
        float(thresholds["mismatch_threshold"]),
        float(thresholds["confidence_threshold"]),
    )
    metrics = classification_metrics(test_rows, test_targets, operational)
    calibration = classification_metrics(test_rows, test_targets, calibrated)
    metrics["pre_decision_expected_calibration_error_15_bins"] = calibration[
        "expected_calibration_error_15_bins"
    ]
    external_mask = np.array(
        [row["source_dataset"] in FIXED_TEST_SOURCES for row in test_rows]
    )
    metrics["external_field_macro_f1_present_classes"] = float(
        f1_score(
            test_targets[external_mask],
            operational[external_mask].argmax(1),
            average="macro",
            zero_division=0,
        )
    )
    report = {
        "version": f"hierarchical-product-evaluation-{args.report_version}",
        "base_model": args.model_id,
        "contract": contract,
        "temperature": temperature,
        "calibration_policy": calibration_policy,
        "validation_selected_thresholds": thresholds,
        "metrics": metrics,
        "expected_crop_assumption": (
            "Supported test rows use their recorded crop as trusted cycle metadata. OOD rows use the "
            "pre-frozen deterministic balanced simulation. Results are not valid when expected crop metadata is absent or wrong."
        ),
        "is_production_validated": False,
    }
    output = REPORTS / f"hierarchical_product_evaluation_{args.report_version}.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    save_reliability_diagram(
        calibration,
        REPORTS / f"hierarchical_predecision_reliability_{args.report_version}.png",
        "Selected ViT calibrated probabilities before hierarchical decision",
    )
    print(
        json.dumps(
            {
                "temperature": temperature,
                "thresholds": thresholds,
                "macro_f1": metrics["macro_f1"],
                "balanced_accuracy": metrics["balanced_accuracy"],
                "ood_recall": metrics["invalid_ood_rejection_recall"],
                "id_coverage": metrics["id_coverage"],
                "external_field_macro_f1": metrics[
                    "external_field_macro_f1_present_classes"
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
