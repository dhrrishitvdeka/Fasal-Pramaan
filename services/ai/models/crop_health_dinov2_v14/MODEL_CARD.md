# Fasal Pramaan crop-health DINOv2 v14

## Intended use

Local, non-production screening of maize, paddy, potato, and wheat leaf images.
The caller must supply trusted crop-cycle metadata. Outputs map to:

- `A`: confident healthy-leaf signal
- `B`: uncertain signal requiring manual review
- `C`: confident disease-pattern signal
- `U`: unusable, unsupported, OOD, or crop-mismatched input

Human review is mandatory. This model does not estimate disease identity,
severity, affected area, lodging, flooding, yield, commodity quality, claim
eligibility, or payout.

## Model

DINOv2 ViT-S/14 with four crop-conditioned
`[healthy, disease, invalid]` heads. The final two transformer blocks and final
normalization layer were fine-tuned; earlier encoder layers stayed frozen.
Training used source-balanced sampling over 58,516 licensed original images in
manifest v6. The ONNX runtime requires no network access.

## Frozen internal evaluation

The untouched 12,167-row test ID hash is
`f00eadb9c0c82ce90cf368441007e4a2364d81a82180a9a011728558b1e1d083`.

| Metric | Result |
|---|---:|
| Macro-F1 | 0.8068 |
| Balanced accuracy | 0.8193 |
| Source-held-out field macro-F1 | 0.6393 |
| Minimum crop recall | 0.6546 |
| OOD rejection recall | 0.9353 |
| ID coverage | 0.8362 |
| Pre-decision ECE (15 bins) | 0.0162 |
| ONNX top-1 parity | 1.0000 |
| ONNX probability max error | 0.00000593 |
| ONNX CPU p95 (2 threads) | 156.98 ms |

All frozen internal promotion gates passed. `is_production_validated` remains
`false`.

## Per-class frozen results

Metrics include abstention/OOD decisions under the frozen product policy.

| Class | Precision | Recall | F1 | Support |
|---|---:|---:|---:|---:|
| Maize healthy | 0.9191 | 0.8782 | 0.8982 | 427 |
| Maize disease pattern | 0.9118 | 0.8996 | 0.9057 | 1,414 |
| Paddy healthy | 0.6434 | 0.9486 | 0.7668 | 253 |
| Paddy disease pattern | 0.9968 | 0.7959 | 0.8851 | 6,750 |
| Potato healthy | 0.4444 | 0.2500 | 0.3200 | 16 |
| Potato disease pattern | 0.8193 | 0.6771 | 0.7414 | 288 |
| Wheat healthy | 0.9815 | 1.0000 | 0.9907 | 53 |
| Wheat disease pattern | 1.0000 | 0.9888 | 0.9944 | 89 |
| Invalid / OOD | 0.6387 | 0.9353 | 0.7591 | 2,877 |

## Important failures and limits

- Potato healthy has only 16 frozen examples and remains the weakest class:
  precision 0.4444, recall 0.25, F1 0.32.
- Field performance varies substantially by source and capture protocol.
- Results assume correct expected-crop metadata. Wrong metadata can turn a
  supported leaf into `U` or a wrong health prediction.
- This is leaf-level screening, not a field-level measurement.
- Independent, protocol-matched field validation and governance review are
  required before any production use.

## Reproducibility

Training config: `dinov2_conditioned_finetune_v10.json`; checkpoint SHA-256:
`29e36588d6d33200f774fb3c298a27ba412ecc221b9a7d8f08d594fd616e35e8`;
ONNX SHA-256:
`f53536a738078c6d355ecb4633393c31e2b3fc8ef2ea77a9b29f86aa67b0fe7f`.
See the research promotion report and dataset audit for gate and provenance
evidence.
