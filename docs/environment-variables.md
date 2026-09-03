# Environment variables

Copy `apps/dashboard/.env.example` to `apps/dashboard/.env.local`. On Vercel, set the same names on the project (Root Directory = `apps/dashboard`).

**Never** prefix server secrets with `NEXT_PUBLIC_`.

## Required for a working demo

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
| `GEMINI_VISION_MODEL` | Default **`gemini-3.8-flash`**. **Do not set `gemini-2.0-flash`** — that model is shut down |
| `GEMINI_LIVE_MODEL` | Default **`gemini-3.1-flash-live-preview`** |
| `GEMINI_LIVE_VOICE` | Default `Kore` |
| `GEMINI_LIVE_SESSION_MINUTES` | Default `15` |

If you already set `GEMINI_VISION_MODEL=gemini-2.0-flash` on Vercel, **change it to `gemini-3.8-flash` or delete the variable** so the code default applies.

## Optional context signals

| Variable | What it actually does |
|---|---|
| `SENTINEL_TOKEN` or `COPERNICUS_TOKEN` | Bearer token for Copernicus Data Space **Process API** (`POST https://sh.dataspace.copernicus.eu/api/v1/process`). Used only for `fire_burn` claims with GPS. Must be a CDSE access token, not a random API key. Without it, fire claims use an Open-Meteo heat proxy and a Copernicus Browser deep-link |
| `IMD_API_KEY` / `OPENWEATHER_KEY` | Reserved. Weather still comes from **free Open-Meteo**. Setting the key only flips an admin “configured” boolean |
| `GITHUB_TOKEN` | Optional, raises GitHub stars badge quota |
| `NEXT_PUBLIC_GITHUB_REPO` | Badge repo (`owner/name`) |

## Do not set (retired)

`HF_TOKEN`, `HF_SPACE_URL`, `NEXT_PUBLIC_HF_SPACE_ID`, `HUGGINGFACE_API_TOKEN`, `FASAL_HF_SPACE_URL`, `NEXT_PUBLIC_API_BASE_URL` (leave empty). The Hugging Face Space is not called.

## Script-only (not the webapp)

`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_REGION` — `scripts/test_supabase_conn.py` only.

## What you need on Vercel if “all APIs are already attached”

Confirm these **names** exist (values stay secret):

1. Supabase trio: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
2. `GEMINI_API_KEY`
3. `REVIEWER_EMAILS`
4. `SITE_LOCK_PASSWORD` (for a public demo URL)
5. Optional: `SENTINEL_TOKEN` (CDSE Process API bearer), `GEMINI_VISION_MODEL=gemini-3.8-flash`

SQL already applied: `scripts/setup_supabase.sql`, `setup_web_schema.sql`, `setup_web_schema_peril.sql`, `lock_web_rls.sql`. Private bucket `fasal-web-evidence`.
