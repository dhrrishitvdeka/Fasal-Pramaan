#!/usr/bin/env python3
"""Validation-only sensitivity analysis for hierarchical thresholds."""

from __future__ import annotations

import json

import numpy as np
import torch
from sklearn.metrics import f1_score

from evaluate_hierarchical_product import hierarchical_probabilities
from ml_common import REPORTS, RUNS, load_manifest, set_determinism
from train_candidates import (
    build_model,
    make_transforms,
    run_inference,
    softmax,
    temperature_scale,
)


def main() -> None:
    set_determinism()
    checkpoint = torch.load(
        RUNS / "vit_tiny_crop_aware_v3" / "best.pt",
        map_location="cpu",
        weights_only=False,
    )
    experiment = checkpoint["experiment"]
    model, _ = build_model(experiment["models"][0])
    model.load_state_dict(checkpoint["model_state_dict"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    _, transform = make_transforms(experiment)
    rows = load_manifest("validation")
    logits, targets = run_inference(
        model, rows, transform, device, "v3 validation threshold sensitivity"
    )
    temperature = temperature_scale(logits, targets)
    probabilities = softmax(logits, temperature)
    invalid = targets == 8
    candidates = []
    for mismatch in np.arange(0.4, 0.901, 0.05):
        for confidence in np.arange(0.0, 0.951, 0.05):
            output = hierarchical_probabilities(
                rows, probabilities, float(mismatch), float(confidence)
            )
            predicted = output.argmax(1)
            item = {
                "macro_f1": float(
                    f1_score(
                        targets,
                        predicted,
                        labels=range(9),
                        average="macro",
                        zero_division=0,
                    )
                ),
                "invalid_ood_recall": float((predicted[invalid] == 8).mean()),
                "id_coverage": float((predicted[~invalid] != 8).mean()),
                "mismatch_threshold": float(mismatch),
                "confidence_threshold": float(confidence),
            }
            if item["invalid_ood_recall"] >= 0.80 and item["id_coverage"] >= 0.70:
                candidates.append(item)
    best = max(item["macro_f1"] for item in candidates)
    near = [item for item in candidates if item["macro_f1"] >= best - 0.002]
    report = {
        "version": "hierarchical-validation-sensitivity-v1",
        "temperature": temperature,
        "feasible_candidates": len(candidates),
        "best_validation_macro_f1": best,
        "near_optimal_tolerance": 0.002,
        "near_optimal_candidates": sorted(
            near,
            key=lambda item: (-item["mismatch_threshold"], -item["macro_f1"]),
        ),
        "is_production_validated": False,
    }
    (REPORTS / "hierarchical_validation_sensitivity_v1.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
