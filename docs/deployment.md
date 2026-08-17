# Deployment Topology & Operational Orchestration

This guide outlines deployment options for Fasal-Pramaan across local workstations, local area network (LAN) exhibition setups, and enterprise container clusters.

---

## 1. Local Reference Deployment (Docker Compose)

The repository provides an automated, multi-container Compose topology encompassing the entire microservice ecosystem:

```powershell
Copy-Item .env.example .env
powershell -ExecutionPolicy Bypass -File .\scripts\start-portable.ps1
```

### Port Allocation & Binding Matrix

| Port | Service Component | Network Binding | Purpose |
|---|---|---|---|
| `3000` | Reviewer Command Centre (Next.js 14) | `0.0.0.0` (LAN) | Adjudication dashboard and GIS interface |
| `8085` | Field Mobile Application (Flutter/Nginx) | `0.0.0.0` (LAN) | Evidence capture and offline sync portal |
| `8000` | Core API Gateway (FastAPI) | `0.0.0.0` (LAN) | REST endpoints, Swagger docs, auth, and SSE |
| `8001` | Assistive AI Inference Service | `0.0.0.0` (LAN) | DINOv2 ViT-S/14 ONNX model health and inference |
| `9000` | MinIO S3 Evidence Object Store | `0.0.0.0` (LAN) | Direct presigned media upload and preview endpoint |
| `5432` | PostgreSQL 16 + PostGIS 3.4 | `127.0.0.1` (Host) | Relational and spatial data persistence |
| `6379` | Redis 7 Cluster | `127.0.0.1` (Host) | Message broker, task backend, and rate limits |
| `9001` | MinIO Storage Console | `127.0.0.1` (Host) | Storage bucket administration |

---

## 2. Multi-Device LAN Exhibition Deployment

To expose the field app and reviewer portal across mobile phones and laptops on a local Wi-Fi network:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-portable.ps1 -PublicHost 192.168.1.25
```

```bash
sh scripts/start-portable.sh 192.168.1.25
```

- Mobile Field App: `http://192.168.1.25:8085`
- Reviewer Command Centre: `http://192.168.1.25:3000`

---

## 3. Self-Contained Portable Packaging

To distribute a complete offline-executable package without requiring Git:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-portable-bundle.ps1
```

The bundle packages application code, pre-baked model weights, and database migrations into `dist/FasalPramaan-portable.zip`. Recipients need only Docker to run the entire stack.

---

## 4. Enterprise Cloud Architecture

For production enterprise deployment on Kubernetes (EKS / GKE / AKS):
- Ingress with TLS 1.3 termination and WAF.
- Managed PostgreSQL (Amazon RDS / Cloud SQL) with PostGIS extension.
- Distributed Redis cluster with Sentinel failover.
- Scalable Celery worker deployment dynamically auto-scaled based on queue depth.
- S3 / GCS versioned object storage with immutability retention policies.

For detailed enterprise hardening and SLA specifications, see [Production Readiness](./production-readiness.md).

---

## 5. Vercel dashboard + Supabase + Hugging Face

The local Docker Compose topology above is unchanged (`local/start.ps1` or `scripts/start-portable.ps1`). To host only the Next.js web app:

1. Connect this GitHub repo to Vercel. Set **Root Directory** to `apps/dashboard` (Settings → General). Framework Next.js. Do not leave Root Directory empty — that is why “No Next.js version detected” happens. Do not point it at `local/`.
2. Apply `scripts/setup_supabase.sql` then `scripts/setup_web_schema.sql` in the Supabase SQL editor. If the old open anon policies are already applied, run `scripts/lock_web_rls.sql`.
3. Set these env vars in Vercel (Production + Preview). Never commit values:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
   - `HF_TOKEN` (server-only token that can call the private Space)
   - `HF_SPACE_URL=https://dhrrishitvdeka-fasal-pramaan-api.hf.space`
   - `SITE_LOCK_PASSWORD`
   - `REVIEWER_EMAILS` (comma-separated reviewer emails)
4. Create Supabase Auth users. Reviewers are those emails (or `app_metadata.roles`). Everyone else is a farmer. Both use `/login`.
5. Farmer path: sign in → `/farmer/capture` → `POST /api/claims` (JWT + service role) → Hugging Face → reviewer `/review`.

Leave **`NEXT_PUBLIC_API_BASE_URL` unset** on Vercel. Do not point it at `http://api:8000`.

No extra location, maps, or weather API keys are required. GPS comes from the browser; the reviewer map uses OpenStreetMap tiles. Gemini (`GEMINI_API_KEY`) is Docker/FastAPI voice only.

Full variable list and “do not mix backends” notes: [supabase-integration.md](./supabase-integration.md), [environment-variables.md](./environment-variables.md).
