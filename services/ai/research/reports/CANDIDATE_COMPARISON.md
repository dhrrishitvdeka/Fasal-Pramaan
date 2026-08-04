# Candidate comparison and decision

All candidates used the frozen grouped splits and nine-class taxonomy. Metrics
below are from the same 12,167-row test set; all entries remain
`is_production_validated=false`.

| Candidate | Field macro-F1 | Balanced accuracy | OOD recall | ID coverage | Outcome |
|---|---:|---:|---:|---:|---|
| MobileNetV2 baseline | 0.044 | 0.105 | 0.486 | 0.625 | Baseline only |
| Public ViT before local tuning | 0.293 | 0.386 | 0.177 | 0.984 | Ineligible: upstream overlap unknown |
| ViT-Tiny candidate | 0.558 | 0.772 | 0.304 | 0.985 | OOD gate failed |
| EfficientNetV2-S | 0.368 | 0.466 | 0.660 | 0.588 | Accuracy/coverage failed |
| ConvNeXt-Tiny | 0.098 | 0.281 | 0.617 | 0.324 | Accuracy/size failed |
| DeiT-Small | 0.335 | 0.405 | 0.635 | 0.409 | Accuracy/coverage failed |
| Full-data ViT v2 | 0.594 | 0.728 | 0.445 | 0.956 | Accuracy/OOD failed |
| Crop-aware ViT v3 + expected-crop hierarchy | 0.765 | **0.853** | 0.834 | 0.762 | Former best; two gates failed |
| Domain-robust v4, one completed epoch | 0.726 | 0.779 | 0.831 | 0.762 | Rejected; worse than v3 |
| DINOv2 crop-conditioned v12 | 0.776 | 0.791 | 0.930 | 0.852 | Field-source gate failed |
| DINOv2 field-expanded v13 | 0.795 | 0.807 | 0.941 | 0.835 | Field-source gate failed |
| DINOv2 partial fine-tune v14 | **0.807** | **0.819** | **0.935** | **0.836** | All frozen internal gates passed |

V14 adds source-balanced training and partial fine-tuning of the final two
DINOv2 blocks. It passed the unchanged source-held-out field gate (0.639 versus
0.60), calibration gate (ECE 0.016 versus 0.12), and every other frozen
internal gate. Thresholds were not weakened. Its weakest result is potato
healthy (16 examples, precision 0.444, recall 0.25, F1 0.32). It is packaged
as the local presentation default with mandatory human review and
`crop_health_v3` rollback. Internal promotion is not independent field or
production validation, so `is_production_validated=false` remains fixed.
