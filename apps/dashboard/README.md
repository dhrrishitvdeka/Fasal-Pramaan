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

## 3. Local Development

```bash
cd apps/dashboard
npm ci

# Configure environment pointing to running API Gateway
export NEXT_PUBLIC_API_BASE_URL="http://localhost:8000"
export NEXT_PUBLIC_MEDIA_ORIGIN="http://localhost:9000"

npm run dev
```

### Static Analysis & Testing
```bash
npm run lint
npm run typecheck
npm test
npm run build
```
