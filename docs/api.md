# API Reference & Data Contracts

Base URL: app origin (`http://localhost:3000` for local dev via `npm run dev`, the Vercel URL in production)  
All routes are same-origin Next.js Route Handlers under `/api/*`, backed by Supabase and the Hugging Face Space. The legacy FastAPI `/api/v1` gateway has been retired — it is replaced by these routes plus Supabase Auth. Leave `NEXT_PUBLIC_API_BASE_URL` unset. Saathi intake lives at `GET /farmer/saathi` (page, not API) and routes to peril-aware capture (`/farmer/capture?peril=&intentId=`).

---

## 1. Authentication & Session Management

Authentication is handled by **Supabase Auth**, not by app-level endpoints:

- Sign-in happens at `/login` (email/password). Farmers and reviewers use the same flow.
- Reviewers are identified by `REVIEWER_EMAILS` (or `app_metadata.roles`). Everyone else is a farmer.
- **All evidence routes require a Supabase Auth JWT** — send the session `access_token` as `Authorization: Bearer <token>` (the webapp's `apiFetch` does this automatically). Unauthenticated calls to `/api/claims`, `/api/vision/gate`, `/api/context/assemble`, and `/api/saathi/tool` return `401`; over-quota callers get `429`.
- Every protected route is **rate-limited per user** via shared `src/lib/server/rate-limit.ts` (fixed 60 s window, `429` + `Retry-After` on breach). The full per-route table lives in [§8 Rate Limits](#8-rate-limits).
- Server routes verify the user JWT (`requireWebActor`); privileged writes use the server-only `SUPABASE_SERVICE_ROLE_KEY`.
- The legacy `/auth/register`, `/auth/refresh`, `/auth/logout`, and `/auth/me` gateway endpoints no longer exist — token lifecycle is managed by Supabase Auth. (`GET /api/me` returns the signed-in profile.)

---

## 2. Farms, Plots & Crop Cycles

Plot and milestone data lives on the webapp farmer state rather than standalone farm/crop-cycle resources:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/farmer/plots` | Create a plot record for the signed-in farmer (`web_plots`). |
| `GET` | `/api/farmer/plots/{id}/timeline` | Append/read the evidence timeline for a plot. |
| `GET` | `/api/farmer/state` | Hydrates server-side farmer state (plots, milestones) for `farmerStore`. |
| `PATCH` | `/api/milestones/{id}` | Update a milestone / evidence-reminder entry. |

The legacy `/farms`, `/farms/{id}/plots`, `/crop-cycles`, and `/crop-types` endpoints no longer exist.

---

## 3. Evidence Capture & Submission Lifecycle

The legacy multi-step flow (draft creation → presigned upload URLs → confirm → finalize) has been retired. Submission is now a **single in-request call** to `POST /api/claims`, which verifies bytes, stores evidence, runs inference via the Hugging Face Space, and persists the evaluation.

### 3.1 Peril-Aware Claim (`POST /api/claims`)

Used by `apps/dashboard/src/app/farmer/capture/page.tsx` via `farmerStore.createClaim()` / `submitWebClaim` (`apps/dashboard/src/lib/api.ts:399`). Carries `peril` + `intentId` for peril-adaptive routing.

**Request** (`apps/dashboard/src/app/api/claims/route.ts`):

```json
{
  "plotId": "plot-id-or-empty",
  "plotName": "Plot A",
  "cropType": "Paddy",
  "farmerObservations": "wild boar grazed at night",
  "captureLat": 28.61, "captureLon": 77.20, "captureAccuracyM": 8.5,
  "peril": "animal_damage",
  "intentId": "intent-550e8400-...",
  "plotLat": 28.609, "plotLon": 77.195,
  "images": [
    {
      "angleType": "wide_field",
      "imageDataUrl": "data:image/jpeg;base64,/9j/...",
      "sha256": "e3b0c4...",
      "lat": 28.61, "lon": 77.20, "accuracyM": 8.5,
      "lightingScore": 62, "qualityPassed": true
    }
  ]
}
```

- `peril` (`string`, optional): `normal|fire_burn|animal_damage|flood|drought|pest_disease|hailstorm|lodging` — normalized via `normalizePeril()`, default `normal`. Drives `anglesForPeril()` and `routeForPeril().needsSatellite`.
- `intentId` (`string`, optional): `ClaimIntent.id` from `/farmer/saathi` — persisted as `intent_id` (FK-free, session-scoped).
- `plotLat` / `plotLon` (`number`, optional): registered plot center coordinates, **clamped server-side** to ±90 latitude / ±180 longitude and persisted with the claim; they flow into in-request context assembly for the `plot_match` containment signal.
- Plot proximity radius: the route does **not** take a radius field — during context assembly the server applies `plotProximityMeters` from `assembleContext` input, defaulting to **200 m** when absent and clamping supplied values to **10–5000 m**.
- Sowing date (`string`, optional): accepted on `POST /api/claims` and validated against strict `^\d{4}-\d{2}-\d{2}$` (invalid values are dropped as undefined); it flows into in-request context assembly to unlock drought cumulative-rainfall windows and hail growth-stage estimates. Sowing-date-aware signals are also reachable wherever context assembly accepts a `sowingDate` directly — e.g. `POST /api/context/assemble {sowingDate}` or the Saathi `call_context_signal` tool (sanitized, ≤32 chars).

**Response** `200`:

```json
{ "claimId": "claim-uuid", "prediction": { "label": "...", "score": 0.92 }, "gate": {}, "context": {} }
```

Recapture reuses same route with `id` (claimId): `POST /api/claims` `{id: "<existing>", images: [...]}` → `recaptureAndInfer`.

**Submission type** (`apps/dashboard/src/lib/api.ts:Submission`, `claim-pipeline.ts:WebClaimRow`):

```ts
type Submission = {
  id: string; crop_cycle_id: string; status: string;
  peril?: string | null; intent_id?: string | null;
  capture_lat/lon/accuracy_m?: number|null;
  images: {angle_type, sha256, download_url, quality_flags}[];
  latest_prediction?: {...}; latest_evaluation?: {...};
}
```

Persisted columns: `peril`, `intent_id` (`web_claims`). `claimToSubmission` exposes them; reviewer queue can filter by `peril` (e.g. `peril=fire_burn`).

**Saathi routing example (end-to-end):**

1. `GET /farmer/saathi` → farmer says *"aag lag gayi"* → `extractSlotsFromText` → `classifyPerilHeuristic="fire_burn" (0.92)` → `mergeSlots` → `slotsToIntent` → `ClaimIntent {peril:"fire_burn", perilLabelEn:"Fire / Burn"}` → `sessionStorage fp_active_claim_intent_v1`.
2. `router.push("/farmer/capture?peril=fire_burn&intentId=intent-xxx")` → studio selects `anglesForPeril("fire_burn") = [wide_field, closeup_damage]` (vs 5 for `normal`).
3. `POST /api/claims {peril:"fire_burn", intentId:"intent-xxx", images: [...]}` → Supabase `web_claims` + bucket + HF inference.

---

## 4. Review & Adjudication Endpoints

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `GET` | `/api/claims` | Reviewer | List cases pending human review with filters for evidence confidence, uncertainty, crop, **and `peril`** (`?peril=fire_burn`). The reviewer UI also filters in-memory on `submission.peril`. |
| `GET` | `/api/claims/{id}` | Reviewer / Farmer | Retrieve the full case dossier including images, trust scores, AI prediction, gate result, and context signals. |
| `POST` | `/api/claims/{id}/action` | Reviewer | Execute an adjudication action (`accept`, `correct`, `reject`, `request_recapture`, `physical_inspection`); recorded in `web_review_actions`. |
| `GET` | `/api/claims/{id}/actions` | Reviewer | Inspect the chronological audit log of human overrides and state changes. |
| `GET` | `/api/claims/{id}/satellite-trend` | Reviewer / Owner | Sentinel-2 NDVI time series around the loss event (90 d before → 30 d after `created_at`) with a trend verdict. Degrades with `available:false` + `reason` (`no_gps_coordinates`, `satellite_credentials_missing`, `satellite_unavailable`) instead of errors; needs `SENTINEL_TOKEN`/`COPERNICUS_TOKEN`. Results cached 30 min per claim. |

### Adjudication Action Payload (`POST /api/claims/{id}/action`)

```json
{
  "action": "request_recapture",
  "override_reason": "Close-up leaf shot is blurry and lacks sufficient detail to diagnose fungal blast.",
  "required_angles": ["closeup_damage"],
  "notes": "Please instruct the farmer to hold the camera steady in daylight."
}
```

---

## 5. Evidence Milestones & Voice Bridge

### Evidence Milestones / Reminders
- Reminder plans persist in `web_milestones` and are surfaced on the farmer dashboard; the legacy `/evidence-reminders*` gateway endpoints no longer exist.
- `PATCH /api/milestones/{id}`: Updates a milestone entry (e.g., marks a reminder complete once a submission with sufficient evidence advances the schedule). See [EVIDENCE_REMINDERS.md](./EVIDENCE_REMINDERS.md).

### Voice Bridge (Fasal Saathi on Gemini Live)

**Web (Next.js):**
- `POST /api/voice/session` (`apps/dashboard/src/app/api/voice/session/route.ts`): Mints `{token, websocketUrl, model, expiresAt}` for Gemini Live (server-only `GEMINI_API_KEY`). Client is audio-only (`video:false`) to avoid camera contention.
- **Web page** `GET /farmer/saathi` (`apps/dashboard/src/app/farmer/saathi/page.tsx`): Autonomous intake (text + `webkitSpeechRecognition`), `saathi-agent.ts` (`classifyPerilHeuristic`, `mergeSlots`), `ClaimIntent` → `farmerStore.activeIntent` (`sessionStorage fp_active_claim_intent_v1`) → routes to `/farmer/capture?peril&intentId`. Realtime CV (`realtime-cv.ts`) + `peril` fed via `webCaptureBridge.readGuidance` to `FasalSaathiOverlay` (`components/FasalSaathiOverlay.tsx`).

---

## 6. Vision Gate & Context Assemble (Vercel)

### 6.1 Vision Gate — `POST /api/vision/gate` (`apps/dashboard/src/app/api/vision/gate/route.ts`)

Parallel LLM usability check run after each shutter (capture page `void fetch("/api/vision/gate", ...)`). Not blocking — toasts if `usable:false`. **Auth: Bearer Supabase JWT required (`requireWebActor`); rate limit 20 req/min/user; bodies above ~18 MB of image data and non-canonical `angleType` values are rejected (`400`/`413`).**

**Request:**

```json
{
  "imageDataUrl": "data:image/jpeg;base64,/9j/...",
  "angleType": "closeup_damage",
  "expectedCrop": "Wheat",
  "peril": "pest_disease",
  "metadata": {
    "lat": 28.6139,
    "lon": 77.2090,
    "accuracyM": 3.8,
    "capturedAt": "2026-08-22T17:30:00.000Z",
    "facing": "environment",
    "dimensions": { "width": 1920, "height": 1080 },
    "cvAnalysis": {
      "greenPct": 68,
      "luma": 135,
      "blurScore": 142,
      "hintCode": "ok",
      "modelLabel": "corn ear, spike, ear",
      "modelProb": 0.82
    },
    "sha256": "4b68e987c2fa...",
    "farmerObservation": "Yellow rust lesions on upper leaf canopy"
  }
}
```

**Response 200** (Gemini vision if `GEMINI_API_KEY` set, else `heuristicGate` + `fallback:true`):

```json
{
  "usable": true,
  "reason": "ok",
  "crop_detected": "Wheat",
  "peril_match": true,
  "metadata_verified": true,
  "authenticity_score": 0.95,
  "confidence": 0.92,
  "visual_reason": "Clear outdoor wheat canopy showing localized fungal foliar rust lesions.",
  "warnings": [],
  "recommendations": ["Framing is optimal for neural loss screening"]
}
```

`usable` / `reason`: `ok|not_crop|wrong_crop|ai_generated|too_dark|too_blurry|no_field|unusable|too_small_or_blank`. `fire_burn` relaxes crop check (charred field). Only verified authentic evidence passes to the Hugging Face DINOv2 model.

**Gate re-run (reviewer):** re-running the authenticity gate on already-stored claim photos is **client-orchestrated — there is no dedicated endpoint**. The review detail page downloads each stored image, converts it to a data URL, and issues sequential authed `POST /api/vision/gate` calls (same contract as above); it then records the outcome as an audited `correct` action on `POST /api/claims/{id}/action` with notes `"Gate re-run recorded: <usable>/<total> usable"`.

### 6.2 Context Assemble — `POST /api/context/assemble` (`apps/dashboard/src/app/api/context/assemble/route.ts`)

Aggregates external signals for the claim (called from `POST /api/claims` pipeline or standalone). All sources are live and free-tier — no stubs. **Auth: Bearer Supabase JWT required (`requireWebActor`); rate limit 30 req/min/user; `lat` clamped to ±90, `lon` to ±180, `sowingDate` must match `^\d{4}-\d{2}-\d{2}$`.**

**Request:**

```json
{ "lat": 28.6139, "lon": 77.209, "peril": "flood", "sowingDate": "2026-06-10" }
```

**Response 200:**

```json
{
  "peril": "fire_burn",
  "overall": { "status": "available", "summaryEn": "...", "summaryHi": "..." },
  "sentinelThumbnailUrl": null,
  "sentinelBurnRatio": 0.082,
  "imdRainfallMm": 72.3,
  "imdHailDays7d": 1,
  "imdWindGustMaxKph": 68.4,
  "signals": [
    { "source": "sentinel", "status": "available", "labelEn": "Sentinel-2 burn scar", "summaryEn": "Burn scar detected on ~8.2% of the area around your plot.", "meta": { "burnRatio": 0.082, "evalscript": "burn_scar_ndvi_diff" }, "checkedAt": "..." },
    { "source": "imd", "status": "available", "labelEn": "IMD / Weather (7-day rain)", "summaryEn": "Heavy rain in last 7 days supports flood claim.", "meta": { "rainfall_7d_mm": 72.3, "hailDays7d": 0, "windGustMaxKph": 41.2, "proxy": "open-meteo", "imdCategory": "heavy" }, "checkedAt": "..." },
    { "source": "bhuvan", "status": "available", "labelEn": "Bhuvan land use", "meta": { "bhuvanWmsUrl": "https://bhuvan-app1.nrsc.gov.in/api/bhuvan/wms?...", "thumbnailFetched": true }, "checkedAt": "..." },
    { "source": "wildlife", "status": "available", "labelEn": "Wildlife proximity", "summaryEn": "Forest/protected land within ~10 km (4 features).", "meta": { "proxy": "openstreetmap-overpass", "radiusM": 10000 }, "checkedAt": "..." },
    { "source": "nearby", "status": "available", "labelEn": "Nearby fields", "summaryEn": "12 active farmland parcels within 2 km.", "meta": { "farmCount": 12, "radiusM": 2000 }, "checkedAt": "..." },
    { "source": "gps", "status": "available", "labelEn": "GPS", "checkedAt": "..." }
  ]
}
```

Signal behavior per source:

- `sentinel` — **Tier 1** (`SENTINEL_TOKEN`/`COPERNICUS_TOKEN` set): real POST to `https://sh.dataspace.copernicus.eu/api/v1/process` with an NDVI evalscript answering `application/json` FLOAT32; burn detected when >5% of valid pixels have NDVI < 0.2 (`sentinelBurnRatio` in response). **Tier 2** (no token): free Open-Meteo archive counts extreme-heat days (>40 °C) over the past ~30 days and reports them as an honest heat-anomaly proxy (`meta.proxy = "open-meteo-archive"`, confidence 55).
- `imd` — open-meteo forecast proxy: 7-day `precipitation_sum` mapped to IMD categories, hail days from WMO weathercodes 96/99, and max wind gust (>60 km/h supports lodging); peril-tailored EN/HI summaries. With a valid `sowingDate`: drought ≥30 days past sowing adds cumulative rainfall since sowing from the Open-Meteo archive (`meta.windowRainfallMm/windowDays/daysSinceSowing`; weak corroboration below ~25 mm per 30 days) and hailstorm summaries append an estimated growth stage. `IMD_API_KEY` is a reserved hook for the paid IMD API — signal shape unchanged.
- `plot_match` — haversine containment of the capture point vs the registered plot center when `plotLat`/`plotLon` are supplied (radius defaults to 200 m, clamped 10–5000 m); confidence 75 inside / 40 outside the radius, `unavailable` without a registered plot point.
- `bhuvan` — live WMS GetMap reachability probe (`bhuvan-app1.nrsc.gov.in`); tile fetched → `available` with thumbnail URL, else `pending` with a manual-check link.
- `wildlife` — free Overpass API: forest/protected-area features within ~10 km; only assembled for `animal_damage`.
- `nearby` — free Overpass API: farmland-parcel count within 2 km; ≥3 parcels → `available`.
- `gps` — echoes validated coordinates.

`overall` via `contextOverall(signals)` → `strong|mixed|weak|pending`.

### 6.3 Saathi Tools — `POST /api/saathi/tool` (`apps/dashboard/src/app/api/saathi/tool/route.ts`)

Server-side dispatcher for the Fasal Saathi function tools (`SAATHI_FUNCTION_DECLARATIONS`). Both the duplex Gemini Live Voice Mode on `/farmer/saathi` and the text fallback call this route so tool execution — including the LLM peril classifier (`classifyPerilWithLLM`) — stays server-side and `GEMINI_API_KEY` never reaches the browser.

**Auth:** Bearer Supabase JWT required (`requireWebActor`). **Rate limit:** 30 req/min/user. **Body:** JSON ≤64 KB (`413` above), shape `{ name, args }`.

```json
{ "name": "classify_claim", "args": { "text": "aag lag gayi thi khet me", "lang": "hi" } }
```

| Tool | Args (sanitized/clamped server-side) | Returns |
|---|---|---|
| `register_plot` | `name`, `crop_type`, `khasra_number`, `area_hectares`, `village` | Registers plot in state with complete agronomic metadata |
| `check_plot_geofence` | `plot_id` (optional) | Validates GPS coordinates against cadastral parcel boundaries |
| `fetch_agro_weather_alerts` | `plot_id` (optional) | Fetches 72-hour precipitation, hail probability, temperature stress |
| `explain_claim_audit` | `claim_id` | Full plain-language breakdown of 3-stage AI & satellite verification |
| `request_evidence_angles` | `peril: string` | ROUTE_CONFIG for the peril: required/optional angles, context checks, minConfidence, needsSatellite, bilingual guidance |
| `call_context_signal` | `lat` (±90), `lon` (±180), `peril`, optional `sowingDate` | Compact context signals (source/status/summary), overall status, `imdRainfallMm` |
| `guide_capture` | `angle` (canonical id whitelist), `lang` | Localized angle name, instructions, tips |
| `classify_claim` | `text` (≤1000 chars), `lang`, optional `contextNotes` (≤2000 chars) | `{ peril, confidence (0–1), reasoning }` from the server-side Gemini function-call classification |

**Response 200:** the `SaathiToolResult` payload — `{ ok: true, data: {...} }`; invalid args or unknown tools return `400` with `{ ok: false, error }`; transient failures return `500`.

---

### 6.4 Gemini Live Session Minter — `POST /api/voice/session` (`apps/dashboard/src/app/api/voice/session/route.ts`)

Mints an ephemeral token for direct browser-to-Gemini Live WebSocket streaming.

**Auth:** Bearer Supabase JWT (`requireWebActor`). **Rate limit:** 10 req/min/user.

**Response 200:**
```json
{
  "token": "ephemeral_auth_token_xyz...",
  "websocketUrl": "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained",
  "model": "gemini-3.1-flash-live-preview",
  "voice": "Aoede",
  "expiresAt": "2026-08-24T11:00:00.000Z"
}
```

---

## 7. External Signals & References

- **Sentinel Data Space Ecosystem** — `https://dataspace.copernicus.eu/` (Copernicus Data Space Ecosystem)
- **Sentinel Hub Process API** — `POST https://sh.dataspace.copernicus.eu/api/v1/process` (Tier 1 burn-scar NDVI JSON raster; needs `SENTINEL_TOKEN`)
- **Sentinel Hub Statistical API** — `POST https://sh.dataspace.copernicus.eu/api/v1/statistics` (per-claim NDVI trend series for `GET /api/claims/{id}/satellite-trend`; one request returns the full 5-day-interval aggregate; needs `SENTINEL_TOKEN`)
- **Open-Meteo** — forecast `https://api.open-meteo.com/v1/forecast` (IMD rainfall proxy, hail weathercodes, wind gusts) and archive `https://archive-api.open-meteo.com/v1/archive` (Tier 2 extreme-heat fire proxy) — free, no key
- **OpenStreetMap Overpass API** — `https://overpass-api.de/api/interpreter` (wildlife forest proximity ≤10 km, farmland-parcel count ≤2 km) — free, no key
- **Copernicus Sentinel-2** (ESA open data) — MSI L1C/L2A for burn scar / water extent
- **ISRO Bhuvan** — `https://bhuvan.nrsc.gov.in/`, WMS probe `https://bhuvan-app1.nrsc.gov.in/api/bhuvan/wms` (land-use, forest edge)
- **IMD** — `https://mausam.imd.gov.in/`, `https://dsp.imdpune.gov.in/` (Data Supply Portal), **GKMS** (Gramin Krishi Mausam Sewa), **Meghdoot** app — gridded rainfall / agromet advisories; `IMD_API_KEY` reserved for the paid upgrade, else open-meteo proxy.
- **TensorFlow.js / MobileNet** (on-device CV worker) — TFJS bundle + `@tensorflow-models/mobilenet` v2 (alpha 0.5) loaded from jsdelivr CDN at runtime; heuristic-only fallback when unreachable.

---

## 8. Rate Limits

All protected routes share the in-memory fixed-window limiter (`src/lib/server/rate-limit.ts`, 60 s window, keyed per user per route). Breaches return `429` with a `Retry-After` header (seconds until the window resets). Single-process scope: swap for a shared store before scaling horizontally.

| Route | Method | Limit | Notes |
|---|---|---|---|
| `/api/claims` | POST | **10 req/min/user** | Evidence upload + inference; lowest cap because each call fans out to storage, HF Space, and context assembly |
| `/api/claims/{id}/action` | POST | **30 req/min/user** | Reviewer adjudication actions |
| `/api/milestones/{id}` | PATCH | **30 req/min/user** | Milestone / evidence-reminder updates |
| `/api/vision/gate` | POST | **20 req/min/user** | Gemini vision gate (+ heuristic fallback) |
| `/api/context/assemble` | POST | **30 req/min/user** | Multi-signal context assembly |
| `/api/saathi/tool` | POST | **30 req/min/user** | Server-side Saathi tool dispatcher |
| `/api/telemetry/error` | POST | **5 req/min/user** | Client error intake; log-only |
| `/api/system/status` | GET | **10 req/min/user** | Admin configuration summary |

---

## 9. Admin System Status & Client Error Telemetry

### 9.1 System Status — `GET /api/system/status` (`apps/dashboard/src/app/api/system/status/route.ts`)

Honest configuration summary powering the rebuilt `/admin` page. **Auth:** Bearer Supabase JWT required (`requireWebActor`); non-administrators get `403`. **Rate limit:** 10 req/min/user ([§8](#8-rate-limits)).

**Response 200** — booleans / public URLs only, never secret values:

```json
{
  "supabase": true,
  "gemini": false,
  "sentinel": true,
  "imdKey": false,
  "hfSpaceUrl": "https://dhrrishitvdeka-fasal-pramaan-api.hf.space",
  "version": "1.6.0"
}
```

- `supabase` — both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
- `gemini` — `GEMINI_API_KEY` set (voice mode + vision gate + LLM classification live).
- `sentinel` — `SENTINEL_TOKEN`/`COPERNICUS_TOKEN` set (Tier-1 burn-scar checks).
- `imdKey` — `IMD_API_KEY`/`OPENWEATHER_KEY` set (paid IMD hook).
- `hfSpaceUrl` — public Space URL from `getHfSpaceUrl()`, or `null`.
- `version` — server-reported release version (`"1.6.0"`).

### 9.2 Client Error Telemetry — `POST /api/telemetry/error` (`apps/dashboard/src/app/api/telemetry/error/route.ts`)

Log-only client error sink fed by `initTelemetry()` (`src/lib/telemetry.ts`). **Auth:** Bearer Supabase JWT required (`requireWebActor`) so anonymous visitors cannot spam it — the client only forwards when a session token exists. **Rate limit:** 5 req/min/user ([§8](#8-rate-limits)). **No persistence by design in v1:** the payload is printed as structured JSON to the server console for log-drain collection.

**Request:**

```json
{
  "message": "Cannot read properties of undefined (reading 'map')",
  "stack": "TypeError: ... at ...",
  "url": "https://<app>/review?peril=fire_burn",
  "userAgent": "Mozilla/5.0 ...",
  "source": "onerror"
}
```

- `message` (required, clamped ≤500 chars), `stack` (≤2000), `url` (≤2048), `userAgent` (≤512), `source` (≤32 chars; `onerror` or `unhandledrejection`).
- Server stamps `reportedBy` (user id) and `reportedAt` (ISO timestamp).

**Response 200:** `{ "ok": true }`. Errors: `400` invalid JSON / missing message, `401` unauthenticated, `429` over quota.

The client side keeps a 50-entry ring buffer plus `[telemetry]` console output regardless of session state; `NEXT_PUBLIC_SENTRY_DSN` is a documented env slot for a future `Sentry.init` (see [environment-variables.md](./environment-variables.md)).

---

## 10. Public Utility Endpoints

### 10.1 Real-Time GitHub Stars — `GET /api/github/stars` (`apps/dashboard/src/app/api/github/stars/route.ts`)

Fetches and caches the repository stargazers count to render real-time GitHub social proof badges without triggering client-side GitHub REST API rate limits.

**Request:** `GET /api/github/stars`  
**Query Parameters (optional):** `?repo=owner/repo` (defaults to `NEXT_PUBLIC_GITHUB_REPO` or `dhrrishitvdeka/Fasal-Pramaan`).

**Response 200:**
```json
{
  "stars": 42,
  "formatted": "42",
  "source": "api.github.com",
  "cached": false
}
```

- Features a server-side 5-minute sliding TTL memory cache.
- Falls back transparently to `img.shields.io` SVG metadata extraction when the GitHub REST API quota is exceeded.

