# Vision Transformer Training, Dataset Provenance & Model Adaptation

This document details the training methodology, dataset curation protocols, and fine-tuning pipelines utilized to develop the DINOv2 ViT-S/14 crop health screening model (`crop_health_v4`).

---

## 1. Machine Learning Architecture Overview

| Component | Architecture Specification | Deployment Target |
|---|---|---|
| **Primary Screening Backbone** | **DINOv2 ViT-S/14** (`crop_health_v4`) | Local ONNX Runtime (CPU/GPU) |
| **Model Footprint** | ~87 MB Float32 ONNX Artifact | Self-contained within Docker AI container |
| **Crop Conditioned Heads** | Multi-Head Linear Classification Layers | Paddy, Maize, Wheat, Potato |
| **Input Specifications** | `224x224x3` RGB Tensor (ImageNet Normalized) | Fast inference (~45ms on modern CPU) |

---

## 2. Public Dataset Manifest & Curation

The model is trained strictly on publicly verifiable, open-access agricultural computer vision datasets without dependency on proprietary farmer data:

1. **PlantVillage Academic Dataset**: Standardized foliar disease imagery across target crops.
2. **PlantDoc In-Situ Dataset**: Natural field-condition crop imagery containing complex background vegetation, soil textures, and varying outdoor illumination.
3. **CGIAR & ICRISAT Open Crop Imagery**: Verified field disease patterns for South Asian rice and cereal farming systems.

### Stratified Data Split Protocol
- **Training Set (70%)**: Multi-source balanced distribution across healthy and symptomatic classes.
- **Validation Set (10%)**: Cross-validation hyperparameter optimization and early stopping.
- **Immutable Test Benchmark (20% — 12,167 Images)**: Pinned, checksum-verified test split evaluating out-of-distribution (OOD) rejection, calibration (ECE), and field-condition macro-F1.

---

## 3. Training & Quantization Pipeline

### Step 1: Pre-training & Feature Extraction
The DINOv2 self-supervised foundation model extracts rich patch-level representations across complex foliar patterns without requiring manual segmentation.

### Step 2: Crop-Conditioned Head Fine-Tuning
```bash
cd services/ai
python scripts/train_plant_disease.py \
  --data datasets/agricultural_manifest \
  --epochs 20 \
  --batch-size 32 \
  --lr 1e-4 \
  --backbone dinov2_vits14
```

### Step 3: ONNX Export & Verification
```bash
python scripts/export_onnx.py \
  --model-path models/crop_health_dinov2_v14/checkpoint.pt \
  --output models/crop_health_dinov2_v14/model.onnx
```

---

## 4. Evaluation Benchmark Verification

Execute model evaluation against the frozen test suite:

```bash
docker compose exec ai python scripts/evaluate_checkpoint.py --split test
```

For benchmark metric details and class-level recall breakdowns, see [AI Model MVP Specification](./AI_MODEL_MVP.md).
