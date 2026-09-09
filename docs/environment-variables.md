# Environment variables

Copy `apps/dashboard/.env.example` to `apps/dashboard/.env.local`. On Vercel, set the same names on the project (Root Directory = `apps/dashboard`).

**Never** prefix server secrets with `NEXT_PUBLIC_`.

## Required for Production Deployment

| Variable | Public? | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **no** | Server writes + storage. Never `NEXT_PUBLIC_*` |
| `REVIEWER_EMAILS` | **no** | Comma-separated reviewer logins. Everyone else is a farmer |
| `GEMINI_API_KEY` | **no** | Vision gate, field analysis, Saathi classify, Live mint. Alias: `GOOGLE_API_KEY` |

Without Gemini, capture still works with a weak heuristic gate and no written analysis.

## Strongly recommended on Vercel

| Variable | Notes |
|---|---|
| `SITE_LOCK_PASSWORD` | Shared gate for the public URL (`/unlock`) |
| `APP_ORIGIN` or `NEXT_PUBLIC_SITE_URL` | Canonical origin used in signup/reset emails. **Required in production** so Host-header poisoning cannot rewrite the redirect |
| `ENABLE_RATE_LIMIT` | Optional. Production already enables the in-memory limiter. Set `true` to force it in local dev. `DISABLE_RATE_LIMIT` never bypasses login/signup/forgot/unlock |
| `GEMINI_VISION_MODEL` | Default **`gemini-3.8-flash`**. Fallbacks: `gemini-3.7-flash` → `gemini-3.5-flash` → `gemini-2.5-flash` |
| `GEMINI_LIVE_MODEL` | Default **`gemini-3.1-flash-live-preview`** |
| `GEMINI_LIVE_VOICE` | Default `Kore` |
| `GEMINI_LIVE_SESSION_MINUTES` | Default `15` |

Ensure `GEMINI_VISION_MODEL` is set to `gemini-3.8-flash` or left unset so the code default applies.

## Optional context signals

| Variable | What it actually does |
|---|---|
| `SENTINEL_TOKEN` or `COPERNICUS_TOKEN` | Bearer token for Copernicus Data Space **Process API**. Used for `fire_burn` (NDVI burn scar), `flood` (NDWI water extent), and `drought` (canopy NDVI). Must be a CDSE access token. Without it, fire uses an Open-Meteo heat proxy; flood/drought get a Copernicus Browser deep-link |
| `IMD_API_KEY` / `OPENWEATHER_KEY` | Reserved. Weather still comes from **free Open-Meteo**. Setting the key only flips an admin “configured” boolean |
| `GITHUB_TOKEN` | Optional, raises GitHub stars badge quota |
| `NEXT_PUBLIC_GITHUB_REPO` | Badge repo (`owner/name`) |
| `BHUVAN_WMS_URL` | Optional override for the Bhuvan WMS endpoint (default `https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms`, the documented LULC host). Use if NRSC publishes a new host path |
| `BHUVAN_API_KEY` | Optional. Used only on the **server** WMS probe — never written into `context_signals` or returned to the browser |
| `BHUVAN_WMS_LAYERS` | Optional LULC layer name (default `india3` best-effort). NRSC documents state-specific names (e.g. `lulc:BR_LULC50K_1112`, see Bhuvan thematic portal) — set this to your state's layer if tiles return exceptions |

## Do not set (retired)

`HF_TOKEN`, `HF_SPACE_URL`, `NEXT_PUBLIC_HF_SPACE_ID`, `HUGGINGFACE_API_TOKEN`, `FASAL_HF_SPACE_URL`, `NEXT_PUBLIC_API_BASE_URL`. These names are not read by the hosted app. The Hugging Face Space is not called.

## Script-only (not the webapp)

`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_REGION` — `scripts/test_supabase_conn.py` only.

## What you need on Vercel if “all APIs are already attached”

Confirm these **names** exist (values stay secret):

1. Supabase trio: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
2. `GEMINI_API_KEY`
3. `REVIEWER_EMAILS`
4. `APP_ORIGIN` (production URL, e.g. `https://your-app.vercel.app`)
5. `SITE_LOCK_PASSWORD` (shared access gate for staged environments)
6. Optional: `SENTINEL_TOKEN` (CDSE Process API bearer), `GEMINI_VISION_MODEL=gemini-3.8-flash`

SQL already applied: `scripts/setup_supabase.sql`, `setup_web_schema.sql`. Private bucket `fasal-web-evidence`.
