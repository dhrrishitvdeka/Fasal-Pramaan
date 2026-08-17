# Getting Started with Fasal-Pramaan

Welcome to **Fasal-Pramaan (*फसल प्रमाण*)** — the AI-assisted crop evidence capture, trust evaluation, and verification platform.

This guide walks you through setting up and running the complete distributed platform locally using Docker. All microservices, database schemas, seed accounts, and local Vision Transformer ONNX model artifacts are packaged within the repository.

---

## 1. Prerequisites

- **Operating System**: Windows 10/11, macOS (Apple Silicon or Intel), or Linux (Ubuntu 22.04+ recommended).
- **Container Runtime**: Docker Desktop or Docker Engine (version 24.0+) with Docker Compose v2.
- **Hardware Requirements**: Minimum 8 GB RAM and 12 GB free disk space (for base images and dependencies).
- **Git**: For cloning the repository.

*Note: You do not need to install Python, Flutter, Node.js, PostgreSQL, Redis, or MinIO on your host machine. Everything runs containerized inside Docker.*

---

## 2. Clone & Launch

### Step 1: Clone the Repository
```bash
git clone https://github.com/dhrrishitvdeka/Fasal-Pramaan.git
cd Fasal-Pramaan
```

### Step 2: Configure Environment
Copy the pre-configured environment template:
```bash
# Windows (PowerShell)
Copy-Item .env.example .env

# macOS / Linux (Bash)
cp .env.example .env
```

### Step 3: Start the Platform

#### Windows (PowerShell Launcher)
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-portable.ps1
```

#### macOS / Linux (Bash Launcher)
```bash
sh scripts/start-portable.sh
```

#### Alternative: Direct Docker Compose
```bash
docker compose up -d --build
```

The launcher automatically builds all container images, runs Alembic database migrations, seeds reference crop catalogs and test accounts, waits for health checks to pass, and prints application URLs.

From the `local/` folder you can also run `.\start.ps1` / `sh start.sh` (same Docker stack). Do not point Vercel at `local/`.

---

## Hosted web (Vercel) — not this Docker walkthrough

To run **only** the Next.js farmer/reviewer app on Vercel (Supabase + Hugging Face, no FastAPI):

1. SQL: `scripts/setup_supabase.sql` then `scripts/setup_web_schema.sql`.
2. Vercel env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `HF_TOKEN`, optional `NEXT_PUBLIC_HF_MODEL_ID`.
3. Leave `NEXT_PUBLIC_API_BASE_URL` unset. No Maps / weather / Gemini keys.

Details: [docs/supabase-integration.md](docs/supabase-integration.md) and [docs/deployment.md](docs/deployment.md).

---

## 3. Accessing System Portals

| Application Portal | Local URL | Pre-Seeded Credentials | Role & Purpose |
|---|---|---|---|
| **Farmer Field App** | `http://localhost:8085` | `farmer@fasalpramaan.local` / `Demo@12345` | Farm registration, guided 5-angle capture, offline sync, status tracking |
| **Field Officer Portal** | `http://localhost:8085` | `officer@fasalpramaan.local` / `Demo@12345` | Jurisdiction-scoped assisted capture and field validation |
| **Reviewer Command Centre** | `http://localhost:3000` | `reviewer@fasalpramaan.local` / `Demo@12345` | Review queue, GIS mapping, evidence score breakdown, claim adjudication |
| **System Administrator** | `http://localhost:3000` | `admin@fasalpramaan.local` / `Demo@12345` | User administration, audit log inspection, system health metrics |
| **API Gateway & Swagger** | `http://localhost:8000/docs` | Bearer Token Auth | Interactive OpenAPI documentation and REST testing |
| **AI Inference Service** | `http://localhost:8001/health` | `X-Service-Token` Header | Vision Transformer inference health and model metadata |
| **MinIO S3 Evidence Vault** | `http://localhost:9001` | `minioadmin` / `minioadmin_dev_only` | S3-compatible private object storage console |

---

## 4. Complete 10-Minute End-to-End Walkthrough

### 1. Register Farm, Plot & Crop Cycle
1. Open `http://localhost:8085` in your browser and sign in as the farmer (`farmer@fasalpramaan.local` / `Demo@12345`).
2. Navigate to **Farms** $\rightarrow$ **Add Farm** (e.g., *"Kisan Samriddhi Farm"*).
3. Under the farm, tap **Add Plot** (e.g., *"North Plot 1"*, 2.5 Hectares).
4. Tap **Start Crop Cycle**, select **Paddy (Rice)**, and set season to **Kharif 2026**.

### 2. Capture Guided Evidence
1. On the active crop cycle, tap **Capture Crop Evidence**.
2. Capture the 5 canonical angles following the on-screen framing guides:
   - `wide_field` (Landscape overview)
   - `left_context` (Left lateral perspective)
   - `mid_canopy` (Eye-level canopy structure)
   - `right_context` (Right lateral perspective)
   - `closeup_damage` (Macro symptomatic leaf/crop view)
3. Enter optional farmer observations (e.g., *"Observed leaf yellowing and brown spots on lower leaves"*).
4. Tap **Save & Submit**. The app uploads the encrypted images to MinIO and finalizes the submission.

### 3. Review & Adjudicate
1. Open `http://localhost:3000` in a new browser tab and sign in as the reviewer (`reviewer@fasalpramaan.local` / `Demo@12345`).
2. Navigate to **Review Queue**. The newly submitted case will appear in the queue.
3. Open the case detail to inspect:
   - **Evidence Confidence Score** (e.g., `92.4 / 100` — Evidence Sufficient).
   - **4-Component Score Breakdown** (Quality: `95.0`, Coverage: `100.0`, Context: `85.0`, Integrity: `100.0`).
   - **DINOv2 AI Screening Grade** (Grade `C` — Disease Pattern Detected).
   - **Interactive GIS Map** with PostGIS plot boundary overlay and capture GPS pin.
4. Click **Accept Claim** or **Correct Assessment** with an override note. The case status updates to `verified` and writes an immutable audit record.

---

## 5. Verifying System Health

Verify all microservice health endpoints:

```bash
# API Gateway
curl http://localhost:8000/health

# AI Inference Service
curl http://localhost:8001/health

# Reviewer Command Centre
curl -I http://localhost:3000

# Field Mobile Web App
curl -I http://localhost:8085/healthz
```

Expected AI Health Response:
```json
{
  "status": "healthy",
  "default_adapter": "crop_health_v4",
  "crop_health_v4_model": true,
  "inference_ready": true
}
```

---

## 6. Stopping & Resetting the Environment

```bash
# Stop all containers while preserving database and evidence volumes
docker compose down

# Stop all containers and remove all local volumes (clean state reset)
docker compose down -v

# Clear captured operational data while preserving seed accounts and crop catalogs
docker compose stop worker beat
docker compose exec api python scripts/clear_operational_data.py --confirm-local-reset
docker compose start worker beat
```
