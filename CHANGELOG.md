# Changelog

All notable changes to **Fasal-Pramaan** will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed — CV person false positives
- **Live capture no longer blocks on desks/tables/laptops**: `person_detected` previously fired from a skin-tone pixel ratio alone (>4%), which warm-brown wooden furniture and laptops also match. The decision is now tiered — a MobileNet person/human label (probability ≥ 0.2) confirms at the low ratio, a confident furniture/electronics or plant label vetoes the flag, and the heuristic fallback (model unavailable) requires a strong ratio (> 12%) plus a wood-grain exclusion (grain fraction of skin-classified pixels with Laplacian > 5; skin is smooth, wood has grain, and the fraction is robust to subject/background boundary rings).
- MobileNet classification now runs on a dedicated 224×224 sample taken directly from the full-resolution video frame instead of the 64×64 analysis downsample used for agronomic pixel math (`realtime-cv.ts` ships both buffers to the worker; the ImageBitmap path classifies straight from the source).

### Added — Review trust tooling
- **Sentinel-2 NDVI trend sparkline per claim** (`NdviTrendCard` on `/review/[id]`): vegetation health across the 90 days before → 30 days after the loss event, from one Copernicus Statistical API request (5-day intervals, cloud-masked intervals with dataMask mean < 0.5 dropped). Conservative verdict: `vegetation_collapse` requires ≥ 2 baseline points and a ≥ 20% mean NDVI drop. Backed by the reviewer-gated `GET /api/claims/{id}/satellite-trend` (30-min per-claim cache, explicit degradation reasons). Renders nothing unless `SENTINEL_TOKEN`/`COPERNICUS_TOKEN` is set.

---

## [2.6.1] — 2026-08-30

### Fixed — Production blockers
- **On-device MobileNet / CV worker**: module workers now load TF.js and MobileNet via ESM `import()` instead of classic `importScripts`. Live frames fall back to main-thread analysis on timeout. Live preview and captured stills share `cv-core.analyzeFrame` (same 64×64 path, including screen detection).
- **Deferred HF inference**: claims stamp `inference_status` (`pending` / `complete` / `failed`). If Vercel cuts off `after()`, `GET /api/claims/[id]` requeues inference from stored blobs. Gradio queue-full is retryable.
- **Late inference vs reviewer**: `attachHfPrediction` will not overwrite `severity_grade` / `crop_identified` on verified, rejected, or corrected claims. Reviewer writes are compare-and-swap on status.
- **Evidence loss on recapture**: images upload before the claim row is inserted. Recapture inserts new rows then deletes the old ones. Recapture is only allowed from `needs_recapture`.
- **Hugging Face Space**: 6-image / 15 MB / 20 MB JSON caps, optional `SPACE_API_TOKEN` Bearer check, pinned `spaces` and `huggingface_hub`.

### Fixed — Integrity and UX
- Stale Saathi claim intent is cleared after submit, on a capture URL with no `peril`/`intentId`, and after 12 hours.
- Service worker no longer caches `/review`, `/admin`, `/audit`, `/login`, `/unlock`, `/analytics`, `/overview`, `/map`, `/alerts` (cache `v3`).
- Shutter fails closed while CV is null (except fire/drought). HUD shows heuristic-only when MobileNet is unavailable.
- Heuristic vision gate no longer auto-passes on `expectedCrop`. It reads crop score, blur, luma (floor 14), and green %; fail-closed `heuristic_unverified` when Gemini is down and there are no CV signals. Gate luma is real CV luma, not lighting score.
- Offline banner, farmer notice, draft toast, and terms no longer claim a capture outbox or auto-sync.
- Voice: barge-in threshold 0.30 RMS; AudioWorklet muted like ScriptProcessor; reconnect `setup` send cannot deadlock `connectingRef`; tool calls without `id` get a synthetic id.
- Storage object keys are sanitized. `register_plot` / `check_evidence_quality` no longer report success with no camera and no persistence.
- CSV keeps genuine negative numbers. Client telemetry forwards at most every 5s. `markSeen` is capped at 200. “Today” uses the local calendar. Gemini token mint times out at 15s. Claim-id collisions return 409.

### Schema
- `web_claims.inference_status`, `inference_error`, `inference_started_at` (apply `scripts/setup_web_schema_peril.sql`; the app still runs if those columns are missing).

---

## [2.6.0] — 2026-08-24

### Fasal Saathi v3.0 Multimodal Voice & Live Video Co-Pilot
- **Background AudioWorklet Engine (`live-audio.ts`)**:
  - Migrated real-time audio sampling from deprecated `ScriptProcessorNode` to a dedicated, off-main-thread `AudioWorkletNode` (`FasalAudioProcessor`).
  - Native 16 kHz PCM16 mono downsampling running on the browser's audio rendering thread, preventing UI lag during intensive map and canvas operations.
  - Built-in half-duplex acoustic echo suppression with RMS volume calculation and instant user barge-in speech detection.
  - Real-time `onVolumeChange` callback driving responsive visual voice equalizers across the UI.
- **1-FPS Live Viewfinder Video Streaming**:
  - Added continuous 1-FPS JPEG video frame streaming (`sendVideoFrame`) over the bidirectional Gemini Live WebSocket (`gemini-3.1-flash-live-preview`).
  - Wired live viewfinder capture from `/farmer/capture` via `webCaptureBridge.getVideoFrame()`, transforming Saathi into a real-time camera visual co-pilot.
- **Proactive Opening Spoken Greeting**:
  - Configured automatic welcome speech kickoff on `setupComplete` across both `/farmer/saathi` and `FasalSaathiOverlay`, speaking aloud immediately on connect (*"नमस्ते किसान भाई! मैं फसल साथी हूँ। आपके खेत में क्या समस्या हुई है?"*).
- **Soothing Natural Voice Model**:
  - Standardized default voice configuration to `Aoede` for natural, accessible conversational dialogue in rural agricultural settings.

### Hierarchical Multi-Agent Tool Suite
- **Spoken Cadastral Plot Registration (`register_plot`)**:
  - Enables hands-free spoken parcel onboarding with full agronomic metadata (`name`, `crop_type`, `khasra_number`, `area_hectares`, `village`).
- **Cadastral Geofence Verification (`check_plot_geofence`)**:
  - Validates active device GPS coordinates against registered farm parcel polygon boundaries in real time.
- **Agro-Meteorological Weather Radar (`fetch_agro_weather_alerts`)**:
  - Delivers localized 72-hour precipitation forecasts, hailstorm probabilities, and temperature stress warnings.
- **Plain-Language AI Audit Explainer (`explain_claim_audit`)**:
  - Translates complex multi-stage AI and satellite verification results into clear, spoken farmer-friendly explanations.

### Engineering Hardening & Production Reliability
- **Leaflet MapView & Boundary Hardening (`MapView.tsx`)**:
  - Defensively filtered numeric coordinates in `FitBounds` and center calculations to prevent `NaN` or un-geotagged historical submissions from throwing bounds exceptions.
- **Site-Lock Authentication Security (`site-lock.ts`)**:
  - Refactored `isSiteLockActive()` to strictly require a configured `SITE_LOCK_PASSWORD`, preventing accidental access lockouts during deployments.
- **Frame Grabber Type Polymorphism (`capture-actions.ts`)**:
  - Hardened `runVoiceShutter` to seamlessly accept synchronous and asynchronous frame grabbers.
- **Full Production Build Verification**:
  - Verified 100% type safety and zero-error generation across all 38 Next.js app routes, static pages, and dynamic API endpoints.

### Documentation & Repository Modernization
- **Comprehensive Documentation Updates**:
  - Fully synchronized `docs/VOICE_ASSISTANT_DEMO.md`, `docs/architecture.md`, `docs/api.md`, `docs/demo-walkthrough.md`, and `README.md`.
  - Streamlined root `README.md` into an executive overview featuring a clean architecture flowchart, feature highlights, documentation sitemap, and core contributors.

---

## [2.5.0] — 2026-08-23

### Multi-Language Localization Across All 15 Indian Languages
- **Universal Regional Language Infrastructure**:
  - Expanded native dictionaries across all 15 supported Indian languages: **Assamese (`as`)**, **Bengali (`bn`)**, **English (`en`)**, **Gujarati (`gu`)**, **Hindi (`hi`)**, **Kannada (`kn`)**, **Malayalam (`ml`)**, **Marathi (`mr`)**, **Nepali (`ne`)**, **Odia (`or`)**, **Punjabi (`pa`)**, **Sindhi (`sd`)**, **Tamil (`ta`)**, **Telugu (`te`)**, and **Urdu (`ur`)**.
  - Fully translated Saathi AI navigation, voice assistant headers, microphone states, peril chips, phrases, chat bubble greetings, placeholders, dashboard empty states, and claims list labels.
  - Replaced hardcoded binary ternaries across all farmer pages with typed `getFarmerT(lang)` lookups.
  - Added BCP-47 speech recognition mapping (`SPEECH_BCP47_MAP`) enabling native voice-to-text dictation across all 15 languages.

### Reviewer Privacy & Dashboard Architecture
- **Reviewer Session Isolation**:
  - Sanitized reviewer and admin emails from farmer portal state endpoints (`/api/farmer/state`) and navigation bars to ensure strict separation between reviewer and farmer roles.
- **Interactive 4-Card Farmer Dashboard**:
  - Enhanced top stat cards (*Registered Plots*, *Claims Filed*, *Claims Verified*, *Needs Action*) into interactive routing links with direct anchors (`#registered-plots`, `#attention-required`, `/farmer/claims?status=verified`).
  - Removed redundant top creation buttons on the Claims page to streamline mobile workflow.

### Advanced Multi-Spectral Crop CV Engine, Anti-Screen Fraud, & 75%+ Shutter Lock
- **Two-Tier Semantic & Bio-Optical Realtime Vision**:
  - Combined MobileNet v2 deep semantic classification with multi-spectral agronomic indices (**ExG**, **GLI**, **ExR**, **NDYI**) across vegetative, golden grain, yellow bloom, scorch, and fire burn phenotypes.
  - **Person & Non-Crop Subject Rejection (`person_detected`)**:
    - Integrated multi-scale human skin tone locus (Fitzpatrick I-VI) and MobileNet anthropogenic class suppression (clothing, suits, jerseys, faces, furniture, rooms) to reject selfies, indoor human subjects, and non-field objects.
  - **Bio-Optical Canopy Micro-Texture Density ($STD$)**:
    - Computes 2D Laplacian spatial variance strictly over canopy pixels ($STD = \frac{1}{|Canopy|} \sum |\nabla^2 I|$). Distinguishes living cellular biological foliage from flat indoor painted walls and synthetic surfaces ($STD < 0.6$).
  - **Screen & Display Anti-Spoofing Detector (`detectScreenArtifacts`)**:
    - Realtime detection of Moiré interference grids, screen bezels/borders, and planar specular reflections to reject photographs of computer monitors, tablets, and mobile screens (`screen_detected`).
  - **Strict 75%+ Crop Quality Shutter Lock**:
    - Capture button remains locked (`disabled`) until live crop identification confidence reaches $\ge 75\%$ on real outdoor crops, with localized live HUD guidance in Hindi and English.

### Project Team & Realtime Dynamic Contributors
- Updated `README.md` with all 4 core team contributors (**Dhrrishit V Deka**, **Paras Dwivedi**, **Vedant Parashar**, and **Sandeep Kumar Gupta**), direct live GitHub avatar links, and an auto-updating real-time GitHub contributors graph.

### Autonomous Agentic Fasal Saathi & Assistant Synchronization
- **Autonomous Agentic Command Execution**:
  - Fasal Saathi executes agentic tasks on voice/text command (*"Open camera for flood damage"*, *"Show verified claims"*, *"Switch to Hindi"*, *"Show my plots"*, *"Snooze reminder"*), automatically configuring protocols, pre-filling parameters, and navigating to the right screen.
- **Full Assistant Synchronization**:
  - Unified conversation and intent store across the web application.
  - Cleaned up interface by suppressing the duplicate floating launcher when on `/farmer/saathi`.

---

## [2.4.0] — 2026-08-22

### Autonomous Fasal Saathi Agent & Agentic Webapp Control
- **Full Autonomous Agent Tool Suite**:
  - Implemented complete agentic function calling for Fasal Saathi: `take_photo`, `switch_camera`, `select_angle`, `retake_angle`, `set_observation`, `submit_claim`, `check_evidence_quality`, `read_capture_guidance`, and `read_capture_progress`.
  - Unified `WebCaptureBridge` and `WebVoiceBroker` with bidirectional event synchronization, allowing full hands-free voice orchestration in 15 Indian languages.

### Comprehensive Image & Environmental Metadata Bundling
- **Rich Sensory & Agronomic Evidence Capture**:
  - Automatically captures and binds high-precision GPS (`lat`, `lon`, `accuracyM`), camera facing mode (`environment` vs `user`), image resolution (`width x height`), ISO 8601 timestamps, edge agronomic scores (ExG/GLI/ExR canopy %, luma, 2D Laplacian sharpness), and client-side SHA-256 cryptographic hashes on every shutter click.
  - Passes complete metadata payloads across the client, backend API routes (`/api/vision/gate`, `/api/claims`), and database persistence.

### Sequential Verification Pipeline (Gemini Multimodal Gate → Hugging Face Model)
- **Stage 1 (Gemini Multimodal & Context Gate)**:
  - Multimodal verification prompt evaluates raw image bytes + comprehensive metadata + spatial/environmental context.
  - Cross-verifies peril congruence (e.g. fire charred ash, flood inundation, hailstorm shredding, lodging flattening, drought chlorosis), rejects AI-generated images, screen captures, printed photos, and non-field artifacts.
- **Stage 2 (Hugging Face DINOv2 Foundation Model)**:
  - Strict sequential pipeline ensures only verified authentic evidence is dispatched to the Hugging Face Space (`dhrrishitvdeka/fasal-pramaan-api`, DINOv2 ViT-S/14).
  - Unverified / fraudulent photos are rejected early, preventing quota waste and generating clear farmer guidance.

---

## [2.3.0] — 2026-08-22

### Multi-Spectral Agricultural Computer Vision & Viewfinder
- **Multi-Spectral Agronomic Color Indices**:
  - Replaced basic green thresholding with normalized precision agriculture formulas: **Excess Green Index ($ExG = 2g_n - r_n - b_n$)**, **Green Leaf Index (GLI)**, **Visible Atmospherically Resistant Index (VARI)**, and **Excess Red / Ripe Grain Index ($ExR = 1.4r_n - g_n$)**.
  - Classifies all growth stages and disaster conditions: lush vegetative foliage, ripe golden wheat/paddy heads, bright yellow blooming flowers (mustard/canola/sunflower), chlorotic drought scorched leaves, and fire burn scar ash.
- **Organic Micro-Texture & False Positive Rejection**:
  - Computes 2D spatial Laplacian variance across detected candidate foliage. Purely flat, uniform green surfaces (plastic tarps, green clothes, painted walls) with near-zero texture are rejected.
  - Automatically filters atmospheric blue sky, neutral gray asphalt/concrete roads, and human skin tones.
- **Seamless Camera Viewfinder HUD & Reticles**:
  - Replaced rigid bounding box overlays with dynamic camera autofocus corner reticles that track canopy boundaries with smooth color state transitions (emerald glow when ready, amber when adjusting).
  - Floating translucent glassmorphism HUD chip with live pulse dot indicator, real-time localized instructions, and `{canopyPct}% canopy` status.
  - Interactive shutter button with glowing emerald ring feedback upon optimal framing.

### Farmer Portal & Plot Registration
- **Sensor-Only Field GPS Geo-Tagging**:
  - Removed manual latitude and longitude input fields from Plot Registration (`/farmer/reminders`) to enforce anti-tampering and PMFBY audit compliance.
  - Coordinates are acquired strictly via hardware device sensors (`navigator.geolocation`) with verified fix chips.
- **Alphabetical State Ordering**:
  - Sorted Indian States dropdown in ascending alphabetical order (A to Z) from Andhra Pradesh to West Bengal.
- **Responsive Mobile Layout & Badges**:
  - Fixed mobile text clipping and truncation on the Farmer Portal (`+ Registe:` / `View All Cl`).
  - Shortened raw claim UUIDs (`Claim #0e631a5b`) with full tooltip preservation, fixed badge overflow clipping, and added subtitle fallbacks for unspecified crop types (`- verified` fixed).

### Database & System Integration
- **Cadastral Plot Schema DDL**:
  - Added missing land revenue columns (`khata_number`, `hissa_number`, `tehsil`, `ownership_type`, `season`, `area_kattha`) to `public.web_plots` in `scripts/setup_web_schema.sql`.
- **Real-Time GitHub Stars Integration**:
  - Created dedicated `/api/github/stars` backend route with server-side fetching, shields.io rate-limit fallback, and 5-minute sliding TTL cache.
  - Dynamic repository configuration via `NEXT_PUBLIC_GITHUB_REPO`.

---

## [2.2.0] — 2026-08-22

### Computer Vision & Real-Time Evidence
- **Pure Real-Time Camera Capture Enforcement**:
  - Completely removed file upload fallbacks (`<input type="file" />`) from the Capture Studio to ensure anti-spoofing and anti-tamper compliance.
  - All agricultural damage evidence photos must be captured strictly in real-time through the live camera stream with authentic GPS coordinates and timestamping.
- **Upgraded Multi-Spectral Open CV & Usability Model**:
  - **Multi-Spectral Canopy Segmentation**: Implemented Excess Green Index ($ExG = 2g - r - b$) for lush vegetative foliage, Excess Red / Golden Crop Index for ripe wheat and mature crops, and charred matter detection for fire damage.
  - **2D Spatial Gradient & Laplacian Blur Filter**: Computes horizontal and vertical luminance gradient variance across adjacent pixels to detect motion blur and out-of-focus capture.
  - **Photometric Exposure Validation**: Evaluates true luminance to detect underexposed environments (`too_dark`, blocking shutter) and extreme solar glare (`too_bright`).
  - Off-thread Web Worker processing (`cv-worker.ts`) with real-time contour bounding box overlays.

### Voice & Multimodal AI
- **Resilient Dual-Engine Voice Architecture**:
  - **Primary Engine**: Google Gemini Live 2.0 with 16kHz PCM duplex bidirectional audio streaming over WebSockets and autonomous function calling.
  - **Fallback Engine**: Seamless transition to Web Speech Recognition (`SpeechRecognition` / `webkitSpeechRecognition`) with server-side Gemini 2.0 Flash peril intelligence (`classify_claim`) and Web SpeechSynthesis TTS audio playback.
  - Model resolution defaulted to `gemini-2.0-flash-exp` for universal Google AI Studio API key compatibility.

### Reviewer Operations & System Health
- **Live Multi-Service Telemetry Dashboard (`/health`)**:
  - Upgraded `/api/health` with concurrent, live roundtrip latency measurements (`latencyMs`) across Next.js Gateway, Supabase Postgres & Storage, Hugging Face ML Inference Space (DINOv2), Gemini Multimodal AI, IMD Open-Meteo weather telemetry, and Copernicus Sentinel-2 satellite engine.
  - Redesigned `/health` reviewer UI with operational status badges, "Ping All Services" trigger, configurable auto-refresh, KPI metric cards, and collapsible raw JSON diagnostics logs.

### UI / UX
- **Farmer Portal Desktop Navbar Redesign**:
  - Expanded layout width to `max-w-7xl` with responsive padding (`px-4 sm:px-6 lg:px-8`).
  - Unified segmented tab pills with `whitespace-nowrap` text wrapping protection.
  - Integrated branding badge, `HelpCircle` button, and farmer avatar chip.
  - Isolated GitHub star badge strictly to the landing page.

---

## [2.1.0] — 2026-08-22

### Core Engine & Architecture
- **Multi-Signal Triangulation System**:
  - Independent ground-truth validation orchestrating Copernicus Sentinel-2 (NDVI multi-spectral burn-scar analysis, 10 m resolution), IMD 7-day weather/hail anomalies, Overpass wildlife proximity (≤10 km radius), and ISRO Bhuvan land use / WMS layer integration.
  - Sowing-date-aware cumulative rainfall analysis (Open-Meteo archive) and hailstorm growth stage risk modeling (30/60/100-day thresholds).
  - Plot radius containment haversine verification (`plot_match`) between field capture coordinates and registered plot polygons.
- **On-Device Real-Time Edge Computer Vision & Gate**:
  - Web Worker running MobileNet v2 and greenness heuristics at 60 FPS for instantaneous blur, lighting, and crop framing feedback.
  - Multimodal Gemini Vision Gate filtering blurry, synthetic, indoor, or non-crop photos before server upload.
  - Client-side SHA-256 cryptographic hashing and tamper-proof GPS metadata for every capture angle.
- **Adaptive 4-Pillar Confidence Engine**:
  - Dynamic 4-pillar formulation (Coverage, Quality, Context, Integrity) with peril-specific thresholding across 8 disaster protocols.
  - Automated targeted recapture routing (`needs_recapture`) calculating exact confidence deltas (ΔC).
- **Deep Vision Analysis & Neural Scoring**:
  - DINOv2 / MobileNet neural models verifying crop genus, assessing lesion severity, and computing damage percentages.
- **Autonomous Conversational Intake & Multi-Language Localization**:
  - Fasal Saathi conversational voice & text intake powered by Gemini Live with server-side allowlisted tool execution.
  - Complete localization across 15 Indian languages (English, Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese, Urdu, Nepali, Sindhi).
- **Human-in-the-Loop Cockpit & Audit Feed**:
  - Officer decision rail with side-by-side satellite cross-check, authenticity chips, one-click overrides, and field survey dispatch.
  - Immutable audit trail and timeline history.
- **Demo Mode Optimization**:
  - Streamlined direct sign-in flow for demonstration credentials (`reviewer@fasalpramaan.local` / `Demo@12345`).

### UI/UX
- Improved UI/UX.

---

## [2.0.0] — 2026-08-22

The production-readiness wave: role-guarded routes, error boundaries, a PWA offline shell for the farmer portal, per-route rate limits on every write path, Playwright E2E scaffolding, client error telemetry, and OSS/legal hygiene.

### Security & Access
- **Route guards** (`src/lib/use-require-role.ts` + `src/components/AccessGate.tsx`): all 8 reviewer pages gate on session roles — `/review`, `/review/[id]`, `/overview`, `/analytics`, `/alerts`, `/map` require `reviewer|administrator`; `/audit` and `/admin` require `administrator`. Bilingual sign-in / access-denied cards with `?next=` return links; queries are gated via React Query `enabled` so no data fetches before the gate passes.
- **Per-route rate limits extended to every mutating route**, all returning `429` + `Retry-After`: `POST /api/claims` 10/min/user, `POST /api/claims/{id}/action` 30/min, `PATCH /api/milestones/{id}` 30/min (joining the existing gate 20/min, context 30/min, saathi/tool 30/min, telemetry 5/min, system/status 10/min).
- **Admin page rebuilt on `GET /api/system/status`**: administrator-only, rate-limited (10/min), returns booleans only (`supabase`, `gemini`, `sentinel`, `imdKey`, `hfSpaceUrl`, `version: "1.6.0"`) — never secret values.

### UX
- **Farmer portal mobile-first redesign**: bottom nav with filled active pills + `aria-current` + Saathi accent dot; dashboard quick-action hero grid, snap-x stats row and refresh button; capture page phone accordion guidance, sticky column-local shutter bar, scroll-snap angle pills (38% min-width), labelled observations field with 500-char counter, and disabled-submit reason text; claims list 64px thumbnails, full-width search above scrollable filter chips; Saathi composer docked above safe-area with 48px toggles; claim detail gallery uses real buttons + dialog semantics with bilingual hardcoded-string fixes.
- **Reviewer desktop redesign**: AppShell groups navigation into Cases/Insights/System clusters (icon-only below `lg` with tooltips, filled active state); review queue gains URL-persisted `q`/sort/peril filters, bulk accept (cap 25, sticky progress bar with n/N counter) and result counts; review detail becomes a two-column layout with sticky evidence rail and timeline history replacing raw JSON; overview gets a phone tab bar with hash persistence; analytics charts use fixed-height `ResponsiveContainer` + data-testids; audit/alerts get card layouts with `EmptyState`.
- **Error boundaries & skeletons**: `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`; `loading.tsx` skeletons at root, farmer and review segments; shared `EmptyState` component.

### Offline & PWA
- **Installable PWA**: `public/manifest.webmanifest` (start URL `/farmer`, theme/background `#1c1915`) plus generated `icon-192.png`/`icon-512.png` via dependency-free `scripts/generate-pwa-icons.mjs`.
- **Vanilla service worker** (`public/sw.js`): cache-first for static assets/icons/fonts, network-first navigations falling back to the cached `/farmer` shell when offline; **never caches `/api/*` or Supabase domains**. Registered in production only by the `PwaRegister` client component.
- **Bilingual offline banner** on the farmer portal using the shared `use-online-status` hook.

### Reliability
- **Client error telemetry** (`src/lib/telemetry.ts`): zero-dependency `initTelemetry()` wires `window.onerror` + `unhandledrejection` into a 50-entry ring buffer and console logging; errors POST to authed `POST /api/telemetry/error` (rate-limited 5/min, clamped fields, log-only) when a session token exists. Wired in `providers.tsx`.
- **Playwright E2E scaffold**: `playwright.config.ts` with desktop-chromium + mobile-pixel-7 projects (`PLAYWRIGHT_E2E=1` gates the dev webServer); specs in `e2e/{smoke,farmer-flow,reviewer-flow}.spec.ts` skip unless `E2E_SUPABASE_URL` is set; `npm run e2e` / `npm run e2e:headed` scripts; CI runs an e2e job on `workflow_dispatch` only, installing Chromium.

### OSS
- Bilingual `/privacy` and `/terms` pages linked from landing + login footers.
- README badges row (license, CI, PRs welcome) and Community links section; CONTRIBUTING documents the local E2E workflow.

---

## [1.6.0] — 2026-08-22

### Added
- **Plot radius containment** (`src/lib/context/assemble.ts`): `plotContainment()` haversine check of capture GPS vs the registered plot center emits a new `plot_match` `ContextSignal`; `plotLat`/`plotLon` flow from the capture page through `farmerStore.createClaim` → `POST /api/claims` → `persistAndInfer` → `assembleContext`, with a 200 m default radius via `plotProximityMeters` (clamped 10–5000; confidence 75 inside / 40 outside).
- **Sowing-date-aware IMD signals**: drought claims ≥30 days past sowing add cumulative rainfall since sowing from the Open-Meteo ARCHIVE endpoint (window starts at `max(sowing, now−180d)`) with `meta.windowRainfallMm/windowDays/daysSinceSowing` and weak-corroboration flagging below ~25 mm per month; hailstorm summaries append an estimated growth stage (30/60/100-day thresholds).
- **Farmer recapture notifications** (`src/lib/farmer-notifications.ts`): localStorage diffing of unseen `needs_recapture` claims renders amber toast panels on `/farmer` with a Capture-now deep link and Dismiss, plus a nav badge dot while notices are unseen.
- **Multi-Signal Context & Satellite Cross-Check card** (review detail): per-signal status chips, side-by-side `wide_field` photo vs live Bhuvan WMS tile, and a Copernicus Browser deep-link (`meta.burnMapUrl`, Sentinel-2 `S2_L2A_CDAS`, last 3 days).
- **Confidence delta chips**: re-evaluations surface ▲/▼ deltas bilingually from `adaptive_result.confidence_delta` + `previousConfidence` in both the reviewer `EvidenceConfidenceSection` and the farmer claim page.
- **Gate re-run button** (Authenticity card): reviewers can re-gate stored images (downloaded → data URLs → sequential authed `POST /api/vision/gate`); the outcome is audited via a `correct` action noting "Gate re-run recorded: X/Y usable".
- **Per-peril analytics**: `web-db.ts analyticsFromClaims().byPeril` returns `{peril, count, avgConfidence, recaptureRate}`; Overview peril rows show color-coded average confidence + recapture %, with a client-side fallback computation when server analytics are absent.
- **CSV export** (`src/lib/csv.ts`): dependency-free `toCsv`/`downloadCsv` utilities with Export buttons on the review queue (filtered rows, 10 columns) and the executive overview.
- **Voice language pinning**: `buildSystemPrompt` hard-pins Hindi (Devanagari)/English-only replies, Live setup pins the `Kore` voice via `speechConfig`, server-side classification reasoning is language-pinned, and `lang` is threaded through every Saathi tool call.
- **CV model warmup indicator**: the cv-worker posts `model_status` (`loading`/`ready`/`unavailable`), `realtime-cv.ts` exposes `onModelStatus`/`getModelStatus`, the capture page shows a bilingual "CV: AI ready/loading…" chip (hidden when unavailable), and weights prefetch starts on page mount.
- sowingDate now flows end-to-end from plot record through POST /api/claims to context assembly, activating drought cumulative-rainfall and hail growth-stage windows automatically.

---

## [1.5.0] — 2026-08-22

### Added
- **Real on-device computer vision** (`apps/dashboard/src/lib/vision/cv-worker.ts`): the Web Worker loads TF.js plus **MobileNet v2 (alpha 0.5, `@tensorflow-models/mobilenet@2.1.1`) from the jsdelivr CDN** and classifies viewfinder frames against plant/crop labels (`plant`, `leaf`, `crop`, `grass`, `maize`, `wheat`, `rice/paddy`, …) with a ≥0.18 probability floor, throttled to one inference per 500 ms; the model verdict is unioned with the green-pixel heuristic for `cropDetected`, and offline/CSP failures degrade gracefully to heuristic-only mode.
- **Full-duplex Saathi Voice Mode** (`src/app/farmer/saathi/page.tsx`): mic-toggle Gemini Live sessions with server-side tool execution via new `POST /api/saathi/tool`; text intake remains the fallback. Tools: `request_evidence_angles`, `call_context_signal`, `guide_capture`, and `classify_claim` (LLM peril classification now runs server-side in `src/lib/saathi/tools-server.ts` / `classify-server.ts`, off the client bundle).
- **Real free-tier external signals** (`POST /api/context/assemble`):
  - Sentinel **Tier 1**: real NDVI burn-scar detection via `sh.dataspace.copernicus.eu` process API (JSON raster, >5% low-NDVI pixels ⇒ burn) when `SENTINEL_TOKEN` is set; **Tier 2**: honest Open-Meteo archive extreme-heat proxy (>40 °C days over 30 d) without a token.
  - IMD/weather: open-meteo forecast adds hail days (WMO codes 96/99) and wind-gust max (>60 km/h supports lodging); `IMD_API_KEY` documented as a paid-upgrade hook.
  - Bhuvan WMS GetMap reachability probe; wildlife proximity via Overpass (forest/protected area ≤10 km, `animal_damage` only); nearby-farmland count via Overpass (≤2 km).
- **Adaptive engine auto-recapture**: a Medium result (`request_missing`) moves the claim straight to `needs_recapture` with bilingual adaptive reasons persisted as `recapture_reason`/`recapture_reason_hi`; re-evaluations track `previousConfidence` + `confidence_delta` inside `adaptive_result`.
- **Authenticity Gate persistence & overrides**: per-image gate verdicts persist to `web_claim_images.gate_result`; reviewers can execute an `override_gate` action that stamps `overridden`/`overriddenBy`/`overriddenAt`, surfaced on a new Authenticity Gate card on the review detail page.

### Security
- `POST /api/vision/gate`, `/api/context/assemble`, and `/api/saathi/tool` all require Supabase Auth JWTs (`requireWebActor`).
- Shared in-memory rate limiter (`src/lib/server/rate-limit.ts`): 20–30 req/min per user per route.
- Server-side input clamps: lat/lon ranges, canonical-angle whitelists, ≤64 KB tool bodies, strict sowing-date regex.
- Site-lock unlock compares passwords in constant time; secrets isolated server-side.

---

## [1.4.0] — 2026-08-22

### Changed
- Webapp-only repository: removed Docker stack, FastAPI services, and Flutter app; dashboard remains the single deployable (Vercel).
- `apps/dashboard` is the only application target; Vercel Root Directory stays `apps/dashboard`.
- `scripts/` now contains only the Supabase SQL setup (`setup_supabase.sql`, `setup_web_schema.sql`, `setup_web_schema_peril.sql`, `lock_web_rls.sql`) and `test_supabase_conn.py`; `spaces/fasal-pramaan-api` continues to serve the crop model on Hugging Face.
- Documentation (README, GETTING_STARTED, docs index, CONTRIBUTING, SECURITY) rewritten for the webapp-only architecture.

---

## [1.3.0] — 2026-08-18

### Added
- **Vercel-hosted farmer and reviewer web portal** (`apps/dashboard`):
  - Farmer capture at `/farmer/capture` persists real photos (no showcase or localStorage-only path).
  - Hugging Face inference on `POST /api/claims` via Space `dhrrishitvdeka/fasal-pramaan-api` running `dhrrishitvdeka/fasal-pramaan-model`.
  - Reviewer queue at `/review` lists the same claim IDs from Supabase `web_*` tables.
- **Supabase persistence** for the hosted web path: private bucket `fasal-web-evidence`, RLS on `web_*` tables, env-only credentials.
- **Root `vercel.json`** so Vercel builds `apps/dashboard` from the repository root.
- **Local run kit** in `local/` (`start.ps1`, `start.sh`, README).
- Documentation for the hosted path: `docs/deployment.md`, `docs/supabase-integration.md`, `docs/environment-variables.md`, `docs/security.md`.

---

## [1.2.0] — 2026-08-17

### Added
- **4-Dimensional Evidence Confidence & Trust Evaluation Engine**:
  - Independent formulation: Final Confidence = 0.4 × Quality + 0.3 × Coverage + 0.2 × Context + 0.1 × Integrity.
  - Canonical threshold (≥ 85.0) for evidence sufficiency.
  - Deterministic 4-tier uncertainty classification with strict priority ordering (Integrity ≻ Coverage ≻ Visual ≻ Context).
  - Immutable historical snapshot persistence in `evidence_evaluations` table with component breakdowns.
- **Adaptive Evidence Recapture Workflow**:
  - Replaces blanket 5-photo retakes with targeted angle requests (e.g. `closeup_damage`, `wide_field`).
  - Automated re-evaluation pipeline with exact confidence delta (ΔC) calculation.
  - Bilingual farmer guidance (Hindi and English).
- **Comprehensive Documentation Architecture**:
  - Dedicated technical specifications: `docs/evidence-evaluation.md` and `docs/adaptive-recapture.md`.
  - Authoritative AI governance and safety boundary documentation (`docs/governance-and-safety.md`).
  - Model card and frozen benchmark validation metrics (`docs/AI_MODEL_MVP.md`).
  - Presentation-ready MUN exhibition showcase guide (`docs/demo-walkthrough.md`).

---

## [1.1.0] — 2026-08-04

### Added
- **Fasal Saathi Gemini Live Voice Assistant**: Full-duplex Hindi/English conversational assistant for farmers.
- Same-origin WebSocket proxy (`/api/v1/voice/live`) for secure ephemeral session token provisioning.
- Allowlisted voice tools with spoken confirmation gates for state-mutating operations.
- Recurring geo-tagged evidence reminders engine.
- Automated local upload, classification, and reviewer-queue pipeline.

---

## [1.0.0] — 2026-07-15

### Added
- Initial open-source release of Fasal-Pramaan.
- Farmer capture portal and Reviewer Command Centre with PostGIS GIS mapping and audit trail.
- Multi-spectral satellite verification and weather anomaly triangulation.
- DINOv2 neural inference pipeline.
