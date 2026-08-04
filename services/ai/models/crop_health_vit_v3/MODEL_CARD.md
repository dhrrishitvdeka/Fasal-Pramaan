# FasalPramaan Crop Health ViT v3 (experimental)

This 22.2 MB offline ONNX ViT classifies leaf images into healthy/disease for
maize, paddy, potato, and wheat, plus an invalid/out-of-domain class. The
product adapter combines the model with trusted expected-crop metadata and
returns presentation workflow grades A, B, C, or U.

It is not promoted and is not production validated. On 12,167 frozen images,
it achieved macro-F1 0.765, balanced accuracy 0.853, OOD recall 0.834, and ID
coverage 0.762. It failed the pre-frozen source-held-out macro-F1 gate
(0.441 versus 0.60) and calibrated ECE gate (0.208 versus 0.12). Potato healthy
had only 16 test examples, so its apparent recall is particularly uncertain.
The public initialization's original training IDs were unavailable, leaving
an unresolved overlap risk.

Intended use is a local presentation and human-reviewed crop-health screening
prototype. A means a confident healthy signal, B means uncertainty/manual
review, C means a disease-pattern signal, and U means unusable, unsupported,
OOD, crop mismatch, or missing expected-crop metadata. These are not severity,
commodity quality, affected area, yield loss, claim eligibility, or payout
grades. Every output requires human review.

The adapter needs leaf-focused RGB images and trusted crop-cycle metadata.
Performance is not established for other crops, wide-field damage, lodging,
flooding, waterlogging, aerial imagery, severity, or affected area. Field
domain shift and overconfidence are the main known limitations. Use the
`crop_vit` adapter as rollback.
