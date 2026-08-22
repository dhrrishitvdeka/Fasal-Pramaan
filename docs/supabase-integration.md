# Supabase + Hugging Face (hosted web path)

The **Vercel web app** (`apps/dashboard`) uses Supabase for `web_*` tables and a private photo bucket, and Hugging Face for leaf-disease inference.

**New:** Saathi autonomous intake (`/farmer/saathi`) is first-line entry — `saathi-agent.ts` classifies peril, builds `ClaimIntent {peril,crop,village,plotId}`, persists in `farmerStore.activeIntent` (`sessionStorage fp_active_claim_intent_v1`), routes to peril-aware capture (`/farmer/capture?peril&intentId`). Capture runs realtime CV + `POST /api/vision/gate` in parallel and `POST /api/context/assemble` for external signals (Sentinel/IMD/Bhuvan). Claims carry `peril`/`intent_id` → reviewer queue filterable by peril.

---

## 1. What the hosted path uses

| Piece | Role |
|---|---|
| Supabase Postgres (`web_*` tables) | Claims, images metadata, reviewer actions — now with `peril` + `intent_id` columns |
| Private bucket `fasal-web-evidence` | Real farmer photos (not public, no showcase data) |
| Hugging Face Space | `POST /api/claims` → `dhrrishitvdeka/fasal-pramaan-api` → `dhrrishitvdeka/fasal-pramaan-model` |
| Saathi intake | `GET /farmer/saathi` — text+voice (`webkitSpeechRecognition`) → `saathi-agent.ts` → `ClaimIntent` in `farmerStore.activeIntent` (`sessionStorage`) |
| Peril-aware capture | `anglesForPeril(peril)` + realtime CV (`realtime-cv.ts`) fed via `webCaptureBridge.readGuidance` to Gemini Live overlay |
| Vision gate | `POST /api/vision/gate` — Gemini vision `generateContent` (+ heuristic fallback) |
| Context assemble | `POST /api/context/assemble` — Sentinel/IMD/Bhuvan/GKMS signals |
| Browser GPS | `navigator.geolocation` — no Maps / geocoding API |
| OpenStreetMap tiles | Reviewer map — no Mapbox / Google Maps key |
| Supabase Auth | Required JWT for farmer and reviewer. Browser key is auth-only; data goes through service-role API routes |

No additional infrastructure is needed on Vercel — Supabase and the HF Space cover storage, database, auth, and inference. `GEMINI_API_KEY` is optional (enables `POST /api/vision/gate` LLM check and Gemini Live overlay); `SENTINEL_TOKEN` / `IMD_API_KEY` are optional for external signals (`POST /api/context/assemble` falls back to stubs).

---

## 2. One-time SQL (Supabase SQL Editor)

1. Run [`scripts/setup_supabase.sql`](../scripts/setup_supabase.sql) (PostGIS/pgcrypto extensions + private baseline bucket `fasalpramaan-evidence`).
2. Run [`scripts/setup_web_schema.sql`](../scripts/setup_web_schema.sql) (`web_plots`, `web_claims` **with `peril` + `intent_id`**, `web_claim_images`, `web_milestones`, `web_review_actions`, `web_profiles`, private bucket `fasal-web-evidence`). If the web schema predates peril, also run [`scripts/setup_web_schema_peril.sql`](../scripts/setup_web_schema_peril.sql) or the patch: `ALTER TABLE web_claims ADD COLUMN IF NOT EXISTS peril TEXT DEFAULT 'normal'; ALTER TABLE web_claims ADD COLUMN IF NOT EXISTS intent_id TEXT;`

Create Auth users (Authentication → Users). Put reviewer emails in `REVIEWER_EMAILS`. Farmer and reviewer both sign in at `/login`. Anon RLS is closed — the publishable key cannot read or write `web_*` or `fasal-web-evidence`.

---

## 3. Environment variables

### Vercel (Production + Preview)

Set these in the Vercel project. Never commit values.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
HF_TOKEN=
HF_SPACE_URL=https://dhrrishitvdeka-fasal-pramaan-api.hf.space
SITE_LOCK_PASSWORD=
REVIEWER_EMAILS=
# Saathi voice + vision gate (server-only, optional but recommended)
GEMINI_API_KEY=
# External signals (server-only, all optional — stubs work without them)
SENTINEL_TOKEN=
IMD_API_KEY=
```

Leave **`NEXT_PUBLIC_API_BASE_URL` unset** on Vercel. It must stay empty — the webapp talks to its own same-origin Next.js API routes.

- `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. Never prefix it with `NEXT_PUBLIC_`.
- `HF_TOKEN` is **server-only** (unchanged). It must be allowed to call the private Space `dhrrishitvdeka/fasal-pramaan-api`. Never name it `NEXT_PUBLIC_*`.
- `GEMINI_API_KEY` is **server-only** — powers both Gemini Live overlay (`POST /api/voice/session`) and vision gate (`POST /api/vision/gate` `generateContent`). Leave unset to use heuristic fallbacks.
- `SENTINEL_TOKEN` (aka `COPERNICUS_TOKEN`) + `IMD_API_KEY` are **server-only, optional** — `POST /api/context/assemble` uses them for Sentinel Data Space (`dataspace.copernicus.eu` / `sh.dataspace.copernicus.eu`) and IMD (`mausam.imd.gov.in`, `dsp.imdpune.gov.in`, GKMS, Meghdoot); without them it returns `pending`/`available` stubs via open-meteo proxy.

### Local Next.js (`apps/dashboard/.env.local`, gitignored)

Same keys as above plus optional `GEMINI_API_KEY`, `SENTINEL_TOKEN`, `IMD_API_KEY`. Template: [`apps/dashboard/.env.example`](../apps/dashboard/.env.example).

### Optional (scripts only, not Vercel)

`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_REGION` are only for `scripts/test_supabase_conn.py`.

---

## 4. Deploy the web app on Vercel

1. Connect GitHub repo `dhrrishitvdeka/Fasal-Pramaan`. Set Vercel **Root Directory** to `apps/dashboard`.
2. Paste the env vars above plus `SITE_LOCK_PASSWORD` and `REVIEWER_EMAILS`. Add optional `GEMINI_API_KEY` (Saathi), `SENTINEL_TOKEN`, `IMD_API_KEY` (external signals) if you want live checks. Redeploy after saving them.
3. Farmer: `/login` → `/farmer/saathi` (Saathi intake → `ClaimIntent` → `?peril&intentId`) → `/farmer/capture` (peril-aware `anglesForPeril`, realtime CV, `POST /api/vision/gate` + `POST /api/context/assemble` in parallel) → `POST /api/claims {peril, intentId}` (user JWT, service-role write) → private bucket + `web_claims` + HF label.
4. Reviewer: `/login` → `/review` lists claims (filterable by `peril`). Review actions require a reviewer JWT.

There is no showcase or localStorage-only fallback on these routes.

---

## 5. Saathi → Capture → Review (peril routing example)

```
User: "khet me aag lag gayi, gehu"
Saathi: extractSlotsFromText → classifyPerilHeuristic="fire_burn" (0.92), crop="Wheat"
        mergeSlots → buildSaathiReply → slotsToIntent → ClaimIntent {peril:"fire_burn", crop:"Wheat"}
        setActiveIntent(intent) → /farmer/capture?peril=fire_burn&intentId=intent-...&crop=Wheat
Capture: requestedPeril=normalizePeril("fire_burn") → routeForPeril → {requiredAngles: [wide_field, closeup_damage], needsSatellite:true}
         anglesForPeril → 2-angle studio + CV green check relaxed for burn
         shutter → POST /api/vision/gate {imageDataUrl, expectedCrop:"Wheat", peril:"fire_burn"} → toast if wrong_crop
         submit → POST /api/claims {peril:"fire_burn", intentId:"intent-...", images, captureLat/Lon}
Review: /review?peril=fire_burn → filters Submission.peril; dossier shows context signals (Sentinel pending, IMD rainfall 12mm, Bhuvan link)
```

---

## 6. External Signals (References)

- **Sentinel Data Space Ecosystem** — `dataspace.copernicus.eu` (Copernicus Data Space Ecosystem, ESA open data), **Sentinel Hub APIs** `sh.dataspace.copernicus.eu/api/v1/process`, **Copernicus Sentinel-2** MSI.
- **ISRO Bhuvan** — `bhuvan.nrsc.gov.in` (land-use/forest edge) — used for `bhuvan_landuse` / `wildlife_proximity`.
- **IMD** — `mausam.imd.gov.in`, `dsp.imdpune.gov.in` (Data Supply Portal), **GKMS** (Gramin Krishi Mausam Sewa), **Meghdoot** app — 7-day rainfall via `POST /api/context/assemble` (with `IMD_API_KEY` or open-meteo proxy).

No Maps / geocoding key required; GPS from `navigator.geolocation`, map tiles are OSM.
