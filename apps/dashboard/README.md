# Fasal-Pramaan Reviewer Command Centre

The **Fasal-Pramaan Reviewer Command Centre** is an enterprise-grade Next.js 14 web application engineered for insurance claim adjudicators, agricultural officers, and loss assessment reviewers.

---

## 1. Core Features

- **Triage Review Queue**: Dynamic triage queue with real-time sorting and filtering by Evidence Confidence, Uncertainty Type, Integrity Status, and Severity.
- **Evidence Trust Inspector**: 4-component score cards (Quality, Coverage, Context, Integrity) displaying detailed deduction breakdowns.
- **Synchronized Multi-Angle Viewer**: High-resolution viewer enabling side-by-side inspection of all 5 canonical angles and comparison against recapture submissions.
- **PostGIS GIS Mapping**: Interactive spatial overlays showing registered plot boundary polygons, centroid markers, and capture GPS accuracy radii.
- **Human-in-the-Loop Adjudication**: Full decision support workflow (`Accept`, `Correct & Verify`, `Request Targeted Recapture`, `Escalate to Physical Inspection`, `Reject`) with mandatory reason logging and immutable audit history.

---

## 2. Running in Docker

The Command Centre is packaged within the root Docker Compose stack:

```bash
docker compose up -d --build dashboard
```

Access the dashboard at `http://localhost:3000`.

Pre-seeded login: `reviewer@fasalpramaan.local` / `Demo@12345`

---

## 3. Local Development (Docker API)

Use this when FastAPI is running on the laptop (`docker compose up` or `local/start.ps1`):

```bash
cd apps/dashboard
npm ci
cp .env.example .env.local
# For Docker API only:
# NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
# NEXT_PUBLIC_MEDIA_ORIGIN=http://localhost:9000
npm run dev
```

### Hosted / Vercel path (Supabase + Hugging Face)

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `HF_TOKEN` (server-only; calls the private Fasal-Pramaan Space)
- `HF_SPACE_URL` (optional; default `https://dhrrishitvdeka-fasal-pramaan-api.hf.space`)
- `SITE_LOCK_PASSWORD` (server-only site gate; required on Vercel)
- `REVIEWER_EMAILS` (comma-separated reviewer emails; everyone else is a farmer)
- `VOICE_ASSISTANT_ENABLED` / `GEMINI_API_KEY` / `GEMINI_LIVE_MODEL` / `GEMINI_LIVE_VOICE` / `GEMINI_LIVE_SESSION_MINUTES` (server-only Fasal Saathi; never `NEXT_PUBLIC_GEMINI*`)

Leave `NEXT_PUBLIC_API_BASE_URL` empty so the app uses `POST /api/claims` (persist + HF) and `/review` reads `web_claims`. Farmer and reviewer both sign in at `/login`.

GitHub → Vercel: set **Root Directory** to `apps/dashboard`. Do not point Vercel at `local/`. See [docs/supabase-integration.md](../../docs/supabase-integration.md).

### Static Analysis & Testing
```bash
npm run lint
npm run typecheck
npm test
npm run build
```
