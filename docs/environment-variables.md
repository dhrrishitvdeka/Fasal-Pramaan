# Environment Variables Reference

Fasal-Pramaan (webapp) is configured via environment variables set on the Vercel project and locally in `apps/dashboard/.env.local` (template: [`apps/dashboard/.env.example`](../apps/dashboard/.env.example)). Every variable below is read by the webapp or its setup scripts — nothing speculative is listed.

---

## Configuration Parameter Groups

| Group | Variables | Default Value | Description |
|---|---|---|---|
| **Supabase (cloud)** | `NEXT_PUBLIC_SUPABASE_URL`<br/>`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`<br/>`SUPABASE_SERVICE_ROLE_KEY`<br/>`SUPABASE_DB_PASSWORD`<br/>`SUPABASE_PROJECT_REF`<br/>`SUPABASE_DB_REGION` | _(empty — set locally, never commit)_ | Browser publishable key, server-only service role (`requireWebActor` JWT checks + privileged writes), and DB vars for `scripts/test_supabase_conn.py`. |
| **Evidence Storage** | — | bucket `fasal-web-evidence` | Private Supabase Storage bucket created by `scripts/setup_web_schema.sql`; no dedicated env var — access flows through the Supabase keys above. Per-image gate verdicts persist to `web_claim_images.gate_result` (schema, not env). |
| **Hugging Face Space** | `HF_SPACE_URL`<br/>`HF_TOKEN`<br/>`SPACE_API_TOKEN` *(Space secret)* | `https://dhrrishitvdeka-fasal-pramaan-api.hf.space`<br/>_(empty)_ | Private Space that runs `dhrrishitvdeka/fasal-pramaan-model` for crop screening on `POST /api/claims`. Server-only. Code also accepts `FASAL_HF_SPACE_URL`, `HF_MODEL_ID`, and `HUGGINGFACE_API_TOKEN` as fallbacks. Optional `SPACE_API_TOKEN` on the Space itself rejects `predict_api` calls whose Bearer token does not match (in addition to making the Space private). |
| **Site Lock** | `SITE_LOCK_PASSWORD` | _(empty)_ | When set (Vercel), locks the whole site behind a password (`POST /api/unlock` compares it in constant time). Leave empty locally. |
| **Gemini (Saathi Live + Vision Gate + Classify)** | `GEMINI_API_KEY`<br/>`GEMINI_LIVE_MODEL`<br/>`GEMINI_LIVE_VOICE`<br/>`GEMINI_LIVE_SESSION_MINUTES` | `""`<br/>`gemini-3.1-flash-live-preview`<br/>`Kore`<br/>`15` | One server-only key powers three things: Saathi full-duplex Live voice sessions (`POST /api/voice/session`), the vision gate (`POST /api/vision/gate` `generateContent`; heuristic fallback without it), and server-side LLM peril classification (`classify_claim` via `POST /api/saathi/tool`). The browser only ever receives an ephemeral Live token. `GOOGLE_API_KEY`/`GEMINI_VISION_MODEL` are accepted aliases. |
| **External Signals (optional)** | `SENTINEL_TOKEN` *(alias `COPERNICUS_TOKEN`)*<br/>`IMD_API_KEY` *(alias `OPENWEATHER_KEY`)* | _(empty)_ | `SENTINEL_TOKEN` upgrades fire checks from the free Tier-2 Open-Meteo extreme-heat proxy to real Sentinel-2 burn-scar NDVI detection (`sh.dataspace.copernicus.eu` process API). `IMD_API_KEY` is a reserved hook for the paid IMD weather API — the free open-meteo proxy (rain, hail codes 96/99, wind gusts) runs without it. Bhuvan WMS and Overpass wildlife/nearby checks need no key at all. |
| **GitHub Stars Badge** | `GITHUB_TOKEN`<br/>`NEXT_PUBLIC_GITHUB_REPO` | _(empty)_<br/>`dhrrishitvdeka/Fasal-Pramaan` | `GITHUB_TOKEN` (server-only) raises the GitHub API rate limit for `GET /api/github/stars`; without it anonymous quota applies. `NEXT_PUBLIC_GITHUB_REPO` pins the repo shown by the landing-page stars badge. |
| **HF Space (client hint)** | `NEXT_PUBLIC_HF_SPACE_ID` | _(empty)_ | Optional public Space id used by `src/lib/hf-model.ts` for client-side model display. Inference itself always runs server-side via `HF_SPACE_URL`. |
| **Rate Limiting** | `ENABLE_RATE_LIMIT` | `false` | Set to `"true"` to enable the in-memory per-user rate limiter on API routes. Off by default (hackathon/demo mode). |

> Legacy gateway variables (`ENVIRONMENT`, `DATABASE_URL`, `REDIS_*`, `JWT_SECRET_KEY`, `AI_SERVICE_*`, `RATE_LIMIT_*`) belonged to the retired backend stack and no longer apply to the webapp. (`SENTRY_DSN` is no longer legacy — see the `NEXT_PUBLIC_SENTRY_DSN` row above.)

---

## Vercel / `.env.local` Reference

Set these on the Vercel project (and in `apps/dashboard/.env.local` for `npm run dev`). This table matches `apps/dashboard/.env.example` one-for-one. Never commit values.

| Variable | Public? | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | Project URL, e.g. `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | yes | Publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **no** | yes | Server-only. Never `NEXT_PUBLIC_*` |
| `HF_TOKEN` | **no** | yes | Token that can invoke the private Space (`predict_api`) |
| `HF_SPACE_URL` | **no** | no | Defaults to `https://dhrrishitvdeka-fasal-pramaan-api.hf.space` |
| `SITE_LOCK_PASSWORD` | **no** | yes on Vercel | Master password for the public site gate (`/unlock`). Never `NEXT_PUBLIC_*`. |
| `GEMINI_API_KEY` | **no** | recommended | Server-only key for Saathi Live voice, the Gemini vision gate, and server-side `classify_claim` LLM classification. Without it: voice mode disabled, gate falls back to heuristic, classification falls back to `classifyPerilHeuristic`. |
| `GEMINI_LIVE_MODEL` | **no** | no | Saathi Live model (default `gemini-3.1-flash-live-preview`) |
| `GEMINI_LIVE_VOICE` | **no** | no | Saathi Live voice (default `Kore`) |
| `GEMINI_LIVE_SESSION_MINUTES` | **no** | no | Saathi Live session cap (default `15`) |
| `SENTINEL_TOKEN` *(or alias `COPERNICUS_TOKEN`)* | **no** | no | Optional upgrade: with a token, `fire_burn` claims get real Sentinel-2 burn-scar NDVI checks via `sh.dataspace.copernicus.eu/api/v1/process` (>5% low-NDVI pixels ⇒ burn). Without it, the free Open-Meteo archive extreme-heat proxy answers instead — clearly labelled as a heat-anomaly signal. |
| `IMD_API_KEY` *(or alias `OPENWEATHER_KEY`)* | **no** | no | Reserved hook for the paid IMD grid/AWS API. Unset ⇒ free open-meteo forecast proxy supplies 7-day rainfall, hail days (weathercodes 96/99), and wind-gust max (>60 km/h supports lodging). Signal shape identical either way. |
| `REVIEWER_EMAILS` | **no** | yes | Comma-separated emails treated as reviewers. All other Auth users are farmers. Unchanged. |
| `NEXT_PUBLIC_SENTRY_DSN` | yes | no | Reserved slot for client error telemetry. Today `initTelemetry()` (`src/lib/telemetry.ts`) only logs it and keeps using the built-in 50-entry ring buffer + authed log-only `POST /api/telemetry/error`; wire `Sentry.init({ dsn })` here once `@sentry/nextjs` lands. The code also reads plain `SENTRY_DSN` as a build-time fallback alias. Empty = local console + ring buffer only. |

*(Script-only helpers for `scripts/test_supabase_conn.py`: `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_REGION`.)*

**E2E-only variables (never set on Vercel)**

Used by `playwright.config.ts` and the manual `e2e` CI job — not read by the webapp itself.

| Variable | Required | Notes |
|---|---|---|
| `E2E_SUPABASE_URL` | for E2E runs | When set, Playwright specs run (otherwise every spec skips) and the spawned dev server points at that Supabase URL so pages exercise the "Supabase configured" code paths; all network calls are mocked via `page.route`. Configured as a repo secret for the `workflow_dispatch`-only e2e job. |
| `E2E_SUPABASE_ANON_KEY` | no | Publishable key for the E2E Supabase project (defaults to `e2e-anon-key`). |
| `PLAYWRIGHT_E2E` | for auto-booted server | Set to `1` to let Playwright's `webServer` boot `npm run dev` on port 3000; without it tests assume something already serves port 3000. |

**Leave unset on Vercel**

| Variable | Why |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Must stay empty — the webapp uses its own Next.js routes (`/api/claims`, `/api/vision/gate`, `/api/context/assemble`, `/api/saathi/tool`). |
| Legacy gateway vars (`DATABASE_URL`, `REDIS_*`, `JWT_SECRET_KEY`, `AI_SERVICE_*`) | Retired with the old backend stack — not used by the webapp. |
| Maps / geocoding keys | Not used. GPS is `navigator.geolocation`; map tiles are OSM. |

---

## Production Security Assertions

For any publicly hosted deployment:
- `SUPABASE_SERVICE_ROLE_KEY` must be server-only — never named `NEXT_PUBLIC_*`.
- `HF_TOKEN` and `GEMINI_API_KEY` are server-only; browsers only receive ephemeral Gemini Live tokens via `/api/voice/session`, and all tool execution happens behind auth-gated `/api/saathi/tool`.
- Anon RLS policies on `web_*` tables and the `fasal-web-evidence` bucket must stay closed (`scripts/lock_web_rls.sql`).
- No demo credentials or mock inference fallbacks should exist on the hosted Supabase project.
- Protected API routes enforce per-user rate limits (5–30 req/min per route, `429` + `Retry-After`) and clamp inputs server-side.

---

## External Signals — Reference URLs

- **Sentinel Data Space Ecosystem:** `https://dataspace.copernicus.eu/` — **Process API:** `POST https://sh.dataspace.copernicus.eu/api/v1/process`
- **Open-Meteo:** forecast `https://api.open-meteo.com/v1/forecast`, archive `https://archive-api.open-meteo.com/v1/archive`
- **Overpass API (OpenStreetMap):** `https://overpass-api.de/api/interpreter`
- **Copernicus Sentinel-2 / ESA open data:** MSI L1C/L2A (burn scar, water extent) for `fire_burn`/`flood`
- **ISRO Bhuvan:** `https://bhuvan.nrsc.gov.in/`, WMS probe `https://bhuvan-app1.nrsc.gov.in/api/bhuvan/wms`
- **IMD:** `https://mausam.imd.gov.in/`, `https://dsp.imdpune.gov.in/` (Data Supply Portal), **GKMS** (Gramin Krishi Mausam Sewa), **Meghdoot** app

Variables are **server-only** (`SENTINEL_TOKEN`, `IMD_API_KEY`, `GEMINI_API_KEY`, `HF_TOKEN` — never `NEXT_PUBLIC_*`). See `apps/dashboard/src/app/api/context/assemble/route.ts` and `src/lib/context/assemble.ts` for tier behavior.

---

## Saathi Intake Flow (Quick Reference)

```
GET /farmer/saathi (text + duplex Gemini Live Voice Mode mic toggle)
  → POST /api/voice/session (ephemeral token; GEMINI_API_KEY)
  → WebSocket bidiGenerateContentSetup with SAATHI_FUNCTION_DECLARATIONS
  → toolCalls answered server-side via POST /api/saathi/tool
      request_evidence_angles · call_context_signal · guide_capture · classify_claim (LLM)
  → ClaimIntent {peril, crop, village, plotId, id}
  → farmerStore.activeIntent (sessionStorage fp_active_claim_intent_v1)
  → /farmer/capture?peril=<Peril>&intentId=<id>
  → capture page: anglesForPeril(peril), realtime CV (MobileNet v2 worker) → guidance
  → POST /api/vision/gate + POST /api/claims {peril, intentId}
```
