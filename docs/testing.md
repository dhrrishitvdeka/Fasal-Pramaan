# Verification guide

## Local presentation smoke checks

```powershell
.\scripts\fp.ps1 health
docker compose ps
```

Expected: API and AI health endpoints return 200; API reports DB, Redis, storage and AI as healthy; dashboard is reachable.

## Automated checks

```powershell
docker compose run --rm api ruff check --no-cache app tests alembic
docker compose run --rm api pytest -q
docker compose run --rm ai ruff check --no-cache app tests
docker compose run --rm ai pytest -q

cd apps\dashboard
npm run lint
npm run typecheck
npm test
npm run build
```

The API suite covers authorization/jurisdiction, token revocation and refresh reuse, upload/finalize integrity, production configuration and review workflow. The AI suite covers adapters, service authentication and sanitized errors.

## Mobile checks

When Flutter is installed:

```powershell
cd apps\mobile
flutter analyze
flutter test
```

Before showing mobile in a presentation, also test real-device camera, GPS, offline capture, app restart, sync resume, and token refresh. Do not imply a pass when Flutter/device checks were not run.
