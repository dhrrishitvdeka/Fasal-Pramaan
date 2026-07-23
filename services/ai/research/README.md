# Crop-health model research

This directory is the reproducible evidence pipeline for `goal.md`. Raw public
datasets are downloaded into the gitignored `data/` directory; their pinned
URLs, licences, archive checksums, per-image manifest rows, split assignments,
and measured reports are versioned.

The selected task is a nine-class crop/leaf screening problem:

- healthy and disease-pattern classes for maize, paddy, potato, and wheat;
- one explicit invalid/out-of-domain class.

Disease names remain in the manifest for auditability, but the first product
release maps them to the A/B/C/U screening contract. It does not estimate
severity, affected area, yield loss, commodity quality, claim eligibility, or
payout.

## Selected v14 evidence path

Run research commands from `services/ai` with `research/requirements.txt`
installed. The selected result is tied to:

- `manifest_v6.jsonl` and `reports/dataset_audit_v6.json`;
- `config/dinov2_conditioned_finetune_v10.json`;
- the pre-test lock `config/conditioned_contract_v14.json`;
- `reports/conditioned_product_evaluation_v14.json`;
- `reports/conditioned_onnx_export_v14.json`; and
- `reports/promotion_report_v14.json`.

The source downloaders and manifest builder verify pinned archive/file hashes:

```powershell
python research/scripts/download_sources.py --all
python research/scripts/download_digigreen.py
python research/scripts/download_field_expansion.py all
python research/scripts/download_field_expansion_v2.py all
python research/scripts/download_pldd_up.py
python research/scripts/download_field_expansion_v3.py
python research/scripts/build_manifest_v6.py
python research/scripts/audit_manifest_v6.py
```

The v14 fine-tune is a locked continuation from the hash-pinned v13
validation-selected checkpoint. Once that prior checkpoint and the materialized
manifest are present, the frozen commands are:

```powershell
python research/scripts/train_conditioned_dino.py --config dinov2_conditioned_finetune_v10.json
python research/scripts/evaluate_conditioned_dino.py --contract conditioned_contract_v14.json --report-version v14
python research/scripts/export_conditioned_dino_v14.py
python research/scripts/build_promotion_report_v14.py
```

The immutable test command must not be rerun for model or threshold selection.
For normal clone-and-run use, none of these research downloads or training
commands are needed: the hash-locked ONNX artifact is already vendored in the
AI image context.

`config/promotion_thresholds_v1.json` was versioned before candidate training,
and `build_promotion_report_v14.py` fails the report if a frozen gate or export
check is not satisfied.

No dataset image is redistributed by this repository. The final model remains
`is_production_validated=false` until independent field validation and a
governance review explicitly approve promotion.
