# Supabase integration

The webapp uses Supabase for Auth, Postgres (`web_*` tables), and the private evidence bucket. **Inference is Gemini, not Hugging Face.**

## Env

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
REVIEWER_EMAILS=
SITE_LOCK_PASSWORD=
```

## Tables

Created by `scripts/setup_web_schema.sql` (+ peril columns). RLS closed by `scripts/lock_web_rls.sql`. Browser keys cannot read claims; Next.js routes use the service role after verifying the user JWT.

- `web_plots`, `web_claims`, `web_claim_images`, `web_milestones`, `web_review_actions`, `web_profiles`

Gemini analysis is stored on the claim (`hf_label` / `model_id` columns keep their names for compatibility; `gate_result.geminiAnalysis` holds the written rationale).

## Storage

Bucket `fasal-web-evidence`, private. Uploads go through `POST /api/claims` with server-generated keys and a server-recomputed SHA-256.

## What not to set

`HF_TOKEN`, `HF_SPACE_URL`, `NEXT_PUBLIC_API_BASE_URL`.
