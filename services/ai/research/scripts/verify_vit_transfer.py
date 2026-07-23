#!/usr/bin/env python3
"""Numerically verify ONNX-to-timm ViT weight transfer."""

from __future__ import annotations

import json

import numpy as np
import onnxruntime as ort
import torch

from ml_common import AI_ROOT, REPORTS, set_determinism
from vit_onnx_transfer import load_vit_tiny_from_onnx


def main() -> None:
    set_determinism()
    path = AI_ROOT / "models" / "crop_vit" / "crop_leaf_diseases_vit.onnx"
    model, transfer = load_vit_tiny_from_onnx(path, 13, keep_source_head=True)
    model.eval()
    rng = np.random.default_rng(26007)
    values = rng.normal(0, 0.4, size=(2, 3, 224, 224)).astype(np.float32)
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    onnx_logits = session.run(None, {"pixel_values": values})[0]
    with torch.inference_mode():
        torch_logits = model(torch.from_numpy(values)).numpy()
    difference = np.abs(onnx_logits - torch_logits)
    report = {
        "version": "vit-onnx-transfer-parity-v1",
        "max_absolute_logit_error": float(difference.max()),
        "mean_absolute_logit_error": float(difference.mean()),
        "argmax_agreement": float((onnx_logits.argmax(1) == torch_logits.argmax(1)).mean()),
        "passed": bool(difference.max() <= 1e-4),
        "transfer": transfer,
        "is_production_validated": False,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "vit_transfer_parity_v1.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
