# Getting started

This guide starts a clean local FasalPramaan environment from a fresh GitHub
clone. The ONNX model, Compose stack, seed data, and app sources are all
versioned in the repository.

It includes four demo login accounts but starts with no farms, plots, crop
cycles, submissions, images, reviews, alerts, or notifications.

## Prerequisites

- Windows, macOS, or Linux
- Docker Desktop or Docker Engine
- Docker Compose v2
- Git (only to clone; not required at runtime)
- At least 8 GB RAM and 12 GB free disk space recommended for the first build

Flutter, Python, Node.js, PostgreSQL, Redis, and MinIO do not need to be
installed on the host.

## Clone

```bash
git clone https://github.com/dhrrishitvdeka/Fasal-Pramaan.git
cd Fasal-Pramaan
```

Optional: pin a release tag (for example `V1.1.1`):

```bash
git clone --branch V1.1.1 https://github.com/dhrrishitvdeka/Fasal-Pramaan.git
cd Fasal-Pramaan
```

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

The launcher builds the images, runs database migrations, creates the demo
accounts and required reference catalogs, waits for the services, and prints
the URLs.

## End-to-end local workflow

1. Open `http://localhost:8085`.
2. Sign in as `farmer@fasalpramaan.local` / `Demo@12345`.
3. Create a farm, plot, and crop cycle with the app or the confirmed voice
   actions. These records are stored in the local PostgreSQL database.
4. Open **Capture Crop Evidence**. On a phone, grant camera and location
   permission and take all five required angles. On a laptop browser the
   camera or GPS is often missing — tap capture anyway; the web app uses
   sample frames and a demo location so the local flow can finish.
5. Select **Save & submit**. The app uploads the images, finalizes the
   submission, and queues the local classifier automatically.
6. Open `http://localhost:3000` and sign in as
   `reviewer@fasalpramaan.local` / `Demo@12345`.
7. Open **Review queue**. The case shows photos, location, and an A/B/C/U
   screening grade (not an insurance severity). Accept, correct, request
   recapture, or send it for physical inspection.

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
# Keep locally captured records
docker compose down

# Clear operational records but preserve demo accounts and reference catalogs
docker compose stop worker beat
docker compose exec api python scripts/clear_operational_data.py --confirm-local-reset
docker compose start worker beat
```

This local reference deployment is not a production claims-decision system.
