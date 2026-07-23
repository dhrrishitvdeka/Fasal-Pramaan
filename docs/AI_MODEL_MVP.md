# Local crop-health ViT MVP

The local presentation adapter is `crop_health_v4` (**DINOv2 ViT-S/14**). It
supports maize, paddy, potato, and wheat leaf images, needs trusted
`expected_crop` metadata, and returns A/B/C/U health-screening workflow
buckets. The ONNX model and sidecars are versioned under
`services/ai/models/crop_health_dinov2_v14/` (including `model.onnx`), so Docker
bakes weights into the AI image at build time and never downloads them at
startup.

The selected candidate passed every pre-frozen internal numerical gate.
Evaluation on the immutable 12,167-image test produced macro-F1 0.8068,
balanced accuracy 0.8193, source-held-out field macro-F1 0.6393, OOD rejection
recall 0.9353, supported-ID coverage 0.8362, and pre-decision ECE 0.0162. Its
weakest class is potato healthy (16 examples, precision 0.4444, recall 0.25,
F1 0.32). The dashboard and API must always show
`is_production_validated=false`; passing internal gates is not independent
field validation, and human review is mandatory.

Grades mean:

- A: confident healthy-leaf signal.
- B: uncertain signal; manual review.
- C: confident disease-pattern signal.
- U: unusable, unsupported, OOD, crop mismatch, or missing crop metadata.

They never mean loss severity, commodity quality, affected area, yield loss,
claim eligibility, or payout advice.

Start locally with `docker compose up -d --build`. For another device on the
same trusted network, copy `.env.example` to `.env`, set `PUBLIC_HOST` to the
host LAN IP, and open `http://<LAN-IP>:3000`. Roll back without rebuilding by
setting `AI_MODEL_ADAPTER=crop_health_v3` and recreating the `ai`, `api`, and
`worker` containers. `crop_vit` remains the older second rollback.
