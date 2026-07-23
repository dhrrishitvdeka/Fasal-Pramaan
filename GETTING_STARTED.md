# Getting started

This guide prepares a clean FasalPramaan presentation environment. It uses
synthetic accounts and local services only.

## Prerequisites

- Windows, macOS, or Linux
- Docker Desktop or Docker Engine
- Docker Compose v2
- At least 8 GB RAM and 12 GB free disk space recommended for the first build

Flutter, Python, Node.js, PostgreSQL, Redis, and MinIO do not need to be
installed on the host.

## Start on Windows

```powershell
Copy-Item .env.example .env
powershell -ExecutionPolicy Bypass -File .\scripts\start-portable.ps1
```

## Start on macOS or Linux

```bash
cp .env.example .env
sh scripts/start-portable.sh
```

The launcher builds the images, runs database migrations, seeds synthetic
demo records, waits for the services, and prints the URLs.

## Presentation surfaces

1. Open `http://localhost:8085`.
2. Sign in as `farmer@fasalpramaan.local` / `Demo@12345`.
3. Open **Capture Crop Evidence** to show the seeded crop cycle and guided
   three-angle capture.
4. Open `http://localhost:3000`.
5. Sign in as `reviewer@fasalpramaan.local` / `Demo@12345`.
6. Show **Overview**, **Live map**, **Review queue**, **Analytics**, **Alerts**,
   and **System health**.

The five seeded submissions use visibly labelled synthetic workflow
predictions. Use `scripts/demo-model.ps1` or `scripts/verify-e2e.ps1` when you
want to demonstrate the real v4 model.

## Health verification

```powershell
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:8001/health
(Invoke-WebRequest http://localhost:3000 -UseBasicParsing).StatusCode
(Invoke-WebRequest http://localhost:8085/healthz -UseBasicParsing).StatusCode
```

Expected AI health fields include:

```json
{
  "default_adapter": "crop_health_v4",
  "crop_health_v4_model": true,
  "inference_ready": true
}
```

## Another device on the same LAN

Replace the example address with the Docker host's LAN IP:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-portable.ps1 `
  -PublicHost 192.168.1.25
```

Open `http://192.168.1.25:8085` or `http://192.168.1.25:3000` from the other
device. Permit only the required ports on a trusted private firewall profile.

## Stop or reset

```powershell
# Keep demo data
docker compose down

# Delete local synthetic database/evidence and reseed next start
docker compose down -v
```

Never use real farmer data, production credentials, or real claim decisions in
this presentation environment.
