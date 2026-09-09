# Platform Boundaries & Operational Constraints

## Models

- **Gemini 3.8 Flash** (`gemini-3.8-flash`) analyses submitted stills. Severity grades (A/B/C/U) drive PMFBY Scale-of-Finance calculations (`estimated_loss_inr` and `affected_area_hectares`), leading to approved DBT payouts upon reviewer verification. Note: this visual damage assessment is distinct from formal YESTECH crop cutting experiment (CCE) statistical yield modeling.
- **Crop Synonym Mapping**: Common Indian crop variations (paddy $\leftrightarrow$ rice, maize $\leftrightarrow$ corn, gram $\leftrightarrow$ chickpea) are mapped via `crop-synonyms.ts` to prevent false `wrong_crop` gate blocks.
- **Reviewer Gate Override**: When a claim is flagged by the gate, the reviewer can override the verdict to verify the claim; overridden claims can be accepted.
- **Field Camera Shutter Lock**: Strict on-device crop coverage checks ($\ge 75\%$ or $\ge 40\%$ for fire burn perils), Laplacian texture variance, and screen-reflection checks prevent invalid captures before network transmission.
- **Gemini 3.1 Flash Live** is audio-only. The viewfinder is not streamed.
- **On-device OpenCV** is colour/texture/screen heuristics. It can miss a clever fake; Gemini on the still is the real authenticity check.
- **Model Resolution**: Primary visual model is `gemini-3.8-flash` with dynamic fallback chain (`gemini-3.7-flash` → `gemini-3.5-flash` → `gemini-2.5-flash`).

## Evidence scores

- Quality uses client-measured blur/lighting when present.
- Coverage is “required angles present”.
- Context is “GPS numbers present”, plus Open-Meteo / optional Sentinel / Bhuvan probe.
- Integrity checks SHA-256 digests and 64-bit difference hash (dHash perceptual similarity with Hamming distance $\le 6$) across angles within a claim to penalize duplicate or copied photos (down to 35). There is no native EXIF hardware-signature parser or kernel-level mock-GPS detector.
- Duplicate SHA detection is scoped across angles within the claim; it is not a global farm-wide search.

## External signals

- **Open-Meteo** always runs (no key). `IMD_API_KEY` does not call IMD yet.
- **Sentinel Process API** only for `fire_burn` + GPS + a valid CDSE Bearer. Otherwise heat-proxy + Browser link.
- **Bhuvan** is a WMS/2D reachability probe, not cadastral classification.
- **Overpass** can 504; then wildlife/nearby stay `pending`.

## Product

- Reviewer **data** is API-gated (JWT + role). `proxy.ts` also redirects unauthenticated browsers away from `/farmer`, `/review`, `/overview`, `/map`, `/alerts`, `/admin`, `/audit`, and `/health`. Role UX (`useRequireRole`) is still client-side.
- `/privacy` and `/terms` are platform operational summaries, not formal legal counsel.
- Offline PWA opens the farmer shell; it does not queue captures. HTML for `/farmer` is not cached.
- `/api/health` is liveness only (`{ ok, status, timestamp }`). Dependency booleans are administrator-only on `/api/system/status`.
- In-memory rate limits are per Vercel isolate. Login/signup/forgot/unlock always throttle; a shared store (Upstash/KV) is still the right next step if the deployment scales horizontally.
- `IMD_API_KEY` does not call IMD. Weather is Open-Meteo. Sentinel flood/drought rasters need `SENTINEL_TOKEN`.
