# Operations & Exhibition Running Guide

This guide provides day-to-day operational commands, exhibition setup instructions, health verification probes, and diagnostic workflows for Fasal-Pramaan.

---

## 1. Starting & Stopping the Platform

### Start Commands
```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File .\scripts\start-portable.ps1

# Linux / macOS Bash
sh scripts/start-portable.sh

# Direct Docker Compose
docker compose up -d --build

# Same stack from the local/ kit
.\local\start.ps1
```

Hosted farmer/reviewer (Vercel + Supabase + Hugging Face) is documented in [docs/supabase-integration.md](docs/supabase-integration.md). Do not set `NEXT_PUBLIC_API_BASE_URL` on Vercel.

### Verified Active Containers
Ensure all expected long-running containers are in the `Up` state:
```bash
docker compose ps
```
- `fp-api`: FastAPI REST Gateway (`:8000`)
- `fp-ai`: DINOv2 ViT-S/14 Inference Service (`:8001`)
- `fp-dashboard`: Next.js 14 Reviewer Command Centre (`:3000`)
- `fp-mobile`: Flutter Field Web App (`:8085`)
- `fp-worker`: Celery Asynchronous Worker Pool
- `fp-beat`: Celery Beat Recurring Schedule Engine
- `fp-db`: PostgreSQL 16 + PostGIS 3.4 (`:5432`)
- `fp-redis`: Redis 7 Message Broker (`:6379`)
- `fp-minio`: MinIO S3 Object Storage (`:9000`, `:9001`)

### Stop Commands
```bash
# Gracefully stop containers (preserves database and evidence)
docker compose down

# Stop and wipe all local persistent volumes
docker compose down -v
```

---

## 2. Multi-Device Exhibition Setup (LAN Demo)

To demonstrate the mobile field app and reviewer dashboard across multiple physical devices (e.g., iPhone/Android phone + Laptop) on the same Wi-Fi network:

### Step 1: Launch with Host LAN IP
```powershell
# Windows
powershell -ExecutionPolicy Bypass -File .\scripts\start-portable.ps1 -PublicHost 192.168.1.25

# Linux / macOS
sh scripts/start-portable.sh 192.168.1.25
```

### Step 2: Open Applications on Client Devices
- **Farmer Phone (Mobile Browser)**: Navigate to `http://192.168.1.25:8085`
- **Reviewer Laptop**: Navigate to `http://192.168.1.25:3000`

*Note: Ensure your operating system firewall permits inbound TCP traffic on ports 8085, 3000, 8000, and 9000 for private network profiles.*

---

## 3. Voice Assistant Demonstration (Fasal Saathi)

Fasal Saathi provides full-duplex spoken assistance in Hindi and English using the Google Gemini Live API.

### Step 1: Enable Server-Side Gemini Key
Add your Gemini API key to `.env`:
```dotenv
VOICE_ASSISTANT_ENABLED=true
GEMINI_API_KEY=your_google_ai_studio_api_key
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
GEMINI_LIVE_VOICE=Kore
```

### Step 2: Rebuild & Restart Services
```powershell
docker compose up -d --build api mobile
```

### Step 3: Run Spoken Demo
1. Open `http://localhost:8085` and click **Talk to Fasal Saathi**.
2. Sign in as `farmer@fasalpramaan.local` / `Demo@12345`.
3. Try spoken commands in Hindi or English:
   - *"मेरे खेत बताओ"* or *"List my farms."*
   - *"इस फसल चक्र के लिए प्रमाण कैप्चर शुरू करो"*
   - *"फोटो खींचो"* (Advances through the 5 canonical angles)
   - *"ऑब्जर्वेशन लिखो: पत्तों पर भूरे धब्बे हैं"*
   - *"क्यू सिंक करो"* (Assistant explains the upload and asks for spoken confirmation before proceeding)

For the complete spoken script and safety boundaries, see [docs/VOICE_ASSISTANT_DEMO.md](docs/VOICE_ASSISTANT_DEMO.md).

---

## 4. Automated Testing & Quality Probes

### 4.1 Single-Image Model Test CLI
Test the local DINOv2 ONNX classifier on any arbitrary image file directly from the terminal:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\demo-model.ps1 C:\path\to\leaf_sample.jpg paddy
```

### 4.2 Full End-to-End Automated Pipeline Verification
Execute an automated test simulating complete farmer capture, upload, checksum validation, worker processing, DINOv2 inference, Evidence Trust calculation, and reviewer queue verification:
```powershell
powershell -ExecutionPolicy Bypass -Command `
  "& .\scripts\verify-e2e.ps1 -ImagePaths @('wide.jpg','left.jpg','mid.jpg','right.jpg','close.jpg')"
```

### 4.3 Running Unit & Integration Test Suites
```powershell
# API Gateway & Evidence Engine Tests
docker compose exec api pytest -v

# AI Model Inference Tests
docker compose exec ai pytest -v

# Reviewer Dashboard Tests (TypeScript, Lint & Jest)
cd apps\dashboard
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
cd ..\..

# Mobile App Flutter Tests
docker build --target tester -t fasalpramaan-mobile-test apps/mobile
```

---

## 5. Log Inspection & Operational Diagnostics

### Real-Time Log Streaming
```bash
# View combined logs
docker compose logs -f --tail=100 api ai worker

# View specific service logs
docker compose logs -f api
docker compose logs -f worker
```

### Resetting Operational Data
To wipe test submissions, images, and reviews while preserving seed user accounts and crop catalogs:
```powershell
docker compose stop worker beat
docker compose exec api python scripts/clear_operational_data.py --confirm-local-reset
docker compose start worker beat
```

### Creating a Portable Distribution Bundle
Generate a self-contained ZIP archive for offline sharing without requiring Git:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-portable-bundle.ps1
```
The output package lands in `dist/FasalPramaan-portable.zip`.
