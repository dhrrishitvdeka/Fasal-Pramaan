#!/usr/bin/env python3
"""Train and evaluate all frozen candidate architectures locally."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import statistics
import time
from collections import Counter
from typing import Any

import numpy as np
import scipy.optimize
import timm
import torch
from PIL import Image
from safetensors.torch import load_file as load_safetensors
from sklearn.metrics import f1_score
from timm.layers import resample_abs_pos_embed
from torch import nn
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision import models, transforms
from tqdm import tqdm

from ml_common import (
    AI_ROOT,
    CLASSES,
    CLASS_TO_INDEX,
    ManifestDataset,
    REPORTS,
    ROOT,
    RUNS,
    classification_metrics,
    deterministic_cap,
    load_manifest,
    save_reliability_diagram,
    set_determinism,
    sha256_file,
)
from vit_onnx_transfer import load_vit_tiny_from_onnx


FIXED_TEST_SOURCES = {"maize_mld_ccby", "potato_field_ccby", "rice_field_ccby", "plantdoc_ccby"}
NORMALIZE_MEAN = [0.5, 0.5, 0.5]
NORMALIZE_STD = [0.5, 0.5, 0.5]
DINO_V2_WEIGHTS = (
    ROOT
    / "data"
    / "pretrained"
    / "vit_small_patch14_dinov2.lvd142m.bdc84086.safetensors"
)
DINO_V2_WEIGHTS_SHA256 = (
    "04d27f3400d059fc0cfd7d17dd1909a75bf3ea8fb3eeb48b97cb99e57ee20081"
)


class RandomJpegCompression:
    def __init__(self, quality: tuple[int, int]) -> None:
        self.low, self.high = quality

    def __call__(self, image: Image.Image) -> Image.Image:
        quality = int(torch.randint(self.low, self.high + 1, (1,)).item())
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=quality)
        buffer.seek(0)
        with Image.open(buffer) as decoded:
            return decoded.convert("RGB")


def build_model(model_config: dict[str, Any]) -> tuple[nn.Module, dict[str, Any]]:
    model_id = model_config["id"]
    if model_id == "efficientnetv2_s":
        model = models.efficientnet_v2_s(weights=None)
        model.classifier[1] = nn.Linear(model.classifier[1].in_features, len(CLASSES))
    elif model_id == "convnext_tiny":
        model = models.convnext_tiny(weights=None)
        model.classifier[2] = nn.Linear(model.classifier[2].in_features, len(CLASSES))
    elif model_id == "deit_small":
        model = timm.create_model("deit_small_patch16_224", pretrained=False, num_classes=len(CLASSES))
    elif model_id in {
        "dinov2_vits14_linear_v8",
        "dinov2_vits14_field_linear_v10",
        "dinov2_vits14_pldd_linear_v11",
    }:
        if sha256_file(DINO_V2_WEIGHTS) != DINO_V2_WEIGHTS_SHA256:
            raise RuntimeError("pinned DINOv2 ViT-S/14 weights are missing or corrupt")
        model = timm.create_model(
            "vit_small_patch14_dinov2.lvd142m",
            pretrained=False,
            num_classes=len(CLASSES),
            img_size=224,
        )
        state_dict = load_safetensors(str(DINO_V2_WEIGHTS))
        state_dict["pos_embed"] = resample_abs_pos_embed(
            state_dict["pos_embed"],
            new_size=(16, 16),
            num_prefix_tokens=1,
        )
        load_result = model.load_state_dict(state_dict, strict=False)
        if load_result.missing_keys != ["head.weight", "head.bias"]:
            raise RuntimeError(
                f"unexpected DINOv2 missing keys: {load_result.missing_keys}"
            )
        if load_result.unexpected_keys:
            raise RuntimeError(
                f"unexpected DINOv2 keys: {load_result.unexpected_keys}"
            )
        initialization = {
            "initialization": "pinned_dinov2_vits14_lvd142m",
            "source": "https://huggingface.co/timm/vit_small_patch14_dinov2.lvd142m",
            "pinned_revision": "bdc84086a163e3e7e6745d534c5f44c97dd493ef",
            "weights_sha256": DINO_V2_WEIGHTS_SHA256,
            "license": "Apache-2.0",
            "positional_embedding_resampled": "37x37_to_16x16_for_224px_input",
            "randomly_initialized_head_classes": len(CLASSES),
        }
        if model_id == "dinov2_vits14_field_linear_v10":
            base_path = RUNS / "dinov2_vits14_linear_v8" / "best.pt"
            base = torch.load(base_path, map_location="cpu", weights_only=False)
            model.load_state_dict(base["model_state_dict"])
            initialization.update(
                {
                    "initialization": "locally_trained_dinov2_vits14_linear_v8_checkpoint",
                    "base_checkpoint": str(base_path),
                    "base_checkpoint_sha256": sha256_file(base_path),
                }
            )
        elif model_id == "dinov2_vits14_pldd_linear_v11":
            base_path = RUNS / "dinov2_vits14_field_linear_v10" / "best.pt"
            base = torch.load(base_path, map_location="cpu", weights_only=False)
            model.load_state_dict(base["model_state_dict"])
            initialization.update(
                {
                    "initialization": "locally_trained_dinov2_vits14_field_linear_v10_checkpoint",
                    "base_checkpoint": str(base_path),
                    "base_checkpoint_sha256": sha256_file(base_path),
                }
            )
        return model, initialization
    elif model_id in {
        "vit_tiny",
        "vit_tiny_full_data_v2",
        "vit_tiny_crop_aware_v3",
        "vit_tiny_domain_robust_v4",
        "vit_tiny_field_adapted_v5",
        "vit_tiny_field_preserved_v6",
        "vit_tiny_field_expanded_v7",
    }:
        model, transfer = load_vit_tiny_from_onnx(
            AI_ROOT / "models" / "crop_vit" / "crop_leaf_diseases_vit.onnx",
            len(CLASSES),
            keep_source_head=False,
        )
        if model_id != "vit_tiny":
            base_run = {
                "vit_tiny_full_data_v2": "vit_tiny",
                "vit_tiny_crop_aware_v3": "vit_tiny_full_data_v2",
                "vit_tiny_domain_robust_v4": "vit_tiny_crop_aware_v3",
                "vit_tiny_field_adapted_v5": "vit_tiny_crop_aware_v3",
                "vit_tiny_field_preserved_v6": "vit_tiny_crop_aware_v3",
                "vit_tiny_field_expanded_v7": "vit_tiny_crop_aware_v3",
            }[model_id]
            base_path = RUNS / base_run / "best.pt"
            base = torch.load(base_path, map_location="cpu", weights_only=False)
            model.load_state_dict(base["model_state_dict"])
            transfer.update(
                {
                    "initialization": f"locally_trained_{base_run}_checkpoint",
                    "base_checkpoint": str(base_path),
                    "base_checkpoint_sha256": sha256_file(base_path),
                }
            )
        return model, transfer
    else:
        raise ValueError(f"unknown model: {model_id}")
    return model, {"initialization": "random_local"}


def is_head_parameter(name: str) -> bool:
    return name.startswith("head.") or name.startswith("classifier.")


def set_head_only(model: nn.Module, enabled: bool) -> None:
    for name, parameter in model.named_parameters():
        parameter.requires_grad = (not enabled) or is_head_parameter(name)


def make_transforms(config: dict[str, Any]) -> tuple[Any, Any]:
    aug = config["augmentation"]
    preprocessing = config.get("preprocessing", {})
    image_size = int(preprocessing.get("image_size", 224))
    normalize_mean = preprocessing.get("normalize_mean", NORMALIZE_MEAN)
    normalize_std = preprocessing.get("normalize_std", NORMALIZE_STD)
    optional = []
    if aug.get("randaugment_num_ops"):
        optional.append(
            transforms.RandAugment(
                num_ops=int(aug["randaugment_num_ops"]),
                magnitude=int(aug["randaugment_magnitude"]),
            )
        )
    if aug.get("random_grayscale_probability", 0.0):
        optional.append(
            transforms.RandomGrayscale(p=float(aug["random_grayscale_probability"]))
        )
    if aug.get("gaussian_blur_probability", 0.0):
        optional.append(
            transforms.RandomApply(
                [transforms.GaussianBlur(kernel_size=5, sigma=(0.1, 2.0))],
                p=float(aug["gaussian_blur_probability"]),
            )
        )
    if aug.get("perspective_probability", 0.0):
        optional.append(
            transforms.RandomPerspective(
                distortion_scale=float(aug["perspective_distortion_scale"]),
                p=float(aug["perspective_probability"]),
            )
        )
    train = transforms.Compose(
        [
            transforms.RandomResizedCrop(
                image_size, scale=tuple(aug["random_resized_crop_scale"])
            ),
            transforms.RandomHorizontalFlip(aug["horizontal_flip_probability"]),
            transforms.RandomRotation(aug["rotation_degrees"]),
            transforms.ColorJitter(*aug["color_jitter"]),
            *optional,
            RandomJpegCompression(tuple(aug["jpeg_quality_range"])),
            transforms.ToTensor(),
            transforms.Normalize(normalize_mean, normalize_std),
            transforms.RandomErasing(p=aug["random_erasing_probability"], scale=(0.02, 0.12)),
        ]
    )
    evaluate = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(normalize_mean, normalize_std),
        ]
    )
    return train, evaluate


def run_inference(
    model: nn.Module,
    rows: list[dict[str, Any]],
    transform: Any,
    device: torch.device,
    description: str,
) -> tuple[np.ndarray, np.ndarray]:
    loader = DataLoader(
        ManifestDataset(rows, transform),
        batch_size=96 if device.type == "cuda" else 24,
        shuffle=False,
        num_workers=4,
        pin_memory=device.type == "cuda",
    )
    logits: list[np.ndarray] = []
    targets: list[np.ndarray] = []
    model.eval()
    with torch.inference_mode():
        for images, labels, _ in tqdm(loader, desc=description):
            with torch.autocast(
                device_type=device.type,
                dtype=torch.float16,
                enabled=device.type == "cuda",
            ):
                output = model(images.to(device, non_blocking=True))
            logits.append(output.float().cpu().numpy())
            targets.append(labels.numpy())
    return np.concatenate(logits), np.concatenate(targets)


def temperature_scale(
    logits: np.ndarray,
    targets: np.ndarray,
    sample_weights: np.ndarray | None = None,
    minimum_temperature: float = 0.05,
) -> float:
    def objective(log_temperature: float) -> float:
        temperature = math.exp(float(log_temperature))
        scaled = logits / temperature
        shifted = scaled - scaled.max(axis=1, keepdims=True)
        log_denominator = np.log(np.exp(shifted).sum(axis=1))
        losses = -shifted[np.arange(len(targets)), targets] + log_denominator
        return float(np.average(losses, weights=sample_weights))

    result = scipy.optimize.minimize_scalar(
        objective,
        bounds=(math.log(minimum_temperature), 3.0),
        method="bounded",
    )
    return float(math.exp(result.x))


def calibration_sample_weights(
    rows: list[dict[str, Any]], training: dict[str, Any]
) -> tuple[np.ndarray | None, str]:
    selected_sources = training.get("calibration_sources")
    if selected_sources:
        selected = set(selected_sources)
        counts = Counter(
            str(row["source_dataset"])
            for row in rows
            if str(row["source_dataset"]) in selected
        )
        missing = selected - counts.keys()
        if missing:
            raise ValueError(
                f"calibration sources absent from validation: {sorted(missing)}"
            )
        weights = np.array(
            [
                (
                    1.0 / counts[str(row["source_dataset"])]
                    if str(row["source_dataset"]) in selected
                    else 0.0
                )
                for row in rows
            ],
            dtype=np.float64,
        )
        return (
            weights,
            "equal_source_weighted_selected_validation_sources:"
            + ",".join(sorted(selected)),
        )
    if training.get("calibration_source_balanced"):
        counts = Counter(str(row["source_dataset"]) for row in rows)
        weights = np.array(
            [1.0 / counts[str(row["source_dataset"])] for row in rows],
            dtype=np.float64,
        )
        return weights, "equal_source_weighted_validation"
    return None, "unweighted_validation"


def softmax(logits: np.ndarray, temperature: float) -> np.ndarray:
    values = logits / temperature
    values -= values.max(axis=1, keepdims=True)
    exp = np.exp(values)
    return exp / exp.sum(axis=1, keepdims=True)


def fit_abstention_threshold(probabilities: np.ndarray, targets: np.ndarray) -> dict[str, Any]:
    invalid = CLASS_TO_INDEX["invalid__ood"]
    invalid_mask = targets == invalid
    id_mask = ~invalid_mask
    candidates: list[dict[str, Any]] = []
    for threshold in np.linspace(0.0, 0.95, 96):
        predictions = probabilities.argmax(axis=1)
        predictions[probabilities.max(axis=1) < threshold] = invalid
        ood_recall = float((predictions[invalid_mask] == invalid).mean())
        id_coverage = float((predictions[id_mask] != invalid).mean())
        macro_f1 = float(f1_score(targets, predictions, labels=range(len(CLASSES)), average="macro", zero_division=0))
        shortfall = max(0.0, 0.80 - ood_recall) + max(0.0, 0.70 - id_coverage)
        candidates.append(
            {
                "threshold": float(threshold),
                "invalid_ood_recall": ood_recall,
                "id_coverage": id_coverage,
                "macro_f1": macro_f1,
                "constraint_shortfall": shortfall,
            }
        )
    feasible = [item for item in candidates if item["constraint_shortfall"] == 0.0]
    if feasible:
        selected = max(feasible, key=lambda item: (item["macro_f1"], item["invalid_ood_recall"]))
        selected["selection_status"] = "constraints_feasible"
    else:
        selected = min(candidates, key=lambda item: (item["constraint_shortfall"], -item["macro_f1"]))
        selected["selection_status"] = "constraints_infeasible_minimum_shortfall"
    return selected


def apply_abstention(probabilities: np.ndarray, threshold: float) -> np.ndarray:
    result = probabilities.copy()
    mask = result.max(axis=1) < threshold
    result[mask] = 0.0
    result[mask, CLASS_TO_INDEX["invalid__ood"]] = 1.0
    return result


def train_one(model_config: dict[str, Any], experiment: dict[str, Any]) -> None:
    model_id = model_config["id"]
    training = experiment["training"]
    run_dir = RUNS / model_id
    run_dir.mkdir(parents=True, exist_ok=True)
    report_dir = REPORTS / "candidates"
    report_dir.mkdir(parents=True, exist_ok=True)
    set_determinism(experiment["seed"])
    manifest_filename = experiment.get("manifest_filename", "manifest_v1.jsonl")
    train_rows = deterministic_cap(
        load_manifest("train", manifest_filename), training["max_train_per_class"]
    )
    validation_rows = deterministic_cap(
        load_manifest("validation", manifest_filename), training["max_validation_per_class"]
    )
    test_rows = load_manifest("test", manifest_filename)
    train_transform, eval_transform = make_transforms(experiment)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model, initialization = build_model(model_config)
    model.to(device)
    counts = Counter(row["model_class"] for row in train_rows)
    weights = torch.tensor(
        [1.0 / math.sqrt(counts[name]) for name in CLASSES], dtype=torch.float32, device=device
    )
    weights /= weights.mean()
    weights[CLASS_TO_INDEX["invalid__ood"]] *= training.get(
        "invalid_class_weight_multiplier", 1.0
    )
    criterion = nn.CrossEntropyLoss(weight=weights, label_smoothing=training["label_smoothing"])
    head_params, body_params = [], []
    for name, parameter in model.named_parameters():
        (head_params if is_head_parameter(name) else body_params).append(parameter)
    optimizer = torch.optim.AdamW(
        [
            {"params": body_params, "lr": training["learning_rate"]},
            {"params": head_params, "lr": training["head_learning_rate"]},
        ],
        weight_decay=training["weight_decay"],
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=training["epochs"])
    scaler = torch.amp.GradScaler(device.type, enabled=device.type == "cuda" and training["mixed_precision"])
    sampler = None
    if training.get("source_balanced_sampling"):
        source_counts = Counter(str(row["source_dataset"]) for row in train_rows)
        sample_weights = torch.tensor(
            [1.0 / source_counts[str(row["source_dataset"])] for row in train_rows],
            dtype=torch.double,
        )
        sampler = WeightedRandomSampler(
            sample_weights,
            num_samples=len(train_rows),
            replacement=True,
            generator=torch.Generator().manual_seed(experiment["seed"]),
        )
    elif training.get("source_sampling_multipliers"):
        multipliers = training["source_sampling_multipliers"]
        sample_weights = torch.tensor(
            [float(multipliers.get(str(row["source_dataset"]), 1.0)) for row in train_rows],
            dtype=torch.double,
        )
        sampler = WeightedRandomSampler(
            sample_weights,
            num_samples=len(train_rows),
            replacement=True,
            generator=torch.Generator().manual_seed(experiment["seed"]),
        )
    train_loader = DataLoader(
        ManifestDataset(train_rows, train_transform),
        batch_size=training["batch_size"],
        shuffle=sampler is None,
        sampler=sampler,
        generator=torch.Generator().manual_seed(experiment["seed"]),
        num_workers=training["dataloader_workers"],
        pin_memory=device.type == "cuda",
    )
    history: list[dict[str, Any]] = []
    best_macro_f1 = -1.0
    stale_epochs = 0
    checkpoint_path = run_dir / "best.pt"
    if checkpoint_path.exists():
        checkpoint_path.unlink()
    teacher = None
    distillation = training.get("distillation")
    distillation_allowed = None
    if distillation:
        teacher, _ = load_vit_tiny_from_onnx(
            AI_ROOT / "models" / "crop_vit" / "crop_leaf_diseases_vit.onnx",
            len(CLASSES),
            keep_source_head=False,
        )
        teacher_checkpoint = torch.load(
            RUNS / distillation["teacher_run"] / "best.pt",
            map_location="cpu",
            weights_only=False,
        )
        teacher.load_state_dict(teacher_checkpoint["model_state_dict"])
        teacher.to(device).eval()
        for parameter in teacher.parameters():
            parameter.requires_grad = False
        excluded_sources = set(distillation.get("exclude_sources", []))
        distillation_allowed = torch.tensor(
            [row["source_dataset"] not in excluded_sources for row in train_rows],
            dtype=torch.bool,
        )
    start_training = time.perf_counter()
    for epoch in range(1, training["epochs"] + 1):
        set_head_only(model, enabled=epoch <= training["warmup_head_epochs"])
        model.train()
        total_loss = 0.0
        total_correct = 0
        total_rows = 0
        for images, labels, row_indices in tqdm(
            train_loader, desc=f"{model_id} epoch {epoch}"
        ):
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(
                device_type=device.type,
                dtype=torch.float16,
                enabled=device.type == "cuda" and training["mixed_precision"],
            ):
                logits = model(images)
                loss = criterion(logits, labels)
                crop_aware = training.get("crop_aware_loss")
                if crop_aware:
                    crop_logits = torch.stack(
                        [
                            torch.logsumexp(logits[:, 0:2], dim=1),
                            torch.logsumexp(logits[:, 2:4], dim=1),
                            torch.logsumexp(logits[:, 4:6], dim=1),
                            torch.logsumexp(logits[:, 6:8], dim=1),
                            logits[:, CLASS_TO_INDEX["invalid__ood"]],
                        ],
                        dim=1,
                    )
                    crop_targets = torch.where(labels == 8, 4, labels // 2)
                    crop_loss = nn.functional.cross_entropy(crop_logits, crop_targets)
                    invalid_mask = labels == CLASS_TO_INDEX["invalid__ood"]
                    if invalid_mask.any():
                        invalid_logits = logits[invalid_mask]
                        margin_loss = torch.relu(
                            float(crop_aware["invalid_margin"])
                            + invalid_logits[:, :8].max(dim=1).values
                            - invalid_logits[:, 8]
                        ).mean()
                    else:
                        margin_loss = logits.new_zeros(())
                    loss = (
                        loss
                        + float(crop_aware["crop_loss_weight"]) * crop_loss
                        + float(crop_aware["invalid_margin_weight"]) * margin_loss
                    )
                if teacher is not None and distillation_allowed is not None:
                    allowed = distillation_allowed[row_indices].to(device)
                    if allowed.any():
                        with torch.no_grad():
                            teacher_logits = teacher(images[allowed])
                        distillation_temperature = float(distillation["temperature"])
                        distillation_loss = nn.functional.kl_div(
                            nn.functional.log_softmax(
                                logits[allowed] / distillation_temperature, dim=1
                            ),
                            nn.functional.softmax(
                                teacher_logits / distillation_temperature, dim=1
                            ),
                            reduction="batchmean",
                        ) * (distillation_temperature**2)
                        loss = loss + float(distillation["weight"]) * distillation_loss
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), training["gradient_clip_norm"])
            scaler.step(optimizer)
            scaler.update()
            total_loss += float(loss.item()) * len(images)
            total_correct += int((logits.argmax(1) == labels).sum().item())
            total_rows += len(images)
        validation_logits, validation_targets = run_inference(
            model, validation_rows, eval_transform, device, f"{model_id} validation"
        )
        validation_probs = softmax(validation_logits, 1.0)
        validation_metrics = classification_metrics(
            validation_rows, validation_targets, validation_probs
        )
        epoch_record = {
            "epoch": epoch,
            "train_loss": total_loss / total_rows,
            "train_accuracy": total_correct / total_rows,
            "validation_macro_f1": validation_metrics["macro_f1"],
            "validation_balanced_accuracy": validation_metrics["balanced_accuracy"],
            "learning_rates": [group["lr"] for group in optimizer.param_groups],
        }
        history.append(epoch_record)
        print(json.dumps({"model": model_id, **epoch_record}), flush=True)
        if validation_metrics["macro_f1"] > best_macro_f1 + 1e-5:
            best_macro_f1 = validation_metrics["macro_f1"]
            stale_epochs = 0
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "classes": CLASSES,
                    "architecture": model_config["architecture"],
                    "model_id": model_id,
                    "image_size": 224,
                    "normalize_mean": experiment.get("preprocessing", {}).get(
                        "normalize_mean", NORMALIZE_MEAN
                    ),
                    "normalize_std": experiment.get("preprocessing", {}).get(
                        "normalize_std", NORMALIZE_STD
                    ),
                    "initialization": initialization,
                    "experiment": experiment,
                    "best_epoch": epoch,
                },
                checkpoint_path,
            )
        else:
            stale_epochs += 1
        scheduler.step()
        if stale_epochs >= training["early_stopping_patience"]:
            break

    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.to(device).eval()
    validation_logits, validation_targets = run_inference(
        model, validation_rows, eval_transform, device, f"{model_id} calibrate"
    )
    calibration_weights, calibration_policy = calibration_sample_weights(
        validation_rows, training
    )
    temperature = temperature_scale(
        validation_logits,
        validation_targets,
        calibration_weights,
        float(training.get("minimum_temperature", 0.05)),
    )
    validation_probs = softmax(validation_logits, temperature)
    abstention = fit_abstention_threshold(validation_probs, validation_targets)
    if training.get("skip_frozen_test_during_training"):
        validation_metrics = classification_metrics(
            validation_rows,
            validation_targets,
            apply_abstention(validation_probs, abstention["threshold"]),
        )
        training_report = {
            "version": "candidate-training-validation-v1",
            "model_id": model_id,
            "model_config": model_config,
            "initialization": initialization,
            "seed": experiment["seed"],
            "training_rows": len(train_rows),
            "validation_rows": len(validation_rows),
            "manifest_filename": manifest_filename,
            "manifest_sha256": sha256_file(ROOT / manifest_filename),
            "calibration_policy": calibration_policy,
            "epochs_completed": len(history),
            "training_seconds": time.perf_counter() - start_training,
            "history": history,
            "temperature": temperature,
            "abstention": abstention,
            "validation_metrics": validation_metrics,
            "checkpoint": str(checkpoint_path),
            "checkpoint_sha256": sha256_file(checkpoint_path),
            "frozen_test_evaluated": False,
            "is_production_validated": False,
        }
        (report_dir / f"{model_id}_training_v1.json").write_text(
            json.dumps(training_report, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(training_report, indent=2))
        return
    test_logits, test_targets = run_inference(
        model, test_rows, eval_transform, device, f"{model_id} frozen test"
    )
    calibrated_test_probs = softmax(test_logits, temperature)
    operational_test_probs = apply_abstention(calibrated_test_probs, abstention["threshold"])
    calibration_metrics = classification_metrics(test_rows, test_targets, calibrated_test_probs)
    metrics = classification_metrics(test_rows, test_targets, operational_test_probs)
    external_mask = np.array([row["source_dataset"] in FIXED_TEST_SOURCES for row in test_rows])
    external_predictions = operational_test_probs[external_mask].argmax(1)
    metrics["external_field_macro_f1_present_classes"] = float(
        f1_score(test_targets[external_mask], external_predictions, average="macro", zero_division=0)
    )
    metrics["pre_abstention_calibration"] = {
        "expected_calibration_error_15_bins": calibration_metrics[
            "expected_calibration_error_15_bins"
        ],
        "macro_f1": calibration_metrics["macro_f1"],
    }
    cpu_model = model.to("cpu")
    sample = torch.zeros(1, 3, 224, 224)
    with torch.inference_mode():
        for _ in range(5):
            cpu_model(sample)
        latency = []
        for _ in range(30):
            start = time.perf_counter()
            cpu_model(sample)
            latency.append((time.perf_counter() - start) * 1000)
    latency.sort()
    metrics["cpu_latency_p50_ms"] = statistics.median(latency)
    metrics["cpu_latency_p95_ms"] = latency[28]
    metrics["model_size_bytes"] = checkpoint_path.stat().st_size
    metrics["checkpoint_sha256"] = sha256_file(checkpoint_path)
    training_ids_hash = hashlib.sha256(
        "\n".join(row["id"] for row in train_rows).encode("utf-8")
    ).hexdigest()
    validation_ids_hash = hashlib.sha256(
        "\n".join(row["id"] for row in validation_rows).encode("utf-8")
    ).hexdigest()
    report = {
        "version": "candidate-evaluation-v1",
        "model_id": model_id,
        "model_config": model_config,
        "initialization": initialization,
        "seed": experiment["seed"],
        "training_rows": len(train_rows),
        "validation_rows": len(validation_rows),
        "training_ids_sha256": training_ids_hash,
        "validation_ids_sha256": validation_ids_hash,
        "experiment_config_sha256": sha256_file(ROOT / "config" / "experiments_v1.json"),
        "manifest_sha256": json.loads(
            (ROOT / "manifest_summary_v1.json").read_text(encoding="utf-8")
        )["manifest_sha256"],
        "epochs_completed": len(history),
        "training_seconds": time.perf_counter() - start_training,
        "history": history,
        "temperature": temperature,
        "abstention": abstention,
        "metrics": metrics,
        "checkpoint": str(checkpoint_path),
        "is_production_validated": False,
    }
    report_path = report_dir / f"{model_id}_evaluation_v1.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    save_reliability_diagram(
        calibration_metrics,
        report_dir / f"{model_id}_reliability_v1.png",
        f"{model_id} calibrated reliability",
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
                "model": model_id,
                "best_epoch": checkpoint["best_epoch"],
                "temperature": temperature,
                "abstention_threshold": abstention["threshold"],
                "macro_f1": metrics["macro_f1"],
                "balanced_accuracy": metrics["balanced_accuracy"],
                "ood_recall": metrics["invalid_ood_rejection_recall"],
                "id_coverage": metrics["id_coverage"],
            },
            indent=2,
        )
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--model", choices=["efficientnetv2_s", "convnext_tiny", "deit_small", "vit_tiny"])
    parser.add_argument("--refine-vit", action="store_true")
    parser.add_argument("--refine-crop-aware", action="store_true")
    parser.add_argument("--config", help="Frozen JSON config filename under research/config")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.all and not args.model and not args.refine_vit and not args.refine_crop_aware and not args.config:
        raise SystemExit("Pass --all, --model, --refine-vit, --refine-crop-aware, or --config")
    config_name = (
        args.config
        if args.config
        else "crop_aware_refinement_v1.json"
        if args.refine_crop_aware
        else "refinement_v1.json"
        if args.refine_vit
        else "experiments_v1.json"
    )
    experiment = json.loads((ROOT / "config" / config_name).read_text(encoding="utf-8"))
    selected = experiment["models"] if args.all or args.refine_vit or args.refine_crop_aware or args.config else [
        item for item in experiment["models"] if item["id"] == args.model
    ]
    for model_config in selected:
        train_one(model_config, experiment)


if __name__ == "__main__":
    main()
