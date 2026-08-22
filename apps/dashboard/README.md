# Fasal-Pramaan Webapp

The **Fasal-Pramaan webapp** is a Next.js application for crop-evidence capture, AI-assisted screening, and insurance claim adjudication — serving both farmers (guided capture + Fasal Saathi intake) and reviewers (Command Centre) from one deployable on Vercel.

---

## 1. Core Features

- **Fasal Saathi Intake** (`/farmer/saathi`): Autonomous first-contact agent — text or full-duplex Gemini Live voice (mic toggle) — classifies the farmer's problem into one of 8 perils and routes evidence collection. Voice tool calls (`request_evidence_angles`, `call_context_signal`, `guide_capture`, `classify_claim`) execute **server-side** via auth-gated `POST /api/saathi/tool`; the LLM peril classifier also runs server-side, so secrets never ship to the browser.
- **Peril-Aware Capture Studio** (`/farmer/capture`): Variable angle protocol driven by `src/lib/claim-routing.ts` (e.g., fire → 2 angles + satellite; normal → 5 angles), with realtime on-device CV guidance via `src/lib/vision/realtime-cv.ts` + Web Worker (`cv-worker.ts`) running a real **TF.js MobileNet v2 (alpha 0.5)** plant classifier from CDN — its ≥0.18-probability plant verdict is unioned with the green-pixel heuristic for crop detection (graceful heuristic-only fallback offline). The worker spawns on page mount so weights prefetch early, and a bilingual **"CV: AI ready/loading…"** badge mirrors its `model_status` warmup state (`loading`/`ready`/`unavailable`; hidden when unavailable).
- **Gemini Vision Gate** (`POST /api/vision/gate`): Server-side usability check per photo (wrong crop, AI-generated, too dark) with heuristic fallback; per-image verdicts persist to `web_claim_images.gate_result`.
- **Multi-Signal Context** (`POST /api/context/assemble`): Live free-tier sources — Sentinel-2 burn-scar NDVI process API (with token) or Open-Meteo extreme-heat proxy (without), open-meteo rainfall/hail/wind-gust weather, ISRO Bhuvan WMS reachability probe, OpenStreetMap Overpass wildlife proximity (10 km) and nearby farmland count (2 km), GPS — assembled per claim and persisted to `web_claims.context_signals`. Adds a **`plot_match` haversine containment signal** (capture GPS vs registered plot center; 200 m default radius via `plotProximityMeters`, clamped 10–5000) and **sowing-date-aware windows**: drought claims ≥30 days past sowing sum archive rainfall since sowing (`meta.windowRainfallMm/windowDays/daysSinceSowing`; <25 mm/month ⇒ weak corroboration) and hailstorm summaries append an estimated growth stage.
- **Adaptive Confidence Engine**: Per-peril thresholds (`fire 70`, `normal 85`, …) producing High/Medium/Low levels with next-step actions (`proceed`, `request_missing`, `retake`, `escalate_to_human`). `request_missing` now **auto-creates a recapture request** — the claim moves straight to `needs_recapture` with bilingual adaptive reasons — and re-evaluations track `previousConfidence` + `confidence_delta` in `adaptive_result`, rendered as ▲/▼ delta chips on the review detail and farmer claim page. Farmers see new recapture requests as **amber toast panels** on `/farmer` (`src/lib/farmer-notifications.ts` localStorage diffing, Capture-now deep link + Dismiss) plus a nav badge dot for unseen notices.
- **Reviewer Command Centre** (`/review`): Triage queue with peril + adaptive-level filters, Evidence Trust inspector (Quality/Coverage/Context/Integrity), multi-angle viewer, Authenticity Gate card with reviewer `override_gate` override (stamps `overriddenBy`/`overriddenAt`) plus a **Gate re-run button** (re-gates stored photos through `/api/vision/gate`, audited as "Gate re-run recorded: X/Y usable"), human-in-the-loop adjudication (`Accept`, `Correct`, `Request Recapture`, `Physical Inspection`) with audit history. Claim detail adds a **Multi-Signal Context & Satellite Cross-Check card** — per-signal status chips, side-by-side `wide_field` photo vs Bhuvan WMS tile, and a Copernicus Browser deep-link to Sentinel-2 L2A imagery from the last 3 days. The queue and executive overview both **export CSV** of the filtered rows via dependency-free `src/lib/csv.ts`; overview per-peril rows show average confidence (color-coded) and recapture rate from `analyticsFromClaims().byPeril`.
- **Hardened API surface**: all evidence routes require a Supabase JWT (`requireWebActor`) and are rate-limited per user (20–30 req/min) via shared `src/lib/server/rate-limit.ts`; inputs are clamped server-side.

---

## 2. Local Development

```bash
cd apps/dashboard
npm ci
cp .env.example .env.local   # fill in Supabase keys at minimum
npm run dev                  # http://localhost:3000
```

### Required env (see `.env.example`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `HF_TOKEN` (server-only; calls the Fasal-Pramaan Hugging Face Space)
- `HF_SPACE_URL` (optional; default `https://dhrrishitvdeka-fasal-pramaan-api.hf.space`)
- `SITE_LOCK_PASSWORD` (server-only site gate; required on Vercel)
- `GEMINI_API_KEY` (server-only; Saathi Live voice + vision gate + server-side `classify_claim` LLM)
- `SENTINEL_TOKEN` (optional upgrade — with it, fire checks run the real Sentinel-2 burn-scar NDVI process API; without it a free Open-Meteo extreme-heat proxy answers instead) / `IMD_API_KEY` (reserved hook for paid IMD weather; free open-meteo rain/hail/gust works without it)
- `REVIEWER_EMAILS` (comma-separated reviewer emails; everyone else is a farmer)

Apply the Supabase SQL files in order: [scripts/setup_supabase.sql](../../scripts/setup_supabase.sql), [scripts/setup_web_schema.sql](../../scripts/setup_web_schema.sql), [scripts/setup_web_schema_peril.sql](../../scripts/setup_web_schema_peril.sql), then harden with [scripts/lock_web_rls.sql](../../scripts/lock_web_rls.sql). See [docs/supabase-integration.md](../../docs/supabase-integration.md).

---

## 3. Deploy (Vercel)

GitHub → Vercel: set **Root Directory** to `apps/dashboard`. Set the env vars above in Project Settings. Do not change the Root Directory.

---

## 4. Quality Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
