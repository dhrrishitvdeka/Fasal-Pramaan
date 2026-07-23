# Sources and licences

This experimental model was initialized from the MIT-licensed
`wambugu71/crop_leaf_diseases_vit_onnx` ViT-Tiny artifact and fine-tuned using
the versioned manifest at `services/ai/research/manifest_v1.jsonl`.

Training and validation sources:

- Multi-crop leaf dataset — CC BY 4.0.
- Paddy Doctor — CC0 1.0.
- Wheat IARI subset — CC0 1.0.

The frozen evaluation additionally uses maize MLD (CC BY 4.0), PlantDoc
(CC BY 4.0), a potato field dataset (CC BY 4.0), and a rice field dataset
(CC BY 4.0). Full URLs, revisions, checksums, exclusions, and attribution are
recorded in `services/ai/research/config/sources_v1.json`,
`services/ai/research/download_lock_v1.json`, and
`services/ai/research/reports/LICENSE_REPORT.md`.

PlantVillage was isolated from this run because its share-alike implications
for redistributed weights were not resolved. This record is technical
provenance, not legal advice.
