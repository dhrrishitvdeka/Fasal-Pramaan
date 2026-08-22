# Security Architecture & Trust Controls

Fasal-Pramaan implements a **defense-in-depth security model** engineered to protect sensitive agricultural and farmer data, prevent fraudulent claim submissions, and guarantee the non-repudiation of photographic evidence.

---

## 1. Security Architecture Matrix

| Security Domain | Implemented Control | Technical Implementation |
|---|---|---|
| **Identity & Passwords** | Supabase Auth | Managed credential hashing and lockout-resistant defaults; the public site additionally sits behind a shared gate password (`SITE_LOCK_PASSWORD`). |
| **Session & Tokens** | Supabase Auth JWT | Short-lived signed session tokens; global logout revokes the session; server routes verify the JWT before acting. |
| **Refresh Tokens** | Supabase Token Rotation | Refresh tokens are rotated automatically with reuse detection by Supabase Auth. |
| **Role-Based Access (RBAC)** | Principle of Least Privilege | Reviewer vs farmer roles resolved from `REVIEWER_EMAILS` / `app_metadata.roles`; farmers only access their own claims and plots. |
| **Spatial Fencing** | Plot Ownership Scoping | Farmer data is ownership-scoped in `web_*` tables; plot boundary geometry is stored in Supabase Postgres (PostGIS extension). |
| **Service-Role Isolation** | Server-Only Keys | All privileged writes flow through Next.js server routes holding `SUPABASE_SERVICE_ROLE_KEY`; outbound calls to the Hugging Face Space use server-only `HF_TOKEN`. Neither is ever exposed to the browser. |
| **Evidence Immutability** | Content-Addressed Storage | Object keys are server-generated; direct client file naming is prohibited; uploaded bytes are immutable in the private `fasal-web-evidence` bucket. |
| **Anti-Tamper & Anti-Fraud** | Multi-Factor Verification | SHA-256 checksums, duplicate detection across angles, EXIF capture time consistency, and GPS accuracy validation. |
| **Browser Protection** | CSP & Memory Retention | Strict Content Security Policy; tokens retained in memory rather than `localStorage` to prevent XSS exfiltration. |
| **Managed Platform Hardening** | Serverless + RLS | Vercel serverless runtime with no long-lived processes; Supabase anon RLS policies on `web_*` tables and storage stay closed. |

---

## 2. Threat Modeling & Mitigation

```mermaid
flowchart TD
  subgraph Threats["Threat Vectors"]
    T1["Fraudulent Photo Reuse\n(Internet / Historical Images)"]
    T2["GPS Spoofing / Mock Location"]
    T3["Digital Screen Replay Attacks"]
    T4["Insecure Direct Object Reference (IDOR)"]
    T5["AI Model Poisoning / Overrule"]
  end

  subgraph Mitigations["Fasal-Pramaan Defenses"]
    M1["SHA-256 + Perceptual Hash (pHash) Deduplication"]
    M2["GPS Accuracy Validation + Registered Plot Boundary Match"]
    M3["High-Frequency Texture & Moiré Pattern Analysis"]
    M4["Strict UUID Ownership & Jurisdiction Database Scoping"]
    M5["Model Separation: AI Assists, Evidence Engine Governs, Reviewer Decides"]
  end

  T1 --> M1
  T2 --> M2
  T3 --> M3
  T4 --> M4
  T5 --> M5
```

---

## 3. Cryptographic Evidence Verification Pipeline

```mermaid
sequenceDiagram
  autonumber
  participant Client as Browser (Capture Studio)
  participant API as Next.js Server Route (POST /api/claims)
  participant Store as Supabase Storage (fasal-web-evidence)

  Client->>API: 1. Sends images with declared SHA-256, byte size, and MIME type
  API->>API: 2. Validates payload limits and recomputes SHA-256 server-side
  API->>Store: 3. Writes raw image bytes to the private bucket (server-generated keys)
  API->>Store: 4. Persists metadata with integrity flags in web_claim_images
  alt Hash or Byte Size Mismatch / Duplicate Across Angles
    API->>API: Mark Image as "failed" & Deduct Integrity Score (-65.0)
  else Verification Passes
    API->>API: Mark Image as "uploaded" & Set is_original_immutable=True
  end
```

---

## 4. Operational Secrets & Deployment Policy

1. **Zero Hardcoded Secrets**: All cryptographic keys, database passwords, and API tokens are injected strictly via environment variables. Never commit `SUPABASE_DB_PASSWORD`, `HF_TOKEN`, or publishable/service keys. `scripts/test_supabase_conn.py` reads env only.
2. **Vercel server-only keys**: `SUPABASE_SERVICE_ROLE_KEY` and `HF_TOKEN` must never be named `NEXT_PUBLIC_*`. The evidence bucket `fasal-web-evidence` is private.
3. **Local vs. Production Isolation**: Never enable demo credentials or mock inference fallbacks on a hosted deployment; keep demo data out of the production Supabase project.
4. **Audit Trails**: All reviewer overrides, claim status mutations, and voice assistant operations write immutable records to the `audit_logs` table with actor UUID and timestamp. Hosted web actions also go to `web_review_actions`.
