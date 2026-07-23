#!/usr/bin/env python3
"""Recover a complete evaluation report from an interrupted saved candidate."""

from __future__ import annotations

import argparse
import json
import statistics
import time

import numpy as np
import torch
from sklearn.metrics import f1_score

from ml_common import (
    REPORTS,
    RUNS,
    classification_metrics,
    load_manifest,
    save_reliability_diagram,
    set_determinism,
    sha256_file,
)
from train_candidates import (
    FIXED_TEST_SOURCES,
    apply_abstention,
    build_model,
    calibration_sample_weights,
    fit_abstention_threshold,
    make_transforms,
    run_inference,
    softmax,
    temperature_scale,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("model_id")
    args = parser.parse_args()
    run_dir = RUNS / args.model_id
    checkpoint_path = run_dir / "best.pt"
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    experiment = checkpoint["experiment"]
    model_config = next(
        item for item in experiment["models"] if item["id"] == args.model_id
    )
    set_determinism(experiment["seed"])
    model, initialization = build_model(model_config)
    model.load_state_dict(checkpoint["model_state_dict"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device).eval()
    _, evaluate = make_transforms(experiment)
    manifest_filename = experiment.get("manifest_filename", "manifest_v1.jsonl")
    validation_rows = load_manifest("validation", manifest_filename)
    test_rows = load_manifest("test", manifest_filename)
    validation_logits, validation_targets = run_inference(
        model, validation_rows, evaluate, device, f"{args.model_id} recovery validation"
    )
    calibration_weights, _ = calibration_sample_weights(
        validation_rows, experiment["training"]
    )
    temperature = temperature_scale(
        validation_logits,
        validation_targets,
        calibration_weights,
        float(experiment["training"].get("minimum_temperature", 0.05)),
    )
    validation_probabilities = softmax(validation_logits, temperature)
    abstention = fit_abstention_threshold(validation_probabilities, validation_targets)
    test_logits, test_targets = run_inference(
        model, test_rows, evaluate, device, f"{args.model_id} recovery frozen test"
    )
    calibrated = softmax(test_logits, temperature)
    operational = apply_abstention(calibrated, abstention["threshold"])
    calibration_metrics = classification_metrics(test_rows, test_targets, calibrated)
    metrics = classification_metrics(test_rows, test_targets, operational)
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
    metrics["pre_abstention_calibration"] = {
        "expected_calibration_error_15_bins": calibration_metrics[
            "expected_calibration_error_15_bins"
        ],
        "macro_f1": calibration_metrics["macro_f1"],
    }
    cpu = model.to("cpu")
    sample = torch.zeros(1, 3, 224, 224)
    with torch.inference_mode():
        for _ in range(5):
            cpu(sample)
        latency = []
        for _ in range(30):
            started = time.perf_counter()
            cpu(sample)
            latency.append((time.perf_counter() - started) * 1000)
    latency.sort()
    metrics["cpu_latency_p50_ms"] = statistics.median(latency)
    metrics["cpu_latency_p95_ms"] = latency[28]
    metrics["model_size_bytes"] = checkpoint_path.stat().st_size
    metrics["checkpoint_sha256"] = sha256_file(checkpoint_path)
    report = {
        "version": "candidate-evaluation-recovered-v1",
        "model_id": args.model_id,
        "model_config": model_config,
        "initialization": initialization,
        "seed": experiment["seed"],
        "best_epoch": checkpoint["best_epoch"],
        "history": None,
        "history_status": "missing_due_to_interrupted_post-training_run; checkpoint is intact",
        "temperature": temperature,
        "abstention": abstention,
        "metrics": metrics,
        "checkpoint": str(checkpoint_path),
        "is_production_validated": False,
    }
    output_dir = REPORTS / "candidates"
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / f"{args.model_id}_evaluation_v1.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    save_reliability_diagram(
        calibration_metrics,
        output_dir / f"{args.model_id}_reliability_v1.png",
        f"{args.model_id} calibrated reliability",
    )
    np.savez_compressed(
        run_dir / "frozen_test_outputs.npz",
        logits=test_logits,
        targets=test_targets,
        ids=np.array([row["id"] for row in test_rows]),
    )
    print(
        json.dumps(
            {
                "model": args.model_id,
                "best_epoch": checkpoint["best_epoch"],
                "temperature": temperature,
                "abstention": abstention,
                "macro_f1": metrics["macro_f1"],
                "balanced_accuracy": metrics["balanced_accuracy"],
                "ood_recall": metrics["invalid_ood_rejection_recall"],
                "id_coverage": metrics["id_coverage"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
