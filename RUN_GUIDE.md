# FasalPramaan operations guide

## Start

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-portable.ps1
```

macOS/Linux:

```bash
sh scripts/start-portable.sh
```

Direct Compose:

```powershell
docker compose up -d --build
docker compose ps
```

Expected long-running containers: `fp-api`, `fp-ai`, `fp-dashboard`,
`fp-mobile`, `fp-worker`, `fp-db`, `fp-redis`, and `fp-minio`. `fp-migrate`
and `fp-seed` should exit successfully.

## URLs

- Field app: `http://localhost:8085`
- Reviewer dashboard: `http://localhost:3000`
- API health: `http://localhost:8000/health`
- AI health: `http://localhost:8001/health`
- API docs: `http://localhost:8000/docs`

## Health

```powershell
docker compose ps
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:8001/health
(Invoke-WebRequest http://localhost:3000 -UseBasicParsing).StatusCode
(Invoke-WebRequest http://localhost:8085/healthz -UseBasicParsing).StatusCode
(Invoke-WebRequest http://localhost:8085/backend/health -UseBasicParsing).StatusCode
```

The AI response must show `default_adapter: crop_health_v4`,
`crop_health_v4_model: true`, and `inference_ready: true`.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Farmer | `farmer@fasalpramaan.local` | `Demo@12345` |
| Field officer | `officer@fasalpramaan.local` | `Demo@12345` |
| Reviewer | `reviewer@fasalpramaan.local` | `Demo@12345` |
| Administrator | `admin@fasalpramaan.local` | `Demo@12345` |

## Model demonstration

One image:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\demo-model.ps1 `
  C:\path\to\leaf.jpg paddy
```

Complete evidence/worker/model verification:

```powershell
powershell -ExecutionPolicy Bypass -Command `
  "& .\scripts\verify-e2e.ps1 -ImagePaths @('wide.jpg','mid.jpg','close.jpg')"
```

The three JPEGs must be distinct because the API correctly rejects duplicate
evidence checksums.

## Tests

```powershell
# Flutter analyze + tests in pinned build environment
docker build --target tester -t fasalpramaan-mobile-test apps/mobile

# Dashboard
cd apps\dashboard
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
cd ..\..

# API and AI
docker compose exec api pytest
docker compose exec ai pytest
```

## LAN access

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-portable.ps1 `
  -PublicHost 192.168.1.25
```

Open `http://192.168.1.25:8085` and `http://192.168.1.25:3000` from a device on
the same trusted network. Do not expose this MVP through router port forwarding.

## Logs and recovery

```powershell
docker compose logs --tail=100 api ai worker mobile dashboard
docker compose restart api ai worker mobile dashboard
```

If the local synthetic data can be discarded:

```powershell
docker compose down -v
docker compose up -d --build
```

## Stop

```powershell
docker compose down
```

This keeps the synthetic database and MinIO volumes. Add `-v` only when you
intend to delete them.

## Portable archive

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-portable-bundle.ps1
```

Share the ZIP and `.sha256` file from `dist/`. The recipient needs Docker but
does not need Git, Flutter, Python, or Node.js.
