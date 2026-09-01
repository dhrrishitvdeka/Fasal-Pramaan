# Operational Boundaries & Governance Specifications

Fasal-Pramaan is engineered with explicit operational boundaries to guarantee responsible, explainable, and human-supervised claim adjudication.

---

## 1. Scope of the Local Vision Transformer Model

The default `crop_health_v4` DINOv2 ViT-S/14 model provides **assisted optical leaf-health screening** across four primary crops: maize, paddy, potato, and wheat.

- **Screening vs. Settlement**: The model outputs structured screening buckets (`A` = Healthy, `B` = Borderline/Uncertain, `C` = Disease Pattern, `U` = Unusable/OOD). It is not designed to autonomously compute final insurance payout percentages or legal liabilities.
- **Multi-Peril Scope**: While the optical model excels at identifying foliar fungal and bacterial lesion patterns, landscape-scale perils (such as macro flooding, hailstorm devastation, regional drought, or lodging) are evaluated via the comprehensive 5-angle spatial capture protocol (`wide_field`, `left_context`, `mid_canopy`, `right_context`, `closeup_damage`) and adjudicated by human reviewers.
- **Potato Healthy Baseline**: As documented in the benchmark model card ([AI_MODEL_MVP.md](./AI_MODEL_MVP.md)), the potato healthy subset contains high natural visual variation (recall `0.25`, F1 `0.32`), and the engine conservatively routes borderline potato cases to human review via Grade `B`.

---

## 2. Evidence Trust Engine Boundaries

- **Separation of Concerns**: Model inference confidence ($P_{\text{model}}$) is strictly decoupled from Evidence Trust Confidence ($C_{\text{final}}$). High model certainty on an un-geotagged or blurry photo will not artificially inflate the evidence trust score.
- **Missing Signal Policy**: The system never converts missing signals (e.g., absent GPS or unverified checksums) into passed scores. Missing inputs result in explicit deductions and lower confidence bounds.
- **Anti-Fraud Enforcement**: Suspected duplicate files, perceptual collisions, or mock GPS signals trigger mandatory human investigation and cannot be cleared by automated recaptures.

---

## 3. Hosted web (Vercel) boundaries

- **Hosted model is assistive only**: the Fasal-Pramaan Space runs `dhrrishitvdeka/fasal-pramaan-model` (DINOv2 ViT-S/14 ONNX). It returns crop-conditioned A/B/C/U workflow buckets. It does not estimate disease identity, severity, affected area, or payout. Human review is required.
- **GPS is strictly acquired via hardware device sensors**: `navigator.geolocation`. There are no manual coordinate overrides or text entry fields, preventing GPS spoofing. Missing GPS lowers the context score and blocks the `plot_match` containment check — it is never treated as a pass. Plot-radius containment (vs the registered plot center) and multi-signal weather checks run server-side during context assembly, degrading to explicit `pending`/`unavailable` signals when inputs are absent.
- **Hosted Fasal Saathi** mints a short-lived Gemini Live token on the server (`GEMINI_API_KEY` never goes to the browser). Anyone who passes the site lock can start a session and spend Gemini quota. Browser Web Speech dictation on the observation box remains as a fallback.
- **Hosted access control**: site lock is only a quota gate. Data access requires a Supabase user JWT. Farmers see their own claims. Reviewers are `REVIEWER_EMAILS` or `app_metadata.roles`. Anon has no table or storage policies.

---

## 4. Signal & Tooling Limits (v1.6.0 wave)

- **Sentinel burn-scar needs a token**: real NDVI `burnRatio` detection requires `SENTINEL_TOKEN`/`COPERNICUS_TOKEN`; without one, fire claims fall back to an honest Open-Meteo extreme-heat proxy (>40 °C days over 30 d) that plausibility-checks but does not image the burn scar. The same token also powers the review-page NDVI trend sparkline (`/api/claims/{id}/satellite-trend`) — without it the card renders nothing.
- **NDVI trend is cloud-gated and conservative**: 5-day intervals whose dataMask mean is < 0.5 (mostly cloud / no scene) are dropped, and the `vegetation_collapse` verdict requires ≥ 2 clean baseline points plus a ≥ 20% mean NDVI drop — overcast monsoon windows can legitimately yield `insufficient_data`.
- **Bhuvan WMS reachability**: the ISRO Bhuvan tile service may be unreachable from the server; claims then carry a manual-check link (`status:"pending"`) instead of a fetched land-use tile in the Satellite Cross-Check card.
- **MobileNet weights first download**: the CV worker's TF.js + MobileNet v2 weights (~9 MB) are fetched from CDN on first use per browser; the capture page prefetches them on mount and shows a warmup badge, but offline/blocked-CDN devices degrade to heuristic-only crop detection.
- **Gate re-run is a manual reviewer action**: re-running the authenticity gate on stored photos happens only when a reviewer clicks the button on the review detail Authenticity card (client-orchestrated `/api/vision/gate` calls); there is no scheduled or automatic re-gating.

---

## 5. Production-Readiness Wave — Resolved vs. Remaining (v2.0.0)

**Resolved in the v2.0.0 wave** (previously open gaps):

- **Route guards**: all 8 reviewer pages (`/review`, `/review/[id]`, `/overview`, `/analytics`, `/alerts`, `/map` = `reviewer|administrator`; `/audit`, `/admin` = `administrator`) now gate rendering via `useRequireRole` + `AccessGate`, with React Query `enabled` flags so no data fetches before the gate passes.
- **Error boundaries**: `app/error.tsx`, `app/global-error.tsx`, and `app/not-found.tsx` plus `loading.tsx` skeletons (root, farmer, review segments) mean a render crash or bad route no longer blanks the whole SPA.
- **Client telemetry exists**: window errors land in a 50-entry ring buffer and forward to authed, rate-limited `POST /api/telemetry/error`.
- **Admin page is live**: `/admin` reads the administrator-only `GET /api/system/status` instead of being a dead stub.
- **E2E coverage exists**: Playwright specs (desktop-chromium + mobile-pixel-7) with a manually-triggered CI job.

**Still honest limitations after v2.0.0:**

- **The service worker does not queue captures offline.** Offline captures survive only as `sessionStorage` drafts for the current session; there is no IndexedDB outbox, so closing the tab loses unsent evidence. The PWA guarantees pages *open* offline, not that submissions persist.
- **Telemetry is console/log-only without a real SDK.** Errors are buffered in memory (lost on reload) and printed to the server console via the log-only intake; `NEXT_PUBLIC_SENTRY_DSN` is wired as an env slot but `Sentry.init` is still TODO until `@sentry/nextjs` is added.
- **Bulk accept only — no bulk recapture.** The review queue supports bulk *accept* (cap 25 per batch); requesting recaptures or escalations remains one claim at a time.
- **Legal pages are placeholders.** `/privacy` and `/terms` are bilingual placeholder summaries linked from the landing and login footers — not reviewed legal text. Replace before any production pilot with real users.

For full architectural governance and risk mitigation protocols, see [AI Governance & Safety Boundaries](./governance-and-safety.md).
