#!/usr/bin/env python3
"""Train crop-conditioned health/OOD heads over a frozen or partially tuned DINOv2."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn
from sklearn.metrics import f1_score
from torch.utils.data import DataLoader, WeightedRandomSampler
from tqdm import tqdm

from ml_common import (
    CLASSES,
    CLASS_TO_INDEX,
    ManifestDataset,
    REPORTS,
    ROOT,
    RUNS,
    classification_metrics,
    load_manifest,
    set_determinism,
    sha256_file,
)
from train_candidates import (
    apply_abstention,
    build_model,
    calibration_sample_weights,
    fit_abstention_threshold,
    make_transforms,
    softmax,
    temperature_scale,
)


CROPS = ("maize", "paddy", "potato", "wheat")
INVALID = CLASS_TO_INDEX["invalid__ood"]


class CropConditionedDino(nn.Module):
    """Return four independent [healthy, disease, invalid] heads."""

    def __init__(self, encoder: nn.Module, feature_size: int) -> None:
        super().__init__()
        self.encoder = encoder
        self.conditioned_head = nn.Linear(feature_size, len(CROPS) * 3)

    def forward(self, images: torch.Tensor) -> torch.Tensor:
        features = self.encoder(images)
        return self.conditioned_head(features).reshape(-1, len(CROPS), 3)


def expected_crop_index(row: dict[str, Any]) -> int:
    crop = str(row["canonical_crop"])
    if crop in CROPS:
        return CROPS.index(crop)
    value = int(hashlib.sha256(f"expected:{row['id']}".encode()).hexdigest()[:8], 16)
    return value % len(CROPS)


def build_conditioned_model(
    base_model_id: str, base_checkpoint: Path
) -> tuple[CropConditionedDino, dict[str, Any]]:
    model_config = {
        "id": base_model_id,
        "architecture": "vit_small_patch14_dinov2.lvd142m",
    }
    base_model, initialization = build_model(model_config)
    checkpoint = torch.load(base_checkpoint, map_location="cpu", weights_only=False)
    source_head = base_model.head
    if not isinstance(source_head, nn.Linear):
        raise RuntimeError("DINOv2 source head is not linear")
    feature_size = int(source_head.in_features)
    base_model.head = nn.Identity()
    model = CropConditionedDino(base_model, feature_size)
    if checkpoint.get("architecture") == "dinov2_vits14_crop_conditioned_heads":
        if tuple(checkpoint.get("conditioned_crops", ())) != CROPS:
            raise RuntimeError("conditioned base checkpoint crop order differs")
        model.load_state_dict(checkpoint["model_state_dict"])
        head_initialization = "continued from the validation-selected conditioned checkpoint"
    else:
        # Recreate the flat model so its head can be mapped into each crop branch.
        flat_model, _ = build_model(model_config)
        flat_model.load_state_dict(checkpoint["model_state_dict"])
        flat_head = flat_model.head
        if not isinstance(flat_head, nn.Linear):
            raise RuntimeError("DINOv2 flat source head is not linear")
        with torch.no_grad():
            for crop_index in range(len(CROPS)):
                start = crop_index * 3
                healthy = crop_index * 2
                disease = healthy + 1
                model.conditioned_head.weight[start].copy_(flat_head.weight[healthy])
                model.conditioned_head.bias[start].copy_(flat_head.bias[healthy])
                model.conditioned_head.weight[start + 1].copy_(flat_head.weight[disease])
                model.conditioned_head.bias[start + 1].copy_(flat_head.bias[disease])
                model.conditioned_head.weight[start + 2].copy_(flat_head.weight[INVALID])
                model.conditioned_head.bias[start + 2].copy_(flat_head.bias[INVALID])
        head_initialization = "mapped from the validation-selected flat checkpoint"
    for parameter in model.encoder.parameters():
        parameter.requires_grad = False
    return model, {
        **initialization,
        "conditioned_head_initialization": head_initialization,
        "base_checkpoint": str(base_checkpoint),
        "base_checkpoint_sha256": sha256_file(base_checkpoint),
        "conditioned_outputs": {
            crop: ["healthy", "disease", "invalid"] for crop in CROPS
        },
    }


def training_targets(labels: torch.Tensor) -> torch.Tensor:
    targets = torch.full(
        (len(labels), len(CROPS)),
        2,
        dtype=torch.long,
        device=labels.device,
    )
    supported = labels != INVALID
    rows = torch.arange(len(labels), device=labels.device)[supported]
    crops = labels[supported] // 2
    targets[rows, crops] = labels[supported] % 2
    return targets


def target_weights(
    rows: list[dict[str, Any]], invalid_multiplier: float
) -> torch.Tensor:
    labels = torch.tensor([CLASS_TO_INDEX[row["model_class"]] for row in rows])
    counts = torch.zeros(len(CROPS), 3, dtype=torch.float64)
    targets = training_targets(labels)
    for crop_index in range(len(CROPS)):
        counts[crop_index] = torch.bincount(
            targets[:, crop_index], minlength=3
        ).double()
    weights = 1.0 / torch.sqrt(counts.clamp_min(1.0))
    weights[:, 2] *= invalid_multiplier
    weights /= weights.mean(dim=1, keepdim=True)
    return weights.float()


def conditioned_logits(
    outputs: torch.Tensor,
    rows: list[dict[str, Any]],
    row_indices: torch.Tensor,
) -> torch.Tensor:
    selected_crops = torch.tensor(
        [expected_crop_index(rows[int(index)]) for index in row_indices],
        dtype=torch.long,
        device=outputs.device,
    )
    batch = torch.arange(len(outputs), device=outputs.device)
    selected = outputs[batch, selected_crops]
    logits = torch.full(
        (len(outputs), len(CLASSES)),
        -30.0,
        dtype=outputs.dtype,
        device=outputs.device,
    )
    healthy_indices = selected_crops * 2
    logits[batch, healthy_indices] = selected[:, 0]
    logits[batch, healthy_indices + 1] = selected[:, 1]
    logits[:, INVALID] = selected[:, 2]
    return logits


def run_inference(
    model: CropConditionedDino,
    rows: list[dict[str, Any]],
    transform: Any,
    device: torch.device,
    description: str,
    batch_size: int,
    workers: int,
) -> tuple[np.ndarray, np.ndarray]:
    loader = DataLoader(
        ManifestDataset(rows, transform),
        batch_size=batch_size,
        shuffle=False,
        num_workers=workers,
        pin_memory=device.type == "cuda",
    )
    logits: list[np.ndarray] = []
    targets: list[np.ndarray] = []
    model.eval()
    with torch.inference_mode():
        for images, labels, row_indices in tqdm(loader, desc=description):
            with torch.autocast(
                device_type=device.type,
                dtype=torch.float16,
                enabled=device.type == "cuda",
            ):
                outputs = model(images.to(device, non_blocking=True))
                selected = conditioned_logits(outputs, rows, row_indices)
            logits.append(selected.float().cpu().numpy())
            targets.append(labels.numpy())
    return np.concatenate(logits), np.concatenate(targets)


def save_checkpoint(
    path: Path,
    model: CropConditionedDino,
    config: dict[str, Any],
    initialization: dict[str, Any],
    best_epoch: int,
    best_validation_macro_f1: float,
    best_validation_field_macro_f1: float,
) -> None:
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "classes": CLASSES,
            "conditioned_crops": CROPS,
            "conditioned_classes": ["healthy", "disease", "invalid"],
            "architecture": "dinov2_vits14_crop_conditioned_heads",
            "model_id": config["model"]["id"],
            "image_size": int(config["preprocessing"]["image_size"]),
            "normalize_mean": config["preprocessing"]["normalize_mean"],
            "normalize_std": config["preprocessing"]["normalize_std"],
            "initialization": initialization,
            "experiment": config,
            "best_epoch": best_epoch,
            "best_validation_macro_f1": best_validation_macro_f1,
            "best_validation_field_macro_f1": best_validation_field_macro_f1,
        },
        path,
    )


def validation_field_macro_f1(
    rows: list[dict[str, Any]],
    targets: np.ndarray,
    probabilities: np.ndarray,
    sources: list[str],
) -> float:
    source_set = set(sources)
    mask = np.array([row["source_dataset"] in source_set for row in rows])
    if not mask.any():
        raise RuntimeError("validation field-selection sources have no rows")
    return float(
        f1_score(
            targets[mask],
            probabilities[mask].argmax(1),
            average="macro",
            zero_division=0,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config_path = ROOT / "config" / args.config
    config = json.loads(config_path.read_text(encoding="utf-8"))
    set_determinism(int(config["seed"]))
    training = config["training"]
    manifest_filename = str(config["manifest_filename"])
    train_rows = load_manifest("train", manifest_filename)
    validation_rows = load_manifest("validation", manifest_filename)
    train_transform, eval_transform = make_transforms(config)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    base_checkpoint = ROOT / str(config["model"]["base_checkpoint"])
    model, initialization = build_conditioned_model(
        str(config["model"]["base_model_id"]), base_checkpoint
    )
    unfreeze_blocks = int(training.get("backbone_unfreeze_last_blocks", 0))
    backbone_parameters: list[nn.Parameter] = []
    if unfreeze_blocks:
        blocks = getattr(model.encoder, "blocks", None)
        if blocks is None or unfreeze_blocks > len(blocks):
            raise RuntimeError("requested DINOv2 backbone block count is unavailable")
        for block in blocks[-unfreeze_blocks:]:
            for parameter in block.parameters():
                parameter.requires_grad = True
                backbone_parameters.append(parameter)
        encoder_norm = getattr(model.encoder, "norm", None)
        if encoder_norm is not None:
            for parameter in encoder_norm.parameters():
                parameter.requires_grad = True
                backbone_parameters.append(parameter)
        initialization["backbone_fine_tuning"] = {
            "unfrozen_last_blocks": unfreeze_blocks,
            "unfrozen_final_norm": encoder_norm is not None,
            "learning_rate": float(training["backbone_learning_rate"]),
        }
    model.to(device)
    weights = target_weights(
        train_rows, float(training["invalid_target_weight_multiplier"])
    ).to(device)
    parameter_groups: list[dict[str, Any]] = [
        {
            "params": model.conditioned_head.parameters(),
            "lr": float(training["head_learning_rate"]),
        }
    ]
    if backbone_parameters:
        parameter_groups.append(
            {
                "params": backbone_parameters,
                "lr": float(training["backbone_learning_rate"]),
            }
        )
    optimizer = torch.optim.AdamW(
        parameter_groups, weight_decay=float(training["weight_decay"])
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=int(training["epochs"])
    )
    scaler = torch.amp.GradScaler(
        device.type, enabled=device.type == "cuda" and training["mixed_precision"]
    )
    sampler = None
    if training.get("source_balanced_sampling", False):
        source_counts = Counter(str(row["source_dataset"]) for row in train_rows)
        sample_weights = torch.tensor(
            [1.0 / source_counts[str(row["source_dataset"])] for row in train_rows],
            dtype=torch.double,
        )
        sampler = WeightedRandomSampler(
            sample_weights,
            num_samples=len(train_rows),
            replacement=True,
            generator=torch.Generator().manual_seed(int(config["seed"])),
        )
        initialization["training_sampler"] = "equal_expected_weight_per_source"
    loader = DataLoader(
        ManifestDataset(train_rows, train_transform),
        batch_size=int(training["batch_size"]),
        shuffle=sampler is None,
        sampler=sampler,
        generator=torch.Generator().manual_seed(int(config["seed"])),
        num_workers=int(training["dataloader_workers"]),
        pin_memory=device.type == "cuda",
    )
    run_dir = RUNS / str(config["model"]["id"])
    run_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = run_dir / "best.pt"
    if checkpoint_path.exists():
        checkpoint_path.unlink()
    history: list[dict[str, Any]] = []

    baseline_logits, baseline_targets = run_inference(
        model,
        validation_rows,
        eval_transform,
        device,
        "conditioned epoch 0 validation",
        int(training["evaluation_batch_size"]),
        int(training["dataloader_workers"]),
    )
    baseline_metrics = classification_metrics(
        validation_rows, baseline_targets, softmax(baseline_logits, 1.0)
    )
    selection_sources = list(training.get("validation_field_selection_sources", []))
    baseline_field_macro = validation_field_macro_f1(
        validation_rows,
        baseline_targets,
        softmax(baseline_logits, 1.0),
        selection_sources,
    )
    best_macro = float(baseline_metrics["macro_f1"])
    best_field_macro = baseline_field_macro
    best_epoch = 0
    save_checkpoint(
        checkpoint_path,
        model,
        config,
        initialization,
        best_epoch,
        best_macro,
        best_field_macro,
    )
    history.append(
        {
            "epoch": 0,
            "train_loss": None,
            "validation_macro_f1": best_macro,
            "validation_field_macro_f1": best_field_macro,
            "validation_balanced_accuracy": baseline_metrics["balanced_accuracy"],
            "learning_rate": float(training["head_learning_rate"]),
            "selection_role": "mapped_v11_behavior_baseline",
        }
    )
    print(json.dumps(history[-1]), flush=True)

    started = time.perf_counter()
    for epoch in range(1, int(training["epochs"]) + 1):
        model.encoder.train(unfreeze_blocks > 0)
        model.conditioned_head.train()
        total_loss = 0.0
        total_cells = 0
        total_correct = 0
        for images, labels, _ in tqdm(
            loader, desc=f"{config['model']['id']} epoch {epoch}"
        ):
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)
            targets = training_targets(labels)
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(
                device_type=device.type,
                dtype=torch.float16,
                enabled=device.type == "cuda" and training["mixed_precision"],
            ):
                outputs = model(images)
                losses = nn.functional.cross_entropy(
                    outputs.reshape(-1, 3),
                    targets.reshape(-1),
                    reduction="none",
                    label_smoothing=float(training["label_smoothing"]),
                ).reshape(-1, len(CROPS))
                cell_weights = torch.gather(
                    weights.unsqueeze(0).expand(len(labels), -1, -1),
                    2,
                    targets.unsqueeze(-1),
                ).squeeze(-1)
                loss = (losses * cell_weights).sum() / cell_weights.sum()
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(
                [parameter for parameter in model.parameters() if parameter.requires_grad],
                float(training["gradient_clip_norm"]),
            )
            scaler.step(optimizer)
            scaler.update()
            total_loss += float(loss.item()) * targets.numel()
            total_cells += targets.numel()
            total_correct += int((outputs.argmax(-1) == targets).sum().item())

        logits, targets_np = run_inference(
            model,
            validation_rows,
            eval_transform,
            device,
            f"{config['model']['id']} epoch {epoch} validation",
            int(training["evaluation_batch_size"]),
            int(training["dataloader_workers"]),
        )
        metrics = classification_metrics(
            validation_rows, targets_np, softmax(logits, 1.0)
        )
        field_macro = validation_field_macro_f1(
            validation_rows,
            targets_np,
            softmax(logits, 1.0),
            selection_sources,
        )
        record = {
            "epoch": epoch,
            "train_loss": total_loss / total_cells,
            "train_cell_accuracy": total_correct / total_cells,
            "validation_macro_f1": metrics["macro_f1"],
            "validation_field_macro_f1": field_macro,
            "validation_balanced_accuracy": metrics["balanced_accuracy"],
            "learning_rate": optimizer.param_groups[0]["lr"],
        }
        history.append(record)
        print(json.dumps(record), flush=True)
        improves_field = field_macro > best_field_macro + 1e-5
        ties_field = abs(field_macro - best_field_macro) <= 1e-5
        improves_tiebreaker = float(metrics["macro_f1"]) > best_macro + 1e-5
        if improves_field or (ties_field and improves_tiebreaker):
            best_macro = float(metrics["macro_f1"])
            best_field_macro = field_macro
            best_epoch = epoch
            save_checkpoint(
                checkpoint_path,
                model,
                config,
                initialization,
                best_epoch,
                best_macro,
                best_field_macro,
            )
        scheduler.step()

    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device).eval()
    validation_logits, validation_targets = run_inference(
        model,
        validation_rows,
        eval_transform,
        device,
        f"{config['model']['id']} calibration",
        int(training["evaluation_batch_size"]),
        int(training["dataloader_workers"]),
    )
    calibration_weights, calibration_policy = calibration_sample_weights(
        validation_rows, training
    )
    temperature = temperature_scale(
        validation_logits,
        validation_targets,
        calibration_weights,
        float(training["minimum_temperature"]),
    )
    probabilities = softmax(validation_logits, temperature)
    abstention = fit_abstention_threshold(probabilities, validation_targets)
    operational = apply_abstention(probabilities, float(abstention["threshold"]))
    metrics = classification_metrics(
        validation_rows, validation_targets, operational
    )
    report = {
        "version": "conditioned-dino-training-validation-v1",
        "model_id": config["model"]["id"],
        "architecture": str(config["model"]["architecture"]),
        "config_filename": args.config,
        "config_sha256": sha256_file(config_path),
        "manifest_filename": manifest_filename,
        "manifest_sha256": sha256_file(ROOT / manifest_filename),
        "seed": config["seed"],
        "training_rows": len(train_rows),
        "validation_rows": len(validation_rows),
        "target_counts_by_model_class": dict(
            sorted(Counter(row["model_class"] for row in train_rows).items())
        ),
        "initialization": initialization,
        "best_epoch": best_epoch,
        "best_validation_field_macro_f1": best_field_macro,
        "validation_field_selection_sources": selection_sources,
        "history": history,
        "training_seconds": time.perf_counter() - started,
        "temperature": temperature,
        "calibration_policy": calibration_policy,
        "abstention": abstention,
        "validation_metrics": metrics,
        "checkpoint": str(checkpoint_path),
        "checkpoint_sha256": sha256_file(checkpoint_path),
        "checkpoint_bytes": checkpoint_path.stat().st_size,
        "frozen_test_evaluated": False,
        "is_production_validated": False,
    }
    report_path = REPORTS / "candidates" / f"{config['model']['id']}_training_v1.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
