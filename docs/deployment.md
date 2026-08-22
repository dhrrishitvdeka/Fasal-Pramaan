# Deployment Topology & Operational Orchestration

This guide outlines deployment options for Fasal-Pramaan across local workstations and the hosted Vercel webapp.

---

## 1. Local Development (Next.js)

Run the webapp locally with `npm run dev` from `apps/dashboard`:

```powershell
Copy-Item apps/dashboard/.env.example apps/dashboard/.env.local   # then fill values
cd apps/dashboard
npm install
npm run dev
```

| Component | Location | Purpose |
|---|---|---|
| `3000` | Next.js dev server (`localhost`) | Farmer flow (Saathi intake, capture) + Reviewer Command Centre |
| Supabase project (cloud) | Supabase dashboard | Postgres (`web_*` tables), Auth, private `fasal-web-evidence` bucket |
| Hugging Face Space (cloud) | `HF_SPACE_URL` | Crop-model inference (`dhrrishitvdeka/fasal-pramaan-api`) |

The same environment variables as the Vercel deployment below go into `apps/dashboard/.env.local` (never committed).

---

## 2. Vercel dashboard + Supabase + Hugging Face (with Saathi + Vision Gate + External Signals)

To host the Next.js web app:

1. Connect this GitHub repo to Vercel. Set **Root Directory** to `apps/dashboard` (Settings → General). Framework Next.js. Do not leave Root Directory empty — that is why “No Next.js version detected” happens.
2. Apply `scripts/setup_supabase.sql` then `scripts/setup_web_schema.sql` in the Supabase SQL editor. If the old open anon policies are already applied, run `scripts/lock_web_rls.sql`. If the web schema predates Saathi, also run `ALTER TABLE web_claims ADD COLUMN IF NOT EXISTS peril TEXT DEFAULT 'normal'; ALTER TABLE web_claims ADD COLUMN IF NOT EXISTS intent_id TEXT;`.
3. Set these env vars in Vercel (Production + Preview). Never commit values:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
    - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
    - `HF_TOKEN` (server-only token that can call the private Space — **unchanged**)
    - `HF_SPACE_URL=https://dhrrishitvdeka-fasal-pramaan-api.hf.space`
    - `SITE_LOCK_PASSWORD`
    - `REVIEWER_EMAILS` (comma-separated reviewer emails)
    - **Saathi voice + vision gate (recommended):** `GEMINI_API_KEY` (server-only, powers `POST /api/voice/session` for `FasalSaathiOverlay` + `POST /api/vision/gate` `generateContent`; heuristic + `fallback:true` if unset)
    - **External signals (all optional, stubs without them):** `SENTINEL_TOKEN` (or `COPERNICUS_TOKEN`) for Sentinel Data Space Ecosystem (`dataspace.copernicus.eu`, `sh.dataspace.copernicus.eu`, Copernicus Sentinel-2, ESA open data); `IMD_API_KEY` for IMD (`mausam.imd.gov.in`, `dsp.imdpune.gov.in`, GKMS, Meghdoot) + Bhuvan (`bhuvan.nrsc.gov.in`). `POST /api/context/assemble` uses open-meteo proxy if `IMD_API_KEY` unset and returns `pending` Sentinel stub if `SENTINEL_TOKEN` unset.
    - **Error telemetry (optional):** `NEXT_PUBLIC_SENTRY_DSN` — reserved slot for a future `Sentry.init`; today client errors go through the built-in ring buffer + authed `POST /api/telemetry/error` (log-only) whether or not this is set.
4. Create Supabase Auth users. Reviewers are those emails (or `app_metadata.roles`). Everyone else is a farmer. Both use `/login`.
5. Farmer path (autonomous Saathi — first-line entry):
   - `/login` → `/farmer/saathi` — text + voice (`webkitSpeechRecognition` hi-IN/en-IN) → `saathi-agent.ts` (`classifyPerilHeuristic`, `mergeSlots`) → `ClaimIntent {peril, crop, village, plotId, id}` → `farmerStore.activeIntent` (`sessionStorage fp_active_claim_intent_v1`)
   - Saathi routes → `/farmer/capture?peril=<Peril>&intentId=<id>` (peril-aware: `anglesForPeril`, `routeForPeril`; realtime CV hint via `webCaptureBridge.readGuidance` to Gemini Live overlay; parallel `POST /api/vision/gate` LLM check + toast; `POST /api/context/assemble` for Sentinel/IMD/Bhuvan)
   - Submit → `POST /api/claims {peril, intentId, images, captureLat/Lon}` (JWT + service role) → private bucket + `web_claims` (`peril`, `intent_id`) + HF label → reviewer `/review` (filterable by `peril`)
   - Peril routing example: *"aag lag gayi"* → `fire_burn` → `requiredAngles: [wide_field, closeup_damage]` (`needsSatellite:true`, `sentinel_fire`) vs `normal` → 5 angles.

Leave **`NEXT_PUBLIC_API_BASE_URL` unset** on Vercel — the webapp talks to its own same-origin Next.js API routes.

No extra location/maps keys required. GPS comes from the browser; the reviewer map uses OpenStreetMap tiles. Without `GEMINI_API_KEY`/`SENTINEL_TOKEN`/`IMD_API_KEY`, the app still works — vision gate falls back to heuristic and context signals return `pending` stubs.

Full variable list and “do not mix backends” notes: [supabase-integration.md](./supabase-integration.md), [environment-variables.md](./environment-variables.md). New endpoints: [api.md §6](./api.md#6-vision-gate--context-assemble-vercel) — `POST /api/vision/gate`, `POST /api/context/assemble`, `GET /farmer/saathi`, `POST /api/claims {peril, intentId}`.

**References:** Sentinel Data Space Ecosystem `dataspace.copernicus.eu`, Sentinel Hub APIs `sh.dataspace.copernicus.eu/api/v1/process`, Copernicus Sentinel-2 (ESA open data), ISRO Bhuvan `bhuvan.nrsc.gov.in`, IMD `mausam.imd.gov.in` / `dsp.imdpune.gov.in`, GKMS, Meghdoot.

---

## 3. PWA & Offline Shell

The installable farmer PWA ships as static files — nothing extra to configure on Vercel:

- `apps/dashboard/public/manifest.webmanifest` (start URL `/farmer`, theme/background `#1c1915`) and the generated `icon-192.png` / `icon-512.png` are **auto-served from `public/`** by Next.js; regenerate icons with `node scripts/generate-pwa-icons.mjs` (dependency-free).
- `apps/dashboard/public/sw.js` is a hand-written vanilla service worker: cache-first for immutable static assets (`/_next/static/*`, `/icons/`, fonts), network-first for navigations with a cached `/farmer` shell fallback when offline, and a hard pass-through for `/api/*` and any `*.supabase.*` host — evidence and auth traffic are never cached.
- Registration happens in production builds only via `src/components/pwa-register.tsx`; local `npm run dev` is left untouched so HMR never fights the worker. Bump the `VERSION` constant inside `sw.js` to invalidate caches on deploy.
- Honest scope: the shell makes pages *openable* offline (plus a bilingual offline banner from `src/components/offline-banner.tsx`). Captures are **not** queued across sessions — draft state lives in `sessionStorage` only.

---

## 4. Playwright E2E (optional, manual)

E2E never runs on push/PR. The `e2e` job in `.github/workflows/ci.yml` triggers on `workflow_dispatch` only (`gh workflow run ci.yml`) and installs Chromium before running `PLAYWRIGHT_E2E=1 npm run e2e`.

| Variable | Where | Purpose |
|---|---|---|
| `E2E_SUPABASE_URL` | repo secret / local env | When set, specs run (otherwise every spec skips) and the spawned dev server points at that Supabase URL so pages take the "Supabase configured" code paths; all network calls are mocked via `page.route`. |
| `E2E_SUPABASE_ANON_KEY` | repo secret / local env | Optional publishable key for the E2E Supabase project (defaults to `e2e-anon-key`). |
| `PLAYWRIGHT_E2E` | set to `1` | Opts into Playwright's `webServer` booting `npm run dev` on port 3000. Without it, tests assume something already serves port 3000. |

Local run: `cd apps/dashboard && PLAYWRIGHT_E2E=1 npm run e2e` (PowerShell: `$env:PLAYWRIGHT_E2E="1"; npm run e2e`). See [CONTRIBUTING.md](../CONTRIBUTING.md#4-local-e2e-tests).
