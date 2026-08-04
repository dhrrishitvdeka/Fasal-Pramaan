# Contributing to FasalPramaan

Thank you for improving FasalPramaan. Keep changes focused, reproducible, and
honest about the model and deployment boundaries.

## Before contributing

1. Read [Getting started](GETTING_STARTED.md) and the
   [architecture](docs/architecture.md).
2. Create a branch such as `feat/...`, `fix/...`, `docs/...`, or `chore/...`.
3. Never commit `.env`, API keys, credentials, farmer evidence, personal data,
   private datasets, or production service URLs.
4. Keep model output assistive and preserve mandatory human review.
5. Update documentation and tests whenever behavior or configuration changes.

## Required checks

```powershell
# API and model services
docker compose exec api pytest -q
docker compose exec ai pytest -q

# Flutter app, using the pinned Docker build environment
docker build --target tester -t fasalpramaan-mobile-test apps/mobile

# Reviewer dashboard
Set-Location apps/dashboard
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Use `scripts/verify-e2e.ps1` with five distinct JPEGs for changes to capture,
storage, classification, worker processing, or the reviewer queue.

## Pull requests

- Explain the user-facing outcome and verification performed.
- Keep unrelated refactors separate.
- Add no generated dependencies, build output, local databases, or evidence.
- Disclose limitations; never describe internal evaluation as independent
  field validation or production approval.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
