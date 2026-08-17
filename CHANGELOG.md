# Changelog

All notable changes to **Fasal-Pramaan** will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.0] — 2026-08-18

### Added
- **Vercel-hosted farmer and reviewer web portal** (`apps/dashboard`):
  - Farmer capture at `/farmer/capture` persists real photos (no showcase or localStorage-only path).
  - Hugging Face inference on `POST /api/claims` using `wambugu71/crop_leaf_diseases_vit`.
  - Reviewer queue at `/review` lists the same claim IDs from Supabase `web_*` tables.
- **Supabase persistence** for the hosted web path: private bucket `fasal-web-evidence`, RLS on `web_*` tables, env-only credentials.
- **Root `vercel.json`** so Vercel builds `apps/dashboard` from the repository root.
- **Local run kit** in `local/` (`start.ps1`, `start.sh`, README). The laptop Docker Compose stack (FastAPI, Celery, PostGIS, MinIO) is unchanged.
- Documentation for the hosted path: `docs/deployment.md`, `docs/supabase-integration.md`, `docs/environment-variables.md`, `docs/security.md`.

### Security
- Removed a leaked database password from git history (rewritten `main`; rotate the Supabase DB password if you cloned before the rewrite).
- Tracked files are env-only: `SUPABASE_*`, `HF_TOKEN`, and related keys are never committed.
- Camera, microphone, and geolocation are allowed in the dashboard; CSP permits `*.supabase.co`.

### Fixed
- Empty `plot_id` from unregistered capture is stored as `null` so it does not violate `web_plots` foreign keys.
- Reviewer overview SQL join order (`missing FROM-clause entry for table evidence_evaluations_2`).
- Dashboard CI: Node 22, ESLint `--quiet`, unused-import rules for the farmer page.

### Removed
- Showcase interceptor, mock reviewer tokens, and `showcase-data.ts`. Farmer and reviewer tabs read live data only.

---

## [1.2.0] — 2026-08-17

### Added
- **4-Dimensional Evidence Confidence & Trust Evaluation Engine**:
  - Independent formulation: $\text{Final Confidence} = 0.4 \times \text{Quality} + 0.3 \times \text{Coverage} + 0.2 \times \text{Context} + 0.1 \times \text{Integrity}$.
  - Canonical threshold ($\ge 85.0$) for evidence sufficiency.
  - Deterministic 4-tier uncertainty classification with strict priority ordering ($\text{Integrity} \succ \text{Coverage} \succ \text{Visual} \succ \text{Context}$).
  - Immutable historical snapshot persistence in `evidence_evaluations` table with component breakdowns.
- **Adaptive Evidence Recapture Workflow**:
  - Replaces blanket 5-photo retakes with targeted angle requests (e.g. `closeup_damage`, `wide_field`).
  - Automated re-evaluation pipeline with exact confidence delta ($\Delta C$) calculation.
  - Bilingual farmer guidance (Hindi and English).
- **Comprehensive Documentation Architecture**:
  - Dedicated technical specifications: `docs/evidence-evaluation.md` and `docs/adaptive-recapture.md`.
  - Authoritative AI governance and safety boundary documentation (`docs/governance-and-safety.md`).
  - Model card and frozen benchmark validation metrics (`docs/AI_MODEL_MVP.md`).
  - Presentation-ready MUN exhibition showcase guide (`docs/demo-walkthrough.md`).

---

## [1.1.1] — 2026-08-13

### Fixed
- Web build runtime safety assertion: release web builds correctly bypass `DEMO_MODE=true` crash on startup.
- Reviewer adjudication handling: reviewers can accept DINOv2 `crop_health_v4` screening ($A/B/C/U$) when severity is empty.
- Finalization validation: finalization no longer fails on omitted photo timestamps when draft GPS is valid.
- Hindi/English transcript merge: word boundary spacing preserved in streaming voice assistant bubbles.

---

## [1.1.0] — 2026-08-04

### Added
- **Fasal Saathi Gemini Live Voice Assistant**: Full-duplex Hindi/English conversational assistant for farmers.
- Same-origin WebSocket proxy (`/api/v1/voice/live`) for secure ephemeral session token provisioning.
- Allowlisted voice tools with spoken confirmation gates for state-mutating operations.
- Recurring geo-tagged evidence reminders engine (`fp-beat` and `fp-worker`).
- Automated local upload, classification, and reviewer-queue pipeline.

---

## [1.0.0] — 2026-07-15

### Added
- Initial open-source release of Fasal-Pramaan.
- Flutter multi-platform field application with 5-angle guided capture and encrypted offline storage.
- Next.js 14 Reviewer Command Centre with PostGIS GIS mapping and audit trail.
- FastAPI REST Gateway with spatial jurisdiction RBAC and Alembic migrations.
- DINOv2 ViT-S/14 ONNX local inference microservice.
- Docker Compose multi-service orchestration stack.
