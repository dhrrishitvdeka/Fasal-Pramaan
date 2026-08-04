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
`fp-mobile`, `fp-worker`, `fp-beat`, `fp-db`, `fp-redis`, and `fp-minio`.
`fp-migrate` and `fp-seed` should exit successfully.

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

## Voice assistant demonstration

Set `VOICE_ASSISTANT_ENABLED=true` and `GEMINI_API_KEY` in `.env`, rebuild the
`api` and `mobile` services, then choose **Talk to Fasal Saathi** at startup
and sign in as the farmer. Keep the Gemini key server-side; the app uses only one-use
ephemeral session tokens.

Use `http://localhost:8085` for a browser demonstration. Microphone capture on
a different device via a plain `http://<LAN-IP>` URL may be blocked by the
browser because it is not a secure context; use HTTPS for that setup.

The complete script and tool boundary are in
[`docs/VOICE_ASSISTANT_DEMO.md`](docs/VOICE_ASSISTANT_DEMO.md).

## Model demonstration

One image:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\demo-model.ps1 `
  C:\path\to\leaf.jpg paddy
```

Complete evidence/worker/model verification:

```powershell
powershell -ExecutionPolicy Bypass -Command `
  "& .\scripts\verify-e2e.ps1 -ImagePaths @('wide.jpg','left.jpg','mid.jpg','right.jpg','close.jpg')"
```

The five JPEGs must be distinct because the API correctly rejects duplicate
evidence checksums.

This verifier authenticates both farmer and reviewer accounts and proves the
submission, all five images, and local model classification reach the same
reviewer queue/detail endpoints used by the dashboard.

## Evidence reminders

Each active crop cycle receives a 30-day plan for five guided photos. Farmers
can change the interval to 14–90 days, select four or five reminder photos,
snooze by up to seven days, or pause a plan. `fp-beat` checks due plans every
six hours and `fp-worker` writes in-app notifications. Native builds also keep
a local schedule for temporary offline periods. See
[`docs/EVIDENCE_REMINDERS.md`](docs/EVIDENCE_REMINDERS.md).

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
the same trusted network. Do not expose this local stack through router port forwarding.

## Logs and recovery

```powershell
docker compose logs --tail=100 api ai worker mobile dashboard
docker compose restart api ai worker mobile dashboard
```

To remove locally captured records while retaining the demo accounts and catalogs:

```powershell
docker compose stop worker beat
docker compose exec api python scripts/clear_operational_data.py --confirm-local-reset
docker compose start worker beat
```

## Stop

```powershell
docker compose down
```

This keeps the local database and MinIO volumes. Add `-v` only when you intend
to delete every local volume, including captured records.

## Portable archive

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-portable-bundle.ps1
```

Share the ZIP and `.sha256` file from `dist/`. The recipient needs Docker but
does not need Git, Flutter, Python, or Node.js.
