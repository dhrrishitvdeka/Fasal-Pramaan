# Deployment

## Topology

Vercel (Next.js, Root Directory **`apps/dashboard`**) → Supabase (Auth, Postgres `web_*`, private storage) → Google Gemini (vision + Live). Optional Copernicus Process API for fire burn scars. Weather is Open-Meteo (no key).

There is **no Hugging Face Space** to deploy.

## Vercel

1. Root Directory = `apps/dashboard`.
2. Set env vars from [environment-variables.md](environment-variables.md).
3. If `GEMINI_VISION_MODEL` is `gemini-2.0-flash`, change it to `gemini-3.8-flash`.
4. Redeploy after saving env.

## Supabase

Run in the SQL editor, in order:

1. `scripts/setup_supabase.sql`
2. `scripts/setup_web_schema.sql`

Create/keep the private bucket `fasal-web-evidence` (JPEG/PNG/WebP, 15 MB).

## Smoke check after deploy

- `/unlock` if `SITE_LOCK_PASSWORD` is set
- Sign in as farmer → Saathi → capture → submit
- Sign in as an email in `REVIEWER_EMAILS` → `/review` → open the claim → Gemini write-up visible
- `/health` returns `{ "ok": true, "status": "ok" }` only (no secrets)

## Optional Sentinel

`SENTINEL_TOKEN` must be a Copernicus Data Space Process API **Bearer access token**. Client id/secret alone will 401. Fire claims without a working token still submit; the card shows the heat proxy + Copernicus Browser link.
