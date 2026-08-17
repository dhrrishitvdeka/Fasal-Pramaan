# AI Model Card: DINOv2 ViT-S/14 Crop Health Screening

## Model Overview
- **Model Name**: `crop_health_dinov2_v14` (Adapter: `crop_health_v4`)
- **Architecture**: Vision Transformer Small (DINOv2 ViT-S/14, 12 layers, 384 embedding dim, 14x14 patch size)
- **Framework & Format**: ONNX Runtime Float32 (`model.onnx`, ~87 MB)
- **Deployment Mode**: Fully local CPU/GPU containerized microservice with zero startup network calls.
- **Target Crops**: Maize (*Zea mays*), Paddy (*Oryza sativa*), Potato (*Solanum tuberosum*), Wheat (*Triticum aestivum*).

---

## Intended Use & Safety Scope
- **Primary Use**: Visual screening of field crop leaf evidence to assist agricultural insurance reviewers in triaging claim submissions.
- **Taxonomy**: Produces $A/B/C/U$ screening grades (`A` = Healthy, `B` = Borderline/Uncertain, `C` = Disease Pattern, `U` = Unusable/OOD).
- **Governance Constraint**: The model provides decision support and triage assistance. It does not calculate payout sums or approve insurance claims automatically; all outcomes require human reviewer validation.

---

## Frozen Benchmark Metrics (12,167 Test Images)

| Evaluation Metric | Benchmark Value | Benchmark Standard |
|---|---|---|
| **Overall Macro-F1** | `0.8068` | Harmonic mean across crop disease heads |
| **Balanced Accuracy** | `0.8193` | Class-balanced accuracy |
| **Field-Subset Macro-F1** | `0.6393` | Out-of-lab in-situ agricultural test set |
| **OOD Rejection Recall** | `0.9353` | Detection of non-agricultural/invalid media |
| **Supported ID Coverage** | `0.8362` | Proportion of verified in-domain samples |
| **Pre-Decision ECE** | `0.0162` | Expected Calibration Error |

### Class-Specific Recall & F1 Scores
- **Maize (Corn)**: Precision `0.88`, Recall `0.86`, F1 `0.87`
- **Paddy (Rice)**: Precision `0.84`, Recall `0.82`, F1 `0.83`
- **Wheat**: Precision `0.81`, Recall `0.80`, F1 `0.80`
- **Potato**: Precision `0.76`, Recall `0.72`, F1 `0.74` *(Potato Healthy baseline: Precision `0.44`, Recall `0.25`, F1 `0.32` — appropriately routed to human review via Grade B)*

---

## Rollback & Fallback Configuration

Operators can configure alternative model adapters in `.env` without rebuilding Docker containers:
- `AI_MODEL_ADAPTER=crop_health_v4` *(Default: DINOv2 ViT-S/14)*
- `AI_MODEL_ADAPTER=crop_health_v3` *(Rollback 1: ViT-Tiny ONNX)*
- `AI_MODEL_ADAPTER=crop_vit` *(Rollback 2: Public Quantized ViT-Tiny)*
- `AI_MODEL_ADAPTER=hierarchical` *(Multi-Stage Optical Pipeline)*
