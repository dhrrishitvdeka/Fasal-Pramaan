# MVP verification — 2026-07-23

## Model artifact

- Adapter: `crop_health_v4` (`4.0.0-dinov2-v14`).
- ONNX SHA-256: `f53536a738078c6d355ecb4633393c31e2b3fc8ef2ea77a9b29f86aa67b0fe7f`.
- Size: 86,698,536 bytes.
- PyTorch/ONNX top-1 parity: 1.0 on 144 validation images.
- Maximum probability absolute error: 0.000005930662.
- CPU p95: 156.98 ms with two ONNX Runtime threads.
- No quantization was needed because FP32 is below the frozen 100 MiB gate.

## Automated checks

- AI source tests: 39 passed, 2 skipped.
- AI Ruff check: passed.
- AI Docker model-load test without the source bind mount: passed; artifact
  size, SHA-256 and adapter readiness matched the versioned metadata.
- API tests inside Compose after the seed-safety change: 43 passed, 1
  environment-dependent test skipped.
- Dashboard ESLint: passed.
- Dashboard TypeScript check: passed.
- Dashboard tests: 2 passed.
- Dashboard production build: passed.
- `docker compose config --quiet`: passed.
- `git diff --check`: passed.

## Docker and HTTP

The AI image excludes the local research virtual environment. Its incremental
build context was 39.59 kB, and a no-bind-mount container proved that the ONNX
artifact is baked into the image rather than supplied only by Compose. The full
`docker compose up -d --build` completed successfully.

Final live checks:

- API `/health`: `ok`; database, Redis, storage, and AI all `ok`.
- AI `/health`: `ok`; default `crop_health_v4`; v14 artifact ready.
- Dashboard: HTTP 200.
- Live `/v1/analyze`: returned adapter `crop_health_v4`,
  `is_production_validated=false`, a safe `U` abstention for an unsuitable
  synthetic/cartoon input, recapture guidance, and `null` severity/affected
  area.
- The presentation helper processed a licensed paddy validation image through
  the live service and returned `C / disease_pattern_signal` at 0.9702, with
  production validation false and severity/affected area null. This is a
  smoke example, not an accuracy estimate.
- A clean-volume rebuild seeded five clearly watermarked synthetic cases and
  corresponding MinIO JPEG objects. Each returned HTTP 200; fixture
  predictions identify themselves as `mock / synthetic-seed-v1` and have null
  AI severity/area.
- LAN smoke checks returned HTTP 200 for dashboard, API, AI, and evidence URLs
  using the host's private IPv4 address.

The ONNX artifact is baked into the AI image. The network-disabled test proves
runtime model loading and adapter tests do not require an external download.

## Honest release status

This is presentation-ready local software, not a production-validated model.
V14 passed all frozen internal gates: macro-F1 0.8068, balanced accuracy
0.8193, source-held-out field macro-F1 0.6393, OOD recall 0.9353, ID coverage
0.8362, and ECE 0.0162. Potato healthy remains weak (16 examples, recall 0.25,
F1 0.32), and independent protocol-matched field validation is still missing.
Human review is mandatory; `crop_health_v3` and `crop_vit` are retained as
rollbacks.
