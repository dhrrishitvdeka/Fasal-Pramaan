---
title: Fasal Pramaan API
emoji: 🌾
colorFrom: green
colorTo: yellow
sdk: gradio
sdk_version: 5.29.1
app_file: app.py
pinned: false
---

# Fasal-Pramaan hosted inference

Private Gradio Space that loads **`dhrrishitvdeka/fasal-pramaan-model`** (`model.onnx`)
and runs the Fasal-Pramaan DINOv2 ViT-S/14 crop-conditioned heads.

This is assistive leaf-health screening only. It does **not** estimate disease
identity, severity, affected area, yield, or payout. Human review is required.

## Space secrets / variables

| Name | Type | Value |
|---|---|---|
| `MODEL_REPO_ID` | variable | `dhrrishitvdeka/fasal-pramaan-model` |
| `MODEL_REVISION` | variable | `main` |
| `HF_TOKEN` | **secret** | Hugging Face token that can read the private model repo |

Never put `HF_TOKEN` in the README, UI, or API responses.

## API

`POST /gradio_api/call/predict_api` then `GET /gradio_api/call/predict_api/{event_id}`

See the Fasal-Pramaan repo `docs/supabase-integration.md` for the Next.js contract.
