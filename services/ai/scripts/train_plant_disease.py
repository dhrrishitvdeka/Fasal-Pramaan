#!/usr/bin/env python3
"""Fine-tune MobileNetV2 (ImageNet pretrained) on PlantVillage-style subset.

Produces:
  models/plant_disease/checkpoint.pt
  models/plant_disease/label_map.json
  models/plant_disease/eval_report.json  (measured metrics only)

Usage:
  python scripts/prepare_subset.py
  python scripts/train_plant_disease.py --epochs 3 --data datasets/plantvillage_subset
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="datasets/plantvillage_subset")
    parser.add_argument("--out", default="models/plant_disease")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--num-workers", type=int, default=0)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    data_dir = root / args.data
    out_dir = root / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    train_dir = data_dir / "train"
    val_dir = data_dir / "val"
    if not train_dir.exists():
        raise SystemExit(f"Missing {train_dir}. Run prepare_subset.py first.")

    tf_train = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.RandomHorizontalFlip(),
            transforms.ColorJitter(0.1, 0.1, 0.1),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    tf_val = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )

    train_ds = datasets.ImageFolder(str(train_dir), transform=tf_train)
    val_ds = datasets.ImageFolder(str(val_dir), transform=tf_val)
    train_loader = DataLoader(
        train_ds, batch_size=args.batch_size, shuffle=True, num_workers=args.num_workers
    )
    val_loader = DataLoader(
        val_ds, batch_size=args.batch_size, shuffle=False, num_workers=args.num_workers
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    n_classes = len(train_ds.classes)
    try:
        model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.IMAGENET1K_V1)
    except Exception:
        model = models.mobilenet_v2(pretrained=True)  # type: ignore[call-arg]
    model.classifier[1] = nn.Linear(model.last_channel, n_classes)
    model = model.to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)

    history: list[dict] = []
    t0 = time.perf_counter()
    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        for xb, yb in train_loader:
            xb, yb = xb.to(device), yb.to(device)
            optimizer.zero_grad()
            logits = model(xb)
            loss = criterion(logits, yb)
            loss.backward()
            optimizer.step()
            train_loss += float(loss.item()) * xb.size(0)
            pred = logits.argmax(dim=1)
            train_correct += int((pred == yb).sum().item())
            train_total += xb.size(0)
        train_acc = train_correct / max(train_total, 1)
        train_loss /= max(train_total, 1)

        model.eval()
        val_correct = 0
        val_total = 0
        val_loss = 0.0
        with torch.no_grad():
            for xb, yb in val_loader:
                xb, yb = xb.to(device), yb.to(device)
                logits = model(xb)
                loss = criterion(logits, yb)
                val_loss += float(loss.item()) * xb.size(0)
                pred = logits.argmax(dim=1)
                val_correct += int((pred == yb).sum().item())
                val_total += xb.size(0)
        val_acc = val_correct / max(val_total, 1)
        val_loss /= max(val_total, 1)
        row = {
            "epoch": epoch,
            "train_loss": round(train_loss, 4),
            "train_acc": round(train_acc, 4),
            "val_loss": round(val_loss, 4),
            "val_acc": round(val_acc, 4),
        }
        history.append(row)
        print(json.dumps(row))

    elapsed = time.perf_counter() - t0
    ckpt_path = out_dir / "checkpoint.pt"
    torch.save(
        {
            "model_state_dict": model.state_dict(),
            "classes": train_ds.classes,
            "arch": "mobilenet_v2",
            "image_size": 224,
            "normalize_mean": [0.485, 0.456, 0.406],
            "normalize_std": [0.229, 0.224, 0.225],
        },
        ckpt_path,
    )

    label_map = {i: c for i, c in enumerate(train_ds.classes)}
    (out_dir / "label_map.json").write_text(json.dumps(label_map, indent=2), encoding="utf-8")

    # Final measured evaluation report — only metrics from this run
    report = {
        "disclaimer": (
            "Measured on synthetic PlantVillage-named subset. "
            "Not validated for field insurance decisions or PMFBY payouts. "
            "Lab-style leaf crops differ from geo-tagged field photos."
        ),
        "is_production_validated": False,
        "architecture": "mobilenet_v2_imagenet_finetuned",
        "device": str(device),
        "num_classes": n_classes,
        "train_images": len(train_ds),
        "val_images": len(val_ds),
        "epochs": args.epochs,
        "training_seconds": round(elapsed, 2),
        "history": history,
        "final_val_accuracy": history[-1]["val_acc"] if history else None,
        "final_val_loss": history[-1]["val_loss"] if history else None,
        "checkpoint": str(ckpt_path.relative_to(root)),
        "classes": train_ds.classes,
    }
    (out_dir / "eval_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"saved": str(ckpt_path), "final_val_acc": report["final_val_accuracy"]}, indent=2))


if __name__ == "__main__":
    main()
