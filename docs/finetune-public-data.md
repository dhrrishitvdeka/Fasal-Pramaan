# Historical fine-tune plan (public data only — no private farm labels)

> **Archived planning note:** The v14 research pipeline supersedes the default
> model recommendations in this document. Keep the sections below only as
> background for the older MobileNet/ViT experiments. See
> `services/ai/research/README.md` and `docs/AI_MODEL_MVP.md` for the selected
> implementation and current evidence.

**Honesty bar:** After any public fine-tune, keep `is_production_validated: false`.
Leaf / PlantVillage-style accuracy ≠ multi-peril Indian field insurance accuracy (flood, lodging, hail, etc.).

**Constraint:** You have **no private labelled farm data**. All steps below use **internet / public** datasets only.

---

## 1. What is actually running today

| Backend | Architecture | Status (typical local Docker) |
|---------|--------------|--------------------------------|
| **Default screening model** | **DINOv2 ViT-S/14 ONNX** `models/crop_health_dinov2_v14/model.onnx` | Fully local CPU inference; internal frozen gates passed; non-production |
| **First rollback** | **ViT-Tiny ONNX** `models/crop_health_vit_v3/model.onnx` | Fully local; failed field/calibration gates |
| **Second rollback** | **Public ViT-Tiny ONNX** `models/crop_vit/crop_leaf_diseases_vit.onnx` | Fully local CPU inference; public upstream labels |
| **Legacy damage model** | **MobileNetV2** checkpoint `models/plant_disease/checkpoint.pt` | Optional; PyTorch is no longer in the lightweight runtime image |
| **Hierarchical pipeline** | Quality heuristics → crop check → damage adapter | Working as orchestration |
| **Named “crop ViT”** `wambugu71/crop_leaf_diseases_vit` | HuggingFace image-classification (optional) | **Off by default**; needs `transformers` + `AI_ENABLE_HF_CROP_VIT=true` + download |
| **Damage ViT** `LishaV01/agriculture-crop-disease-detection` | HF hook ID only | Not wired as default damage backend |

**Implication:** The presentation MVP uses the vendored v14 ONNX artifact. It
has a licensed, immutable internal evaluation and passed all frozen internal
gates, but true deployment accuracy and any severity/quality claim still
require independent, protocol-matched field validation. Severity and quality
remain unavailable by design.

See measured probes: run `python scripts/probe_ml_backends.py` and `python scripts/evaluate_checkpoint.py`.

---

## 2. Recommended path A — improve MobileNet (**legacy only**, not the default MVP)

### 2.1 Public data

1. **PlantVillage** (or PlantDoc if you want more field-like leaves) — open academic datasets.
2. In-repo scaffold already mirrors PV class names under `services/ai/datasets/plantvillage_subset/` (240 train / 60 val **synthetic-or-subset** images).
3. Expand with real public PV images (download via official / Kaggle / HuggingFace datasets mirrors — **not** private farm claims).

### 2.2 Prepare split

```bash
cd services/ai
# Existing helper for subset structure:
python scripts/prepare_subset.py
# Prefer: replace train/ and val/ with real public PV folders ImageFolder layout:
#   train/<ClassName>/*.jpg
#   val/<ClassName>/*.jpg
```

Hold out **≥15–20%** of images **per class** as `val/`. Never train on val.

### 2.3 Train (same script the shipped checkpoint uses)

```bash
cd services/ai
python scripts/train_plant_disease.py \
  --data datasets/plantvillage_subset \
  --epochs 15 \
  --batch-size 32 \
  --lr 1e-4
```

Artifacts written:

- `models/plant_disease/checkpoint.pt`
- `models/plant_disease/eval_report.json` (measured only)
- `models/plant_disease/label_map.json`

### 2.4 Evaluate via **shipped** adapter (not a side classifier)

```bash
python scripts/evaluate_checkpoint.py \
  --data datasets/plantvillage_subset \
  --split val \
  --adapter plant_disease \
  --output models/plant_disease/live_eval_report.json
```

Success metrics (public leaf domain only):

| Metric | Weak (current-ish) | Target after more public data + epochs |
|--------|--------------------|----------------------------------------|
| Top-1 class accuracy on val | ~0.40–0.55 on tiny subset | **≥0.75** on larger PV holdout |
| Healthy vs disease (mapped) | often higher than fine class | track separately |
| `is_production_validated` | **false** | stays **false** |

### 2.5 Swap into running stack

```env
AI_MODEL_ADAPTER=plant_disease
# restart AI container so it reloads code/weights (bind-mount already maps models/)
```

No API rewrite required — `PlantDiseaseAdapter` loads the new checkpoint.

### 2.6 Compute

- **CPU:** small subset, 3–15 epochs — minutes to a few hours.
- **GPU (optional):** full PlantVillage — hours.
- Disk: full PV can be several GB.

---

## 3. Path B — optional HuggingFace crop ViT (the “ViT we named”)

### 3.1 Make it work (inference only, no fine-tune)

```bash
# In AI image or venv
pip install "transformers>=4.40" "accelerate"
export AI_ENABLE_HF_CROP_VIT=true
# First call downloads wambugu71/crop_leaf_diseases_vit (~weights size depends on hub)
python scripts/probe_ml_backends.py
```

Crop stage backend should report `hf_vit` instead of `heuristic`.
If download fails offline → keep heuristic; **do not invent accuracy**.

### 3.2 Fine-tune ViT on public leaves (when you want higher crop/disease head accuracy)

1. **Dataset:** same public PlantVillage ImageFolder (or HF `plantvillage` dataset).
2. **Base weights:** `wambugu71/crop_leaf_diseases_vit` or `google/vit-base-patch16-224` + new classification head.
3. **Recipe (Transformers Trainer sketch):**

```text
- freeze backbone 1–2 epochs, then unfreeze last blocks
- lr: 2e-5 (head), 5e-6 (backbone)
- epochs: 5–10
- image size: 224
- loss: CrossEntropy
- eval: accuracy + macro-F1 on held-out public val
- save: models/crop_vit/  (new adapter path; do not overwrite MobileNet blindly)
```

4. **Wire-in:** extend `stage_crop_species` / optional damage adapter to load local `models/crop_vit` when present; keep HF hub only as bootstrap.
5. **Still non-production** until partner field holdout exists.

### 3.3 When ViT is worth it

- You need better **fine-grained leaf disease** labels and can run GPU.
- `crop_health_v4` remains the **default** for CPU Docker demos; MobileNet is
  retained only as a legacy experimental path.

---

## 4. Path C — hierarchical gates (no extra labels)

Without new labels you can still improve **robustness**:

| Stage | Public-only improvement |
|-------|-------------------------|
| Quality/OOD | Tighten blur/resolution thresholds from val failures |
| Crop check | Enable HF ViT when network allows |
| Damage | Better MobileNet from Path A |
| Rules | Keep high-severity → human review |

No private data required.

---

## 5. What you **cannot** honestly get without field data

- Flood / lodging / hail / drought on multi-acre Indian plots
- PMFBY-grade claim accuracy
- “Production validated” flags

When partners later provide geo-tagged field photos: fine-tune **the same modular adapters** without rewriting the monorepo (see `goal.md` §7).

---

## 6. Suggested order of work (no private data)

1. **Measure** current MobileNet: `evaluate_checkpoint.py` → record live_eval_report.
2. **Expand** public PV train/val (real images if network allows).
3. **Retrain** MobileNet 10–15 epochs; re-evaluate.
4. **Optionally** install transformers + enable crop ViT; probe status.
5. **Optionally** fine-tune ViT head on same public set if GPU available.
6. Keep Command Centre human review mandatory.

---

## 7. Commands cheat-sheet

```powershell
cd services/ai
python scripts/probe_ml_backends.py
python scripts/evaluate_checkpoint.py --adapter plant_disease --split val
python scripts/train_plant_disease.py --epochs 15 --data datasets/plantvillage_subset
python scripts/evaluate_checkpoint.py --adapter plant_disease --split val
# Docker:
docker compose exec ai python scripts/probe_ml_backends.py
docker compose exec ai python scripts/evaluate_checkpoint.py --split val
```

Related: [ai-service.md](./ai-service.md), [goal.md](../goal.md), `services/ai/models/registry.json`.
