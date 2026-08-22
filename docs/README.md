# Fasal-Pramaan Documentation Index

Welcome to the technical documentation for **Fasal-Pramaan (*फसल प्रमाण*)** — a Next.js webapp (farmer + reviewer) deployed on Vercel, backed by Supabase, with crop-model inference served by a Hugging Face Space.

---

## Core System Architecture & Engine Specifications

| Document | Description |
|---|---|
| [**architecture.md**](architecture.md) | Webapp architecture, layer boundaries, data flow, plus adaptive routing, Saathi intake, vision gate, and multi-signal context. |
| [**evidence-evaluation.md**](evidence-evaluation.md) | Mathematical specification of the 4-Dimensional Evidence Confidence & Trust Evaluation Engine ($0.4Q + 0.3C + 0.2X + 0.1I$). |
| [**adaptive-recapture.md**](adaptive-recapture.md) | Targeted evidence recapture workflow, reason codes, state transitions, and confidence delta calculations. |
| [**api.md**](api.md) | API endpoint specifications, schemas, request/response models, and error codes — includes `POST /api/vision/gate` and `POST /api/context/assemble`. |

## Intelligent Adaptive Evidence Collection & Validation

The platform provides adaptive, peril-specific evidence collection on the webapp (`apps/dashboard`):

- **Fasal Saathi autonomous first-line entry** — `src/lib/saathi-agent.ts` + `src/app/farmer/saathi/page.tsx` — text/voice (Hindi/English) → `Peril` (8 types) + `ClaimIntent` via `classifyPerilHeuristic` and slot extraction; persisted in `farmerStore.activeIntent` (`INTENT_STORAGE_KEY` in sessionStorage) and forwarded to capture as `?peril&intentId`.
- **Variable claims routing** — `src/lib/claim-routing.ts` `ROUTE_CONFIG` per peril (required/optional angles, `contextChecks`, `minConfidence` 70–85, `needsSatellite`). `anglesForPeril(peril)` drives the peril-aware capture studio; `requiredAnglesForPeril(peril)` for validation.
- **Evidence quality & authenticity filter** — `src/lib/vision/realtime-cv.ts` on-device heuristic (green %, luma, blur variance at 2–4 fps; `shouldBlockShutter`) running in `src/lib/vision/cv-worker.ts`, with TF.js-pluggable contract + `src/app/api/vision/gate/route.ts` Gemini vision gate (`generateContent` with `inlineData`, `GEMINI_API_KEY`; heuristic fallback; rejects `ai_generated`/`wrong_crop`/`unusable`).
- **Adaptive confidence engine** — `src/lib/context/adaptive-engine.ts` `adaptiveConfidence()` → `High→proceed` / `Medium→request_missing` / `Low→retake|escalate_to_human` based on `overall/coverage/quality` vs peril threshold and `ContextSignal[]`/`gateFailed`/`integrity`. Fire needs Sentinel, animal benefits from GPS.
- **Multi-signal context validation** — `src/lib/context/types.ts` (`ContextSignal`, `AssembledContext`, `contextOverall`) + `src/app/api/context/assemble/route.ts` (`sentinel` via `dataspace.copernicus.eu` stub, `imd` 7-day rainfall via `api.open-meteo.com` proxy, `bhuvan` link `bhuvan.nrsc.gov.in`, `wildlife`/`nearby`/`gps`). Overall `strong`/`mixed`/`weak`/`pending`.
- **Transparent dashboard** — `src/components/EvidenceConfidenceSection.tsx` shows adaptive level badge, peril threshold, and multi-signal strip (IMD/Sentinel/Bhuvan/GPS) alongside the 4-pillar breakdown.
- **8-step workflow:** 1 Saathi Intake → 2 Capture+Authenticity → 3 GPS & Metadata → 4 Adaptive Confidence → 5 Multi-signal Context → 6 Analyze & Score → 7 Human Review → 8 Track & Audit.

Routing table (from `ROUTE_CONFIG`):

| Peril | Required angles | Checks | minConfidence | Satellite |
|---|---|---|---|---|
| normal | wide_field, left_context, mid_canopy, right_context, closeup_damage | imd_weather, bhuvan_landuse, nearby_fields | 85 | no |
| fire_burn | wide_field, closeup_damage (+mid_canopy opt) | sentinel_fire, imd_weather, bhuvan_landuse | 70 | yes |
| animal_damage | wide_field, mid_canopy, closeup_damage | wildlife_proximity, imd_weather, bhuvan_landuse | 75 | no |
| flood | wide_field, mid_canopy, closeup_damage | imd_weather, sentinel_fire, nearby_fields | 75 | no |
| drought | wide_field, mid_canopy, closeup_damage | imd_weather, bhuvan_landuse, nearby_fields | 80 | no |
| pest_disease | closeup_damage, mid_canopy, wide_field | imd_weather, nearby_fields, bhuvan_landuse | 85 | no |
| hailstorm | wide_field, closeup_damage, mid_canopy | imd_weather, nearby_fields, bhuvan_landuse | 75 | no |
| lodging | wide_field, mid_canopy, closeup_damage | imd_weather, nearby_fields, bhuvan_landuse | 75 | no |

See details in [architecture.md](architecture.md) §3 and source files under `apps/dashboard/src/lib/` and `apps/dashboard/src/app/api/`.

---

## Operational, Security & Governance Standards

| Document | Description |
|---|---|
| [**security.md**](security.md) | Defense-in-depth security model, RBAC via `REVIEWER_EMAILS`, JWT checks on API routes, RLS on `web_*` tables, and anti-fraud verification. Apply `scripts/lock_web_rls.sql`. |
| [**governance-and-safety.md**](governance-and-safety.md) | Ethical AI principles, human-in-the-loop safeguards, crop coverage matrix, and operational risk controls. |
| [**known-limitations.md**](known-limitations.md) | Operational scope boundaries, screening vs. settlement definitions, and calibrated abstention policies. |
| [**environment-variables.md**](environment-variables.md) | Webapp environment reference (`apps/dashboard/.env.example`) for local dev and Vercel. |
| [**deployment.md**](deployment.md) | Vercel + Supabase + Hugging Face deployment topology (Root Directory = `apps/dashboard`). |
| [**supabase-integration.md**](supabase-integration.md) | Supabase path: `web_*` tables, private evidence bucket, RLS policies in `scripts/`, HF inference, what **not** to set on Vercel. |

---

## Showcase & Interactive Guides

| Document | Description |
|---|---|
| [**demo-walkthrough.md**](demo-walkthrough.md) | Step-by-step walkthrough and structured demonstration scenarios. |
| [**VOICE_ASSISTANT_DEMO.md**](VOICE_ASSISTANT_DEMO.md) | Fasal Saathi Gemini Live full-duplex spoken assistant architecture and spoken demo script. |
| [**EVIDENCE_REMINDERS.md**](EVIDENCE_REMINDERS.md) | Recurring evidence capture schedules and farmer notification flows. |

---

## Root Level Guides
- [**GETTING_STARTED.md**](../GETTING_STARTED.md) — Prerequisites, Supabase setup, local dev, tests, and Vercel deploy.
- [**CONTRIBUTING.md**](../CONTRIBUTING.md) — Contribution standards, pull request requirements, and QA checks.
- [**SECURITY.md**](../SECURITY.md) — Security policy and vulnerability disclosure procedures.
- [**CHANGELOG.md**](../CHANGELOG.md) — Version history and release notes.
