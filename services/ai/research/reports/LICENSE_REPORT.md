# Dataset licence and lineage report

Manifest v6 contains 58,516 checksum-locked image rows. Raw images are
downloaded locally and are not redistributed by this repository. Every
selected source permits commercial use, but CC BY attribution obligations
remain. Counts below are the accepted, deduplicated manifest rows rather than
upstream headline counts.

| Source | Split role and accepted rows | Licence | Pinned revision | Upstream |
|---|---|---|---|---|
| Digital Green Crop Disease Images | train 755; validation 298 | CC BY 4.0 | `d47d7eb88b1865062f821edcf58c28d8a7013718` | [source](https://huggingface.co/datasets/DigiGreen/Crop_Disease_Images) |
| MLD maize | frozen test 1,996 | CC BY 4.0 | `10.17632/3myfctrgk3.1` | [source](https://data.mendeley.com/datasets/3myfctrgk3/1) |
| Seasonal corn leaf disease | train 2,007; validation 330 | CC BY 4.0 | `10.17632/vy629dngm8.1` | [source](https://data.mendeley.com/datasets/vy629dngm8/1) |
| Multi-Crop Leaf Disease Dataset | train 5,868; validation 1,002 | CC BY 4.0 | `10.17632/z6jp232g5j.1` | [source](https://data.mendeley.com/datasets/z6jp232g5j/1) |
| Paddy Doctor | train 7,412; validation 1,497; grouped test 1,498 | CC0 1.0 | `version-1` | [source](https://www.kaggle.com/datasets/imbikramsaha/paddy-doctor) |
| Cropped PlantDoc | frozen source-held-out/OOD test 2,515 | CC BY 4.0 | `5467f6012d78d1c446145d5f582da6096f852ae8` | [source](https://github.com/pratikkayal/PlantDoc-Dataset) |
| Enhanced Field-Based Potato Blight sample | train 210; validation 95 | CC BY 4.0 | `10.17632/pbnw43s6kt.1` | [source](https://data.mendeley.com/datasets/pbnw43s6kt/1) |
| Potato leaf healthy/late blight (Ethiopia) | train 280; validation 149 | CC BY 4.0 | `10.17632/v4w72bsts5.1` | [source](https://data.mendeley.com/datasets/v4w72bsts5/1) |
| Potato Leaf Disease Dataset | frozen test 84 | CC BY 4.0 | `10.17632/d5b3fzpw3g.1` | [source](https://data.mendeley.com/datasets/d5b3fzpw3g/1) |
| PLDD-UP | train 13,126; validation 2,134 | CC BY 4.0 | `10.17632/3j4nfkvp2n.1` | [source](https://data.mendeley.com/datasets/3j4nfkvp2n/1) |
| Potato leaf disease in uncontrolled environment | train 2,220; validation 800 | CC BY 4.0 | `d564ae2b7548f8a6ef99139ba69a1f82f2dfed5e` | [source](https://huggingface.co/datasets/Project-AgML/potato_leaf_disease_classification) |
| Rice Leaf Disease Image Samples | frozen test 5,932 | CC BY 4.0 | `10.17632/fwcj7stb8r.1` | [source](https://data.mendeley.com/datasets/fwcj7stb8r/1) |
| Rice Field Weed Dataset V3 | train/OOD 3,077; validation/OOD 1,269 | CC BY 4.0 | `10.17632/mt72bmxz73.3` | [source](https://data.mendeley.com/datasets/mt72bmxz73/3) |
| RiceLeafBD | train 1,006; validation 445 | CC BY 4.0 | `10.17632/kx9rx8p2mz.1` | [source](https://data.mendeley.com/datasets/kx9rx8p2mz/1) |
| RiceyLeafDisease | train 1,135; validation 517 | CC BY 4.0 | `10.17632/t46kkgh2yw.1` | [source](https://data.mendeley.com/datasets/t46kkgh2yw/1) |
| Wheat nitrogen deficiency and leaf rust | train 617; validation 100; grouped test 142 | CC0 1.0 | `version-1` | [source](https://www.kaggle.com/datasets/jocelyndumlao/wheat-nitrogen-deficiency-and-leaf-rust-image) |

The pretrained DINOv2 ViT-S/14 encoder was pinned to revision
`bdc84086a163e3e7e6745d534c5f44c97dd493ef` and is Apache-2.0.

## Deliberately excluded source

PlantVillage (CC BY-SA 3.0) did not enter the selected weights. Share-alike
implications for redistributed derived weights require a separate legal
decision.

## Audit evidence

- Manifest: `manifest_v6.jsonl`, SHA-256
  `fa9b7d2e691feb7feb04d17b80c94d3e1ec72a7cd928c574894c2b1da82a8eff`.
- Audit: `dataset_audit_v6.json`; all required split, hash, duplicate, licence,
  and QA checks passed.
- Manual QA: 84 accepted review samples across the v6 source/class sheets.
- Frozen test: 12,167 rows; ID SHA-256
  `f00eadb9c0c82ce90cf368441007e4a2364d81a82180a9a011728558b1e1d083`.

## Product boundary

These licences and this internal audit do not establish field efficacy. The
model remains `is_production_validated=false` and requires independent,
capture-protocol-matched field validation and governance review.
