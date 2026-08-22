# 🛠️ Fasal-Pramaan: Issues & Bug Backlog (`to_be_fixed.md`)

This document catalogs all technical flaws, vulnerabilities, logical bugs, and optimization opportunities discovered during the multi-agent system audit.

---

## 📋 Table of Contents

- [1. Critical Severity Flaws (Priority 1)](#1-critical-severity-flaws-priority-1)
- [2. High Severity Flaws (Priority 2)](#2-high-severity-flaws-priority-2)
- [3. Medium Severity Flaws (Priority 3)](#3-medium-severity-flaws-priority-3)
- [4. Recommended Fix Order & Checklist](#4-recommended-fix-order--checklist)

---

## 1. Critical Severity Flaws (Priority 1)

### [CRITICAL-01] Privilege Escalation via User-Controlled `user_metadata.roles`
- **File**: `apps/dashboard/src/lib/web-auth.ts` (Lines 33–51, 91–96)
- **Root Cause**: `resolveWebRole()` accepts `userRoles: user.user_metadata?.roles`. In Supabase Auth, `user_metadata` is writable by any authenticated user via `supabase.auth.updateUser()`. An untrusted farmer can self-assign the `administrator` or `reviewer` role.
- **Impact**: Unauthorized access to the Reviewer Command Centre, adjudication overrides, and confidential claims.
- **Fix**: Remove `user.user_metadata?.roles` from role resolution. Only resolve roles from server-controlled `user.app_metadata?.roles`, database records in `web_profiles.role`, or `reviewerEmailAllowlist()`.

---

### [CRITICAL-02] Insecure Privilege Fallback to Reviewer/Administrator on Failed Auth
- **File**: `apps/dashboard/src/lib/api.ts` (Lines 607–622)
- **Root Cause**: In `currentSessionRoles()`, if the request to `/auth/me` fails or encounters an error, the code defaults to:
  ```ts
  return response?.data?.roles || ["reviewer", "administrator"];
  ```
- **Impact**: Unauthenticated or failing sessions fail open and gain administrative privileges in the frontend.
- **Fix**: Change default fallback from `["reviewer", "administrator"]` to `["farmer"]` or `[]`.

---

### [CRITICAL-03] Vision Gate Failure Catch Block Falls Through to Hugging Face Model
- **File**: `apps/dashboard/src/lib/claim-pipeline.ts` (Lines 694–735, 941–977)
- **Root Cause**: The gate rejection handler is wrapped in an outer `try...catch` block with `catch { // gate errors should not block inference }`. If a database write throws inside the failure block, execution falls through to invoke the Hugging Face model on rejected, spoofed, or AI-generated photos.
- **Impact**: Defeats anti-fraud protection; rejected photos still receive valid AI predictions.
- **Fix**: Make gate failure terminal. If `gate.gateFailed === true`, immediately return `unusablePrediction` without falling through to Hugging Face inference under any catch branch.

---

### [CRITICAL-04] Stale In-Memory Object Drops All Context Signals in First-Time Claims
- **File**: `apps/dashboard/src/lib/claim-pipeline.ts` (Lines 660–753)
- **Root Cause**: `assembleContext` computes and persists live Sentinel, IMD, Bhuvan, and GPS signals to the database, but does not update the local in-memory `persisted.claim` object. The adaptive engine reads `(persisted.claim as any).context_signals` (which is `null`), falling back to `[]`.
- **Impact**: All fresh environmental signals are dropped during first-time claim evaluation, falsely downgrading claims to Medium/Low and causing false recapture requests.
- **Fix**: Store assembled signals in a local variable `effectiveSignals` and pass them directly to `adaptiveConfidence()`.

---

### [CRITICAL-05] Vision Gate Blocklist Bypass for Valid Rejection Reasons
- **File**: `apps/dashboard/src/lib/claim-pipeline.ts` (Line 12), `apps/dashboard/src/lib/vision/gate-shared.ts`
- **Root Cause**: `GATE_BLOCK_REASONS` only includes `["wrong_crop", "ai_generated", "too_dark", "not_crop"]`. Rejections with `"no_field"`, `"too_blurry"`, or `"unusable"` cause `gateFailed` to evaluate to `false`.
- **Impact**: Blurry or non-field photos bypass the gate and proceed to the Hugging Face model.
- **Fix**: Treat any result where `usable === false` as a gate failure (`gateFailed = perImage.some(r => !r.usable)`).

---

### [CRITICAL-06] Infinite Recapture Deadlock in `fire_burn` & Invalid Angle ID (`__gps__`)
- **File**: `apps/dashboard/src/lib/context/adaptive-engine.ts` (Lines 57–68)
- **Root Cause**:
  1. For `fire_burn` claims awaiting Sentinel satellite passes, `nextStep` returns `"request_missing"` even when all photos are captured (`missingAngles: []`), trapping the claim in `needs_recapture` forever.
  2. For `animal_damage`, `"__gps__"` is pushed into `missingAngles`, crashing angle renderers in the UI.
- **Impact**: Farmers are repeatedly prompted to recapture photos for missing satellite passes, and UI components crash on synthetic angle IDs.
- **Fix**: If photographic angles are complete for `fire_burn`, set `nextStep = "proceed"` with `level: "medium"`; never inject non-canonical angle IDs into `missingAngles`.

---

### [CRITICAL-07] Charred Burnt Stalks Trigger Shutter Deadlock in Fire Damage Claims
- **File**: `apps/dashboard/src/lib/voice/capture-actions.ts` (Lines 24–29), `apps/dashboard/src/app/farmer/capture/page.tsx` (Line 446)
- **Root Cause**: `runVoiceShutter()` unconditionally rejects frames with `lightingScore < 12` (`isUnusableLighting`). Burnt stalks and blackened soil naturally produce low mean luma (<12), permanently locking the shutter.
- **Impact**: Farmers cannot take photos for fire damage claims.
- **Fix**: Pass `peril` into `runVoiceShutter()` and bypass `isUnusableLighting` when `peril === "fire_burn"`.

---

### [CRITICAL-08] `POST /api/saathi/tool` Rejects Agentic Tools with `400 Unknown tool`
- **File**: `apps/dashboard/src/app/api/saathi/tool/route.ts` (Lines 7–12)
- **Root Cause**: `ALLOWED_TOOLS` in `route.ts` only lists 4 legacy tools and does not include the 7 new agentic tools: `take_photo`, `switch_camera`, `select_angle`, `retake_angle`, `set_observation`, `submit_claim`, `check_evidence_quality`.
- **Impact**: Voice tool executions fail when dispatched through the server.
- **Fix**: Add all 7 new tools to `ALLOWED_TOOLS` and implement argument sanitizers.

---

### [CRITICAL-09] Unclamped and Unvalidated Capture GPS Coordinates in Ingestion Endpoint
- **File**: `apps/dashboard/src/app/api/claims/route.ts` (Lines 167–170)
- **Root Cause**: `body.captureLat`, `body.captureLon`, and `body.captureAccuracyM` are passed raw to `persistAndInfer()` without `clampNumber()` sanitization.
- **Impact**: Out-of-bounds floats, `NaN`, or malformed strings pollute the database and break haversine math.
- **Fix**: Sanitize `captureLat` (-90 to 90), `captureLon` (-180 to 180), and `captureAccuracyM` (0 to 100,000) using `clampNumber()`.

---

### [CRITICAL-10] Missing Peril/Gate/Context Columns in `setup_web_schema.sql`
- **File**: `scripts/setup_web_schema.sql` (Lines 36–81), `apps/dashboard/src/lib/supabase-store.ts` (Lines 11–35)
- **Root Cause**: Core columns (`peril`, `intent_id`, `gate_result`, `context_signals`, `adaptive_result`) were declared in a separate migration script (`setup_web_schema_peril.sql`) and are missing from `setup_web_schema.sql`.
- **Impact**: Fresh deployments strip and silently discard all AI gate results and environmental signals.
- **Fix**: Merge all column definitions from `setup_web_schema_peril.sql` directly into `setup_web_schema.sql`.

---

### [CRITICAL-11] Backend Adjudication Accepts Claims Without Integrity/Gate Validation
- **File**: `apps/dashboard/src/lib/claim-pipeline.ts` (Lines 1169–1185), `apps/dashboard/src/app/api/claims/[id]/action/route.ts`
- **Root Cause**: `applyReviewerAction()` has no guard checking `gateFailed` or `integrity_score < 50` when `action === "accept"`. Bulk accept operations can mark fraudulent or gate-blocked claims as `verified`.
- **Impact**: High risk of accidental acceptance of fraudulent claims.
- **Fix**: Throw an error if attempting to `accept` a claim with `gateFailed: true` (without an explicit override) or `integrity_score < 50`.

---

## 2. High Severity Flaws (Priority 2)

### [HIGH-01] Multi-Angle Coverage Overcounting via Duplicate Angles
- **File**: `apps/dashboard/src/lib/claim-pipeline.ts` (Lines 477–482), `apps/dashboard/src/lib/evidence.ts` (Line 127)
- **Root Cause**: Coverage score is computed as `usable.length / requiredAngles.length`. Submitting 5 photos of the same angle (`wide_field`) yields 100% coverage.
- **Fix**: Compute coverage strictly on the count of distinct required angles present in the submission.

---

### [HIGH-02] Gemini API Key Leaked via URL Query Parameter
- **File**: `apps/dashboard/src/lib/vision/gate-shared.ts` (Line 207), `apps/dashboard/src/lib/saathi/classify-server.ts` (Line 56)
- **Root Cause**: Gemini requests append `?key=${apiKey}` to the URL.
- **Impact**: API keys appear in HTTP proxy logs, CDN traces, and error dumps.
- **Fix**: Pass the API key in the `x-goog-api-key` HTTP header.

---

### [HIGH-03] Prompt Injection Vulnerability in Gemini Vision Gate
- **File**: `apps/dashboard/src/lib/vision/gate-shared.ts` (Lines 172–180)
- **Root Cause**: `metadata.farmerObservation` is concatenated directly into the LLM system prompt without escaping.
- **Fix**: Sanitize `farmerObservation` (strip quotes/newlines, limit length) and place it inside a delimited untrusted context block (`UNTRUSTED USER CLAIM: """..."""`).

---

### [HIGH-04] Voice Bridge Handler Teardown Race Condition on Every Realtime CV Frame
- **File**: `apps/dashboard/src/app/farmer/capture/page.tsx` (Lines 707–786), `apps/dashboard/src/lib/voice/capture-bridge.ts`
- **Root Cause**: `webCaptureBridge.register` is in a `useEffect` that depends on `cvResult` (which updates every 333ms), unregistering and re-registering handlers continuously.
- **Fix**: Store live states in React `useRef` handles and register `webCaptureBridge` once on mount (`[]` dependency array).

---

### [HIGH-05] Audio Barge-In / Interruption Failure
- **File**: `apps/dashboard/src/components/FasalSaathiOverlay.tsx` (Lines 215–238), `apps/dashboard/src/app/farmer/saathi/page.tsx`
- **Root Cause**: On Gemini Live `interrupted` events, scheduled `AudioBufferSourceNode` objects in Web Audio were not stopped or disconnected.
- **Fix**: Maintain a `Set<AudioBufferSourceNode>` and call `node.stop(); node.disconnect();` on every node upon interruption.

---

### [HIGH-06] Open-Meteo Archive API HTTP 400 on Current Date
- **File**: `apps/dashboard/src/lib/context/assemble.ts` (Lines 467–476)
- **Root Cause**: Requesting current date (`new Date()`) from the Open-Meteo archive API fails with 400 Bad Request because archive data has a 2-day latency.
- **Fix**: Offset `end_date` by -2 days (`Date.now() - 2 * 86400000`).

---

### [HIGH-07] Reviewer Corrections Ignored in Overview and Analytics
- **File**: `apps/dashboard/src/lib/web-db.ts` (Lines 300–312), `apps/dashboard/src/lib/claim-pipeline.ts` (Line 1059)
- **Root Cause**: `claimFromRow()` maps `severityGrade` only from `row.severity_grade`, ignoring `row.corrected_severity` and `row.corrected_crop`.
- **Fix**: Prioritize `row.corrected_severity || row.severity_grade` and `row.corrected_crop || row.crop_identified`.

---

### [HIGH-08] Evidence Image Signed URLs Expire After 7 Days
- **File**: `apps/dashboard/src/lib/supabase-store.ts` (Lines 94–105), `apps/dashboard/src/app/api/claims/route.ts`
- **Root Cause**: Stored URLs have a 7-day TTL. Viewing claims older than 7 days returns 403 Forbidden.
- **Fix**: Refresh signed URLs dynamically via `resolveImageUrl()` in `GET /api/claims` and `GET /api/claims/[id]`.

---

### [HIGH-09] Storage Bucket Name Inconsistency & Store Fallback Regex
- **File**: `scripts/setup_supabase.sql` (Line 18), `apps/dashboard/src/lib/supabase-store.ts` (Lines 13–18)
- **Root Cause**: `setup_supabase.sql` creates `'fasalpramaan-evidence'` while the app expects `'fasal-web-evidence'`, and the fallback regex omits `adaptive_result`.
- **Fix**: Standardize on `'fasal-web-evidence'` and update regex to `/peril|intent_id|gate_result|context_signals|adaptive_result/i`.

---

## 3. Medium Severity Flaws (Priority 3)

### [MED-01] GPU Native Texture Leaks & Dynamic Canvas Allocation in Real-Time CV
- **File**: `apps/dashboard/src/lib/vision/realtime-cv.ts`, `apps/dashboard/src/lib/vision/cv-worker.ts`
- **Fix**: Wrap `createImageBitmap` with explicit error cleanup (`bitmap.close()`) and reuse singleton scratch canvas elements instead of allocating new DOM elements 4x/second.

---

### [MED-02] Bounding Box Width Coordinate Overflow & Inverted Clamping Math
- **File**: `apps/dashboard/src/lib/vision/cv-worker.ts` (Lines 648–653), `apps/dashboard/src/lib/vision/realtime-cv.ts`
- **Fix**: Clamp `bx` to `[0, 0.85]` and compute `width = clamp(bw, 0.05, 1 - bx)` so that `left + width <= 1.0` is always guaranteed.

---

### [MED-03] Reviewer Gate Override Leaves Claim at 0% Confidence and Grade 'U'
- **File**: `apps/dashboard/src/lib/claim-pipeline.ts` (Lines 1225–1245)
- **Fix**: When `action === "override_gate"`, recalculate evidence preview and restore non-zero confidence.

---

### [MED-04] Coordinate `(0,0)` Treated as Valid GPS Location in Haversine Containment
- **File**: `apps/dashboard/src/lib/context/assemble.ts` (Lines 168–187)
- **Fix**: Treat `(0, 0)` as missing coordinates and return `status: "unavailable"`.

---

### [MED-05] CSV Formula Injection Vulnerability & Blank `created_at` Column
- **File**: `apps/dashboard/src/lib/csv.ts` (Lines 1–8), `apps/dashboard/src/app/review/page.tsx` (Line 162)
- **Fix**: Prepend `'` if a cell value starts with `[=+\-@\t\r]` to prevent CSV injection; populate `created_at` from `claim.created_at`.

---

### [MED-06] Missing Standalone `SatelliteCrossCheckCard.tsx` & Bhuvan Tile Error Reset
- **File**: `apps/dashboard/src/app/review/[id]/page.tsx` (Lines 31–52)
- **Fix**: Extract `SatelliteCrossCheckCard.tsx` and reset image error state when URL changes (`useEffect(() => setFailed(false), [url])`).

---

### [MED-07] GIS Map Status & District Filter Mismatch
- **File**: `apps/dashboard/src/app/map/page.tsx`, `apps/dashboard/src/lib/api.ts` (Lines 508–517)
- **Fix**: Map `pending_review` filter to `under_review || submitted`, and add district filtering to `mapMarkers()`.

---

### [MED-08] Confidence Delta Formatting Bug (`Δ +-10`)
- **File**: `apps/dashboard/src/components/EvidenceConfidenceSection.tsx` (Lines 348–353)
- **Fix**: Format delta with explicit sign: `{storedDelta > 0 ? `+${storedDelta}` : storedDelta}`.

---

### [MED-09] Query Key Invalidation Mismatches on Adjudication Actions
- **File**: `apps/dashboard/src/app/review/[id]/page.tsx` (Lines 159–160)
- **Fix**: Invalidate matching query keys (`["audit"]`, `["map"]`, `["damage-cat"]`, `["severity"]`, `["by-crop"]`).

---

## 4. Recommended Fix Order & Checklist

- [ ] **Step 1**: Fix Auth privilege escalation in `web-auth.ts` and `api.ts` ([CRITICAL-01], [CRITICAL-02]).
- [ ] **Step 2**: Harden vision gate failure handling in `claim-pipeline.ts` & `gate-shared.ts` ([CRITICAL-03], [CRITICAL-05]).
- [ ] **Step 3**: Fix context signal dropping and adaptive loop deadlocks ([CRITICAL-04], [CRITICAL-06]).
- [ ] **Step 4**: Unlock fire damage camera shutter in `capture-actions.ts` ([CRITICAL-07]).
- [ ] **Step 5**: Enable all 7 agentic tools in `api/saathi/tool/route.ts` ([CRITICAL-08]).
- [ ] **Step 6**: Sanitize capture coordinates and block unauthorized claim recapture in `api/claims/route.ts` ([CRITICAL-09], [CRITICAL-11]).
- [ ] **Step 7**: Merge schema columns in `setup_web_schema.sql` ([CRITICAL-10], [HIGH-09]).
- [ ] **Step 8**: Fix multi-angle coverage calculation in `claim-pipeline.ts` & `evidence.ts` ([HIGH-01]).
- [ ] **Step 9**: Move Gemini API keys to `x-goog-api-key` header ([HIGH-02]) and sanitize prompts ([HIGH-03]).
- [ ] **Step 10**: Fix voice bridge race condition ([HIGH-04]) and audio graph interruption cleanup ([HIGH-05]).
- [ ] **Step 11**: Fix Open-Meteo archive date offset and parallelize context queries ([HIGH-06]).
- [ ] **Step 12**: Synchronize reviewer corrections into analytics & overview ([HIGH-07]).
- [ ] **Step 13**: Resolve live signed URLs for evidence images ([HIGH-08]).
- [ ] **Step 14**: Apply memory, layout, and UI fixes ([MED-01] through [MED-09]).
- [ ] **Step 15**: Run `npm test` and `npx tsc --noEmit` to verify 100% test pass rate.
