# Goal audit

## Completed

- Frozen baseline, immutable grouped field test, numerical gates, and runtime budget.
- Legal source inventory, checksums, 58,516-row manifest v6, exact/near/embedding deduplication, grouped split audit, manual QA, and licence report.
- Canonical four-crop healthy/disease/OOD taxonomy and reproducible configs.
- MobileNetV2 baseline plus ViT-Tiny, EfficientNetV2-S, ConvNeXt-Tiny, and DeiT-Small comparisons; full-data, crop-aware, and domain-robust refinements.
- Per-class/per-crop/source metrics, confusion matrices, calibration diagrams, OOD/coverage analysis, latency, size, and failure disclosure.
- Versioned ONNX directory with labels, preprocessing, source licences, checksum, evaluation summary, model card, and rollback instructions.
- Cached ONNX adapter with crop metadata, mismatch/OOD handling, multi-view aggregation, A/B/C/U contract, mandatory review, and prohibited outputs held `null`.
- AI/API/dashboard tests, offline Docker test, full Compose build/start, HTTP health/inference checks, dashboard disclosure, LAN-access instructions, and structural-peril feasibility report.

## Selected internal result

The selected v14 candidate materially exceeds the baseline and passed every
pre-frozen internal requirement:

- Macro-F1: 0.8068.
- Balanced accuracy: 0.8193.
- Source-held-out field macro-F1: 0.6393 (required at least 0.60).
- OOD rejection recall: 0.9353.
- ID coverage: 0.8362.
- ECE after calibration: 0.0162 (required at most 0.12).

Those gates were not weakened. Potato healthy remains a material disclosed
failure (16 examples, recall 0.25, F1 0.32). The artifact is integrated as the
local presentation default but remains `is_production_validated=false`.
Independent, capture-protocol-matched field data, external evaluation, and
governance review are required before production validation.
