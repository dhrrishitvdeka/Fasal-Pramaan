#!/usr/bin/env python3
"""Run the one frozen-test evaluation for a locked conditioned DINO model."""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import time

import numpy as np
import torch
from sklearn.metrics import f1_score

from ml_common import (
    CLASSES,
    REPORTS,
    ROOT,
    RUNS,
    classification_metrics,
    load_manifest,
    save_reliability_diagram,
    set_determinism,
    sha256_file,
)
from train_candidates import FIXED_TEST_SOURCES, apply_abstention, make_transforms, softmax
from train_conditioned_dino import build_conditioned_model, run_inference


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", default="conditioned_contract_v12.json")
    parser.add_argument("--report-version", default="v12")
    args = parser.parse_args()
    set_determinism()
    contract_path = ROOT / "config" / args.contract
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    checkpoint_path = ROOT / str(contract["checkpoint"])
    config_path = ROOT / "config" / str(contract["training_config"])
    if sha256_file(checkpoint_path) != contract["checkpoint_sha256"]:
        raise RuntimeError("conditioned checkpoint hash differs from frozen contract")
    if sha256_file(config_path) != contract["training_config_sha256"]:
        raise RuntimeError("conditioned training config hash differs from frozen contract")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    manifest_path = ROOT / str(contract["manifest"])
    if sha256_file(manifest_path) != contract["manifest_sha256"]:
        raise RuntimeError("manifest hash differs from frozen contract")
    test_rows = load_manifest("test", str(contract["manifest"]))
    test_hash = hashlib.sha256(
        "\n".join(row["id"] for row in test_rows).encode()
    ).hexdigest()
    if test_hash != contract["frozen_test_ids_sha256"]:
        raise RuntimeError("frozen-test ID hash differs from contract")

    base_checkpoint = ROOT / str(config["model"]["base_checkpoint"])
    model, initialization = build_conditioned_model(
        str(config["model"]["base_model_id"]), base_checkpoint
    )
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device).eval()
    _, evaluate = make_transforms(config)
    logits, targets = run_inference(
        model,
        test_rows,
        evaluate,
        device,
        f"conditioned {args.report_version} frozen test",
        int(config["training"]["evaluation_batch_size"]),
        int(config["training"]["dataloader_workers"]),
    )
    calibrated = softmax(logits, float(contract["temperature"]))
    operational = apply_abstention(
        calibrated, float(contract["abstention_threshold"])
    )
    metrics = classification_metrics(test_rows, targets, operational)
    calibration = classification_metrics(test_rows, targets, calibrated)
    metrics["pre_decision_expected_calibration_error_15_bins"] = calibration[
        "expected_calibration_error_15_bins"
    ]
    metrics["pre_decision_macro_f1"] = calibration["macro_f1"]
    external_mask = np.array(
        [row["source_dataset"] in FIXED_TEST_SOURCES for row in test_rows]
    )
    metrics["external_field_macro_f1_present_classes"] = float(
        f1_score(
            targets[external_mask],
            operational[external_mask].argmax(1),
            average="macro",
            zero_division=0,
        )
    )

    cpu_model = model.to("cpu").eval()
    sample = torch.zeros(1, 3, int(config["preprocessing"]["image_size"]), int(config["preprocessing"]["image_size"]))
    with torch.inference_mode():
        for _ in range(5):
            cpu_model(sample)
        latency = []
        for _ in range(30):
            started = time.perf_counter()
            cpu_model(sample)
            latency.append((time.perf_counter() - started) * 1000)
    latency.sort()
    metrics["pytorch_cpu_latency_p50_ms"] = statistics.median(latency)
    metrics["pytorch_cpu_latency_p95_ms"] = latency[28]
    metrics["checkpoint_size_bytes"] = checkpoint_path.stat().st_size
    report = {
        "version": f"conditioned-dino-product-evaluation-{args.report_version}",
        "model_id": contract["model_id"],
        "contract": contract,
        "contract_sha256": sha256_file(contract_path),
        "initialization": initialization,
        "frozen_test_rows": len(test_rows),
        "frozen_test_ids_sha256": test_hash,
        "metrics": metrics,
        "expected_crop_assumption": (
            "Supported rows use recorded crop as trusted cycle metadata. OOD rows use the "
            "pre-frozen deterministic balanced simulation. Results do not apply when expected "
            "crop metadata is absent or wrong."
        ),
        "human_review_required": True,
        "is_production_validated": False,
    }
    output = REPORTS / f"conditioned_product_evaluation_{args.report_version}.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    save_reliability_diagram(
        calibration,
        REPORTS / f"conditioned_predecision_reliability_{args.report_version}.png",
        "Conditioned DINOv2 calibrated probabilities before abstention",
    )
    np.savez_compressed(
        RUNS / str(contract["model_id"]) / "frozen_test_outputs.npz",
        logits=logits,
        targets=targets,
        ids=np.array([row["id"] for row in test_rows]),
    )
    print(
        json.dumps(
            {
                "macro_f1": metrics["macro_f1"],
                "balanced_accuracy": metrics["balanced_accuracy"],
                "ood_recall": metrics["invalid_ood_rejection_recall"],
                "id_coverage": metrics["id_coverage"],
                "external_field_macro_f1": metrics[
                    "external_field_macro_f1_present_classes"
                ],
                "pre_decision_ece": metrics[
                    "pre_decision_expected_calibration_error_15_bins"
                ],
                "minimum_per_crop_recall": min(
                    float(value["recall"]) for value in metrics["per_crop"].values()
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
