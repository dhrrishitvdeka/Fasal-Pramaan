# SVH26007 end-to-end audit, remediation, and readiness report

> **Historical audit snapshot (2026-07-18).** Body text below is preserved as the remediation record from that date. For the **current** product defaults, start with [GETTING_STARTED.md](../GETTING_STARTED.md), [ai-service.md](./ai-service.md), and [security.md](./security.md).

**Audit date:** 2026-07-18  
**Addendum date:** 2026-07-24  
**Repository:** Fasal Pramaan  
**Decision (unchanged in spirit):** Ready for a controlled, honestly labelled MVP demonstration. **Not ready for production insurance decisions or an internet-facing government deployment.**

## Current status addendum (supersedes §1 / §5 / §7 defaults where they conflict)

| Topic | 2026-07-18 snapshot said | Current code (2026-07-24) |
|---|---|---|
| Default model | MobileNetV2 plant-disease demo (~41.67% on synthetic val) | **`crop_health_v4` DINOv2 ViT-S/14 ONNX** under `services/ai/models/crop_health_dinov2_v14/` (vendored; non-production; A/B/C/U only) |
| MobileNet | Treated as “shipped artifact” | **Legacy optional** adapter `plant_disease` only |
| Alembic head | `003_session_security` | **`004_crop_health_grade`** (after 001–003) |
| Compose ports | Remediation aimed at full loopback | **LAN-facing** API/AI/dashboard/mobile/MinIO S3; **loopback** DB/Redis/MinIO console — see [security.md](./security.md) |
| Field/web client | Mobile mainly described as Flutter native | Docker **web field app on `:8085`** with nginx `/backend` proxy; dashboard on `:3000` |
| API `AI_MODEL_ADAPTER` default | Often plant_disease in older configs | **`crop_health_v4`** in API settings, AI service, and Compose |
| Git history | Multi-commit working tree | Single clean initial commit on GitHub with model artifacts included |

The principal **programme** blocker remains model/field validation and governance—not “missing workflow code.” Independent, capture-protocol-matched field validation is still required before any insurance decision claim.

---

## 1. Executive verdict (2026-07-18 wording)

The repository now implements a credible end-to-end evidence workflow: real device capture and GPS, encrypted offline persistence, resumable upload, server-side evidence verification, asynchronous AI processing, mandatory human review, jurisdiction-scoped staff access, map/dashboard views, alerts, and audit records. The local Docker stack starts cleanly and the tested web/backend paths are operational.

**At audit time**, the principal model blocker was the then-default MobileNetV2 leaf-disease demonstration on synthetic PlantVillage-style images (**41.67%** on that synthetic val set). **That adapter is now legacy.** The current default is DINOv2 `crop_health_v4` (see addendum). Either way, the application correctly treats AI output as non-production and routes incomplete or uncertain cases to human review or physical inspection. Independent field data, evaluation, privacy review, and government/insurer acceptance remain external prerequisites.

The most serious application risks found during the audit were remediated: publicly bound infrastructure, unauthenticated AI, unauthenticated Redis/Celery, cross-jurisdiction field-officer access, ineffective logout, refresh-token reuse, single-process production rate limiting, trusted-proxy ambiguity, production API documentation exposure, global image-hash disclosure, unsafe admin settings, health-session leakage, dead Celery retry configuration, exception leakage, root containers, weak production defaults, and missing CSP.

## 2. Source provenance and audit scope

The requested authoritative file `C:\Users\dhrri\Downloads\Problem_statements.pdf` was absent at audit time, and no PDF was present in Downloads. The repository's `Problem_Statement_and_Solution_SVH26007.pdf` was deleted in the working tree but recoverable from Git `HEAD`; that two-page artifact was extracted, rendered, and visually inspected as the provisional SVH26007 baseline. The baseline was cross-checked against the Government of India PIB description of CROPIC: time-series, geo-tagged smartphone photographs; crop validation; peril/damage assessment; near-real-time surveillance; and support for YESTECH. This provenance limitation must be resolved before a formal procurement or compliance sign-off.

The review covered the first-party inventory across API, AI service and model artifacts, dashboard, Flutter mobile app, migrations, infrastructure, CI, scripts, tests, and documentation. The inventory contained 544 files, including 52 API files, 336 AI files (predominantly the small image dataset), 33 dashboard files, 96 mobile files, 15 prior documentation files, and one root script. Generated dependencies and caches were excluded from code review.

The working tree already contained extensive user-owned modifications and untracked work. They were preserved. Remediation was applied in place without resetting or overwriting unrelated changes.

## 3. SVH26007 requirement traceability

| ID | Expected outcome | Evidence | Status | Gap / next proof |
|---|---|---|---|---|
| R1 | Guided, stage-aware crop photographs | `guided_capture_screen.dart`; crop-cycle/growth-stage API; required wide, canopy, and close-up angles | Done | Physical-device UX acceptance test remains useful |
| R2 | Honest geo-tagged capture | Geolocator-derived coordinates, accuracy policy, device ID, capture time, farm geofence validation | Done | GPS spoofing requires device attestation if threat model demands it |
| R3 | Intermittent connectivity | AES-GCM offline payload/media, queued sync, backoff, idempotency, `server_id` resume | Done | Flutter suite could not be executed on this Windows host because Flutter/Dart is absent |
| R4 | Image validation | Client checks; signed upload; server observed size/type/SHA/decode; optional quality/OOD stage | Partial | No forensic liveness, provenance attestation, or malware scanner |
| R5 | Crop identification | Hierarchical adapter and crop labels | Partial | Shipped checkpoint is limited and not representative of target crops/field scenes |
| R6 | Growth-stage detection | Domain/schema/correction workflow | Partial | Shipped checkpoint explicitly returns no growth-stage prediction |
| R7 | Damage detection for lodging, flood, water stress, pest/disease | Domain taxonomy and human workflow support all perils | Partial | Shipped learned model is leaf-disease-only |
| R8 | Severity and affected-area estimation | Validated 0–100 schema, review corrections, final assessment | Partial | AI intentionally returns `null` where it has no valid estimator |
| R9 | Near-real-time map/dashboard/alerts | Map, filters, overview, review queue, analytics, health and alert pages; worker/SSE infrastructure | Done | Alert acknowledgement and richer export remain open |
| R10 | Evidence-based loss assessment and reduced bias | Evidence metadata, immutable hashes, model provenance, review override reasons, audit log | Done | Operational reviewer QA and bias monitoring are programme work |
| R11 | Transparent status and recapture | Mobile status sync, review outcomes, notifications and recapture workflow | Done | Live SMS/email channel is external |
| R12 | YESTECH/PMFBY alignment | Compatible evidence concepts and human-reviewed output | External prerequisite | Requires authoritative schemas, contracts, DPIA, and integration testing |

## 4. Material findings and remediation

| Finding | Severity | Root cause | Remediation / evidence | Status |
|---|---|---|---|---|
| S-01 Publicly bound DB, Redis, MinIO console and AI | Critical | Local compose defaults exposed every port on all interfaces | Compose binds host ports to `127.0.0.1`; production still needs a TLS ingress/private network | Partial |
| S-02 AI inference accepted unauthenticated traffic | Critical | No service identity | API/worker send `X-Service-Token`; AI protects model/inference routes; production requires a 32+ character token; unauthenticated live check returned 401 | Done |
| S-03 Redis/Celery were unauthenticated | Critical | Development Redis default | Redis `requirepass`; authenticated API, broker and result URLs; unauthenticated `PING` failed and authenticated `PING` returned `PONG` | Done |
| S-04 Field officers could traverse all farmer data | High | `is_staff()` was used as global read access | Recursive jurisdiction filters now scope farms, crop cycles, submissions and SSE; regression test covers out-of-scope list/read denial | Done |
| S-05 Logout did not revoke access tokens | High | JWT validity was independent of user session state | Per-user `token_version` is carried in JWT and checked against DB; logout increments it; live post-logout `/auth/me` returned 401 | Done |
| S-06 Rotated refresh-token reuse was not detected | High | Tokens had no family lineage | Migration adds family/replacement links; reuse revokes the whole family; regression test added | Done |
| S-07 Production limiter was process-local | High | In-memory fixed-window implementation | Configurable Redis fixed-window backend; production refuses memory backend | Done |
| S-08 Client IP trusted arbitrary forwarding headers | High | Proxy boundary was undefined | Forwarded IP is used only when the immediate peer is inside configured trusted CIDRs | Done |
| S-09 Weak or demo production configuration could boot | High | Validation did not cover all new infrastructure controls | Production asserts strong JWT/demo credentials, CORS, real AI mode/token, Redis auth, and Redis rate limiting | Done |
| S-10 Global SHA lookup leaked cross-account evidence existence | Medium | De-duplication query was global | Duplicate lookup is submitter-scoped; server still verifies hash after upload | Done |
| S-11 Presigned upload did not bind declared length | Medium | Signature covered type/key but not length | Signed request includes `ContentLength`; response tells clients to send matching `Content-Length`; final verification remains authoritative | Done |
| S-12 Arbitrary admin settings and unbounded audit queries | Medium | Dynamic JSON store had no schema/audit discipline | Settings allowlist/object validation/audit event; query limit capped at 500 | Done |
| S-13 Health failure could leak a DB session and exception details | Medium | Session close was only on success | Context-managed session and sanitized health response | Done |
| S-14 Celery advertised retries but never retried | High | `max_retries` existed without `self.retry()` | Retryable AI failures now persist retry state and use exponential Celery retry; exhaustion routes to physical inspection | Done |
| S-15 Empty or missing image bytes could create false confidence | High | Worker/adapter contract allowed metadata-only input | Quality pipeline reports inconclusive rather than inventing damage; worker routes incomplete output to physical inspection; live queued jobs demonstrated this path | Done |
| S-16 Rejected claim retained misleading final severity | Medium | Review transition changed status only | Rejection clears final/current severity and any prior final assessment flag, while preserving reviewer notes | Done |
| S-17 API/AI ran as root | Medium | Minimal Dockerfiles omitted user creation | API, worker and AI run as UID 10001; dashboard runs as UID 1001 | Done |
| S-18 Dashboard lacked CSP | Medium | No response security policy | CSP, frame, MIME, referrer and related headers configured; live dashboard returned policy | Done |
| S-19 Seed logs exposed a demo password | Medium | Convenience log output | Seed logs only that synthetic credentials were sourced from environment, never the password | Done |
| S-20 AI returned internal exception text | Medium | Raw exception used as response detail | Internal stack is logged; client receives a stable sanitized failure | Done |
| S-21 Production could silently use mock AI | Critical | Mock fallback defaulted true in container configuration | Default is false; AI production startup refuses mock fallback | Done |
| M-01 Model is not fit for insurance decisions | Critical | Tiny synthetic, narrow, non-independent training/evaluation corpus | Honest registry/docs/API disclaimers; incomplete estimates stay null; mandatory human review | External prerequisite |
| M-02 No formal AV/content-disarm and retention lifecycle | Medium | Object verification focuses on image integrity | Size/type/hash/decode/versioning hooks exist | External prerequisite |
| M-03 Browser session is client-managed | Medium | Static Next.js app has no server-side BFF session | Tokens are memory-only, refresh is implemented, 401 clears session, CSP exists | Partial |
| M-04 Reviewer case claiming is absent | Medium | Queue rows are not assigned atomically | Row lock protects action mutation, but no claim/lease UX exists | Open |
| M-05 Account verification/recovery lacks real channels | Medium | No SMS/email provider or government identity integration | Public registration now remains unverified; non-development OTP remains unavailable | External prerequisite |
| M-06 Mobile verification could not run locally | Medium | Flutter/Dart SDK is not installed on audit host | Static code review completed; four pure-unit test files exist | Open |

## 5. AI/ML suitability assessment

> **Update:** Section 5 originally described the MobileNet demo. For the **current default model**, see [ai-service.md](./ai-service.md) and [AI_MODEL_MVP.md](./AI_MODEL_MVP.md) (DINOv2 v14, internal frozen metrics, non-production). MobileNet details below remain valid for the **legacy** `plant_disease` adapter only.

### Legacy artifact (MobileNet — not the current default)

- Architecture: MobileNetV2 transfer learning (not the current DINOv2 default).
- Classes: 15 PlantVillage-style labels across apple, corn, potato, and tomato.
- Dataset: 240 training and 60 validation images produced by the repository's synthetic generator.
- Training: 3 epochs.
- Live container evaluation: 25 correct of 60, accuracy 0.4167.
- Data integrity check: 300 files, 300 unique exact hashes, no exact train/validation overlap.
- Important caveat: absence of exact duplicates does not make the evaluation independent; both splits come from the same synthetic generator and several disease categories share the same generic spotted-leaf construction.

### Unsupported production claims

The evidence does not support accuracy claims for real farm imagery, Indian agro-climatic conditions, target insurance crops, camera/device diversity, multiple growth stages, or perils such as lodging/flood/water stress. There is no calibrated severity or affected-area model, segmentation, plot-area estimation, external test set, subgroup/bias evaluation, uncertainty calibration, adversarial/quality study, or insurer/government acceptance test.

### Required model programme

1. Approve lawful, consented, crop/peril/stage-labelled field data with geography and device diversity.
2. Define crop, stage, peril, severity, area, quality, and out-of-distribution label protocols with agronomists and loss assessors.
3. Freeze farm/location/time-grouped train/validation/test splits before training; prevent near-duplicate leakage.
4. Evaluate per crop, stage, peril, state/region, device, lighting and severity; report precision/recall, calibration, abstention, and human-review workload.
5. Validate on a prospective independent field pilot and document model/data cards, versioning, monitoring, rollback, and privacy impact.
6. Retain mandatory human review until the competent authority explicitly approves a bounded automated use.

## 6. Authentication, authorization, and data-boundary matrix

| Actor | Own farms/cycles/submissions | Jurisdiction data | Review actions | Admin/audit | AI service |
|---|---:|---:|---:|---:|---:|
| Farmer | Read/write own | No | No | No | No |
| Field officer | Read/write assigned jurisdiction and descendants; on-behalf owner checks | Yes, scoped | No | No | No |
| Reviewer | Read cases/dashboard | Programme review scope | Yes | No | No |
| Admin | Administrative scope | Yes | Yes | Yes | No direct browser access |
| API/worker service | Required backend access | Required backend access | Processing only | Internal writes | Token-authenticated |

Authorization uses DB-loaded roles rather than trusting the role list inside the JWT. Ownership and jurisdiction checks are applied to object reads and mutations. Staff password rules are stronger, public registration is farmer-only, and new public accounts are not falsely marked verified.

## 7. Database and evidence integrity

- **Current Alembic head:** `004_crop_health_grade` (after `001` → `002_integrity_hardening` → `003_session_security`). The 2026-07-18 live check reported head `003_session_security` before the crop-health grade migration landed.
- Migration `002_integrity_hardening` adds integrity/range checks; `003_session_security` adds access-token versioning and refresh-token families; `004` extends prediction/review fields for crop-health grades.
- Evidence confirmation uses server-observed object metadata and bytes, not client claims alone.
- Uploads bind object key, media type, byte length, and `If-None-Match`; confirmation recomputes SHA-256 and requires a decodable image.
- Object-store versioning is configurable and production storage should enforce lifecycle/retention/legal-hold policy outside application code.

## 8. Historical backlog reconciliation

Status legend: **Done**, **Partial**, **Open**, **External prerequisite**, **Rejected/not applicable**, **Duplicate**. This section supersedes earlier planning-only backlog notes that were not versioned as product docs.

### P0

| ID | Status | Evidence / disposition |
|---|---|---|
| P0-01 | Partial | Compose binds demo surfaces to LAN (`0.0.0.0`) for local multi-device demos; DB/Redis/MinIO console stay loopback. Private networks, TLS edge and WAF remain deployment prerequisites |
| P0-02 | Done | AI route token authentication when configured; production requires a strong token. LAN-bound AI still relies on compose default token for demos |
| P0-03 | Done | Redis AUTH and authenticated Celery URLs |
| P0-04 | Done | Expanded production startup assertions |
| P0-05 | Done | Capture persists actual Geolocator coordinates and accuracy |
| P0-06 | Done | Real camera path and platform scaffolding present |
| P0-07 | Done | Dashboard/mobile refresh flow implemented |
| P0-08 | Done | Sync resumes by server ID and treats finalize idempotently |

### P1

| ID | Status | Evidence / disposition |
|---|---|---|
| P1-01 | Done | Recursive jurisdiction scoping and regression tests |
| P1-02 | Done | Token-version access revocation on logout |
| P1-03 | Done | Refresh families and reuse revocation |
| P1-04 | Done | Redis-backed production limiter |
| P1-05 | Done | Explicit trusted proxy CIDRs |
| P1-06 | Done | Docs/OpenAPI disabled outside development/test/local |
| P1-07 | Done | Submitter-scoped image hash de-duplication |
| P1-08 | Partial | Content length is signed; AV and lifecycle enforcement remain deployment work |
| P1-09 | Done | Allowlist, value validation and audit log |
| P1-10 | Done | Query cap applied |
| P1-11 | Partial | Memory-only tokens, refresh/401 handling and CSP done; no BFF/httpOnly session |
| P1-12 | Done | AES-256-GCM encrypted payload and media with secure-storage key |
| P1-13 | Done | Health DB session context-managed |
| P1-14 | Done | Incomplete/zero-byte evidence cannot become a confident assessment |
| P1-15 | Done | Real Celery retry with exhaustion path |
| P1-16 | Done | Mobile registration calls farmer registration API |

### P2

| ID | Status | Evidence / disposition |
|---|---|---|
| P2-01 | Partial | Jurisdiction helpers moved to dependencies; several route-private helpers remain |
| P2-02 | Partial | Core role/status constants exist; cross-client magic strings remain |
| P2-03 | Open | `submissions.py` remains a large route module |
| P2-04 | Partial | Major domain endpoints are typed; some dashboard/admin dynamic dictionaries remain |
| P2-05 | Partial | AI output contract is documented/tested but not a single shared generated schema |
| P2-06 | Done (removed) | Empty `packages/*` placeholders removed from the tree; contracts stay in FastAPI OpenAPI |
| P2-07 | Open | Orphan root `package-lock.json` remains |
| P2-08 | Done | Canonical `goal.md` restored and linked to this report |
| P2-09 | Open | Design-token consolidation is not required for MVP correctness |
| P2-10 | Open | `slowapi` remains unused in requirements |
| P2-11 | Partial | Touched paths normalized; repository-wide cleanup remains |
| P2-12 | Open | Mobile still relies heavily on dynamic maps |
| P2-13 | Partial | Shared API client/components exist; dedicated query hooks remain limited |
| P2-14 | Partial | Riverpod app structure exists; some services are still instantiated ad hoc |
| P2-15 | Partial | EN/HI chrome and messages exist; full page copy is not complete |
| P2-16 | Partial | `GETTING_STARTED.md` is primary, but overlapping guides remain |

### P3

| ID | Status | Evidence / disposition |
|---|---|---|
| P3-01 | Partial | Processing/review transitions work; naming still includes transient `uploaded`/legacy states |
| P3-02 | Done | Reject now clears severity/finality and preserves notes |
| P3-03 | Open | No reviewer claim/lease workflow |
| P3-04 | Done | Mobile consumes recapture status/required angles |
| P3-05 | Done | Global 401 clears session and returns to login flow |
| P3-06 | Done | Dashboard navigation is role-gated |
| P3-07 | Done | Splash checks existing session |
| P3-08 | Done | Role-aware mobile routing |
| P3-09 | Done | Touched controllers are disposed |
| P3-10 | Done | Persistent device UUID replaces demo literal |
| P3-11 | Done | Map query/filter path avoids the prior per-marker pattern |
| P3-12 | Partial | Main aggregations use SQL; some small result shaping remains in Python |
| P3-13 | Done | District metric computed/removed from fake path |
| P3-14 | Done | Redis is mandatory for production limiter; memory backend is local only |
| P3-15 | Open | Health checks create a Redis client rather than reusing a long-lived pool abstraction |
| P3-16 | Partial | SSE is access-controlled and documented; clients primarily poll/sync |
| P3-17 | Open | CSV export remains basic |
| P3-18 | Open | Alert acknowledgement UI/API is absent |
| P3-19 | External prerequisite | Non-development recovery stays unavailable pending a real channel/provider |
| P3-20 | Partial | Accounts are honestly unverified; actual verification is external |
| P3-21 | Done | 10+ character upper/lower/digit/symbol policy |
| P3-22 | Partial | Rate limits and lockout exist; CAPTCHA/progressive risk controls remain external/product work |
| P3-23 | Done | Live CSP/security headers verified |
| P3-24 | Open | Offline abandoned-media purge policy is not complete |
| P3-25 | External prerequisite | Offline basemap licensing/tile packaging requires a deployment decision |
| P3-26 | Done | Password removed from seed logs |
| P3-27 | Partial | Soft-delete filters cover primary paths; full graph lifecycle policy needs formalization |
| P3-28 | Partial | Dashboard has schema tests and all static/build gates, but broader interaction coverage is open |

### P4

| ID | Status | Evidence / disposition |
|---|---|---|
| P4-01 | External prerequisite | Managed secret store and rotation process |
| P4-02 | External prerequisite | Managed DB, backup/restore drill and enforced bucket versioning/retention |
| P4-03 | External prerequisite | Edge WAF/DDoS service |
| P4-04 | External prerequisite | Deployment Sentry/OTEL endpoints and runbooks |
| P4-05 | External prerequisite | Independent model evaluation and formal geo/evidence privacy assessment |
| P4-06 | External prerequisite | PMFBY/YESTECH partner contracts and interface specifications |
| P4-07 | External prerequisite | Independent penetration test and remediation certificate |
| P4-08 | External prerequisite | Trademark and app-store clearance |

## 9. Verification record

| Check | Result |
|---|---|
| API Ruff | Pass |
| API test suite in container | **44 passed**, one upstream Starlette/httpx deprecation warning |
| AI Ruff | Pass |
| AI test suite in container | **23 passed**, one upstream Starlette/httpx deprecation warning |
| Dashboard ESLint | Pass |
| Dashboard TypeScript | Pass |
| Dashboard unit tests | **2 passed** |
| Dashboard production build | Pass; 13 routes generated |
| npm high-severity audit | 0 vulnerabilities |
| API and AI `pip-audit` | No known vulnerabilities in pinned requirement sets |
| Alembic live head (at audit) | `003_session_security`; **current head is `004_crop_health_grade`** |
| Alembic metadata drift | No new upgrade operations detected |
| Docker Compose parse | Pass |
| Full stack | API/AI/DB/Redis/MinIO healthy; worker and dashboard running |
| API health | HTTP 200; DB/Redis/storage/AI all `ok` |
| AI service auth | Unauthenticated models request 401; authenticated request 200 |
| Live inference smoke | HTTP 200 with shipped checkpoint |
| Redis auth | Unauthenticated PING rejected; authenticated PING `PONG` |
| Container users | API/worker/AI UID 10001; dashboard UID 1001 |
| Dashboard CSP | Present on live `/login` response |
| Login/logout smoke | Login/me succeeds; old access token returns 401 after logout |
| ML checkpoint evaluation | 25/60 = 0.4167 on synthetic validation set |
| Dataset exact-hash audit | 300/300 unique; zero exact train/validation overlaps |
| Tracked high-confidence secret scan | No committed private key/token pattern found |
| Git whitespace check | Pass after README cleanup |
| Flutter analyze/test/build | **Not run:** Flutter/Dart SDK not installed on the audit host |
| iOS build | **Not run:** iOS toolchain unavailable on Windows |

The Flutter and iOS entries are explicit unverified areas, not implied passes. Before a demo, run `flutter analyze`, `flutter test`, an Android debug/release build, and physical-device capture/offline/resume tests in CI or on a configured workstation.

## 10. Deployment gates

### Controlled MVP/demo

Permitted after:

1. Use only synthetic/demo accounts and informed participants.
2. Display the non-production AI disclaimer and require human review.
3. Keep host bindings local/private or place the stack behind authenticated TLS.
4. Run the Flutter tests/build and physical-device capture/GPS/offline-resume script.
5. Do not describe the 41.67% synthetic checkpoint as field accuracy.

### Internet-facing pilot

Blocked until managed secrets, private service networking, TLS/WAF, backups and restore drill, bucket retention/versioning, real account verification/recovery, observability/alerts, AV/upload abuse controls, mobile release verification, DPIA/privacy approval, and an independent penetration test are complete.

### Insurance-decision production

Blocked until the model programme in section 5 succeeds on independent representative field data, human/process QA is accepted by the competent authority, PMFBY/YESTECH interfaces are authorized, and governance explicitly defines permitted automated versus human decisions.

## 11. Recommended next actions

1. Obtain and archive the actual authoritative SVH26007 problem-statement PDF; update the source hash and traceability if it differs from the recovered repository copy.
2. Add Flutter SDK execution to CI and record Android physical-device evidence for real camera, GPS, airplane-mode capture, restart, token expiry and resumable sync.
3. Treat field dataset acquisition/evaluation as the top programme workstream; it is the only path to closing the critical model-readiness blocker.
4. Add reviewer claim/lease, alert acknowledgement, richer export, and object-retention/AV workflows before a multi-user pilot.
5. Commission DPIA/privacy, threat-model, BOLA/upload-abuse penetration testing, backup restore, key rotation, and incident-response exercises.
6. Consolidate placeholder packages, shared contracts, route-module size, client models, and duplicated onboarding docs as maintainability work after the above gates.

## 12. Key remediation locations

- Production configuration and rate limiting: `services/api/app/core/config.py`, `services/api/app/core/rate_limit.py`, `services/api/app/main.py`
- Authentication/session integrity: `services/api/app/api/v1/auth.py`, `services/api/app/core/deps.py`, `services/api/alembic/versions/003_session_security.py`
- Jurisdiction authorization: `services/api/app/api/v1/farms.py`, `services/api/app/api/v1/submissions.py`, `services/api/app/api/v1/sse.py`
- Evidence upload: `services/api/app/services/storage.py`, `services/api/app/api/v1/submissions.py`
- Review/worker safety: `services/api/app/api/v1/review.py`, `services/api/app/workers/tasks.py`
- AI boundary: `services/ai/app/main.py`, `services/ai/app/adapters/crop_health_v4.py` (current default), legacy `plant_disease.py`
- Dashboard boundary: `apps/dashboard/src/lib/api.ts`, `apps/dashboard/next.config.mjs`
- Infrastructure and CI: `docker-compose.yml`, `.env.example`, API/AI/dashboard Dockerfiles, `.github/workflows/ci.yml`, `Makefile`

This report is an engineering readiness assessment of the audited working tree, not a government certification, insurance approval, privacy opinion, or penetration-test certificate.
