# Honest limits (hackathon MVP)

## Models

- **Gemini 3.8 Flash** (`gemini-3.8-flash`) analyses submitted stills. A/B/C/U are **workflow buckets**, not payout, disease identity, or yield loss.
- **Gemini 3.1 Flash Live** is audio-only. The viewfinder is not streamed.
- **On-device OpenCV** is colour/texture/screen heuristics. It can miss a clever fake; Gemini on the still is the real authenticity check.
- `gemini-2.0-flash` is **shut down**. Do not pin it on Vercel.

## Evidence scores

- Quality uses client-measured blur/lighting when present.
- Coverage is “required angles present”.
- Context is “GPS numbers present”, plus Open-Meteo / optional Sentinel / Bhuvan probe.
- Integrity checks SHA-256 presence and detects duplicate hashes reused across distinct angles within a claim (penalizing integrity to 35). There is **no pHash**, no EXIF parser, and no mock-GPS detector.
- Duplicate SHA detection is scoped across angles within the claim; it is not a global farm-wide search.

## External signals

- **Open-Meteo** always runs (no key). `IMD_API_KEY` does not call IMD yet.
- **Sentinel Process API** only for `fire_burn` + GPS + a valid CDSE Bearer. Otherwise heat-proxy + Browser link.
- **Bhuvan** is a WMS/2D reachability probe, not cadastral classification.
- **Overpass** can 504; then wildlife/nearby stay `pending`.

## Product

- Reviewer pages are client-gated; APIs still check JWT + role.
- `/privacy` and `/terms` are demo summaries, not legal counsel.
- Offline PWA opens the farmer shell; it does not queue captures.
- `/api/health` is liveness only.
