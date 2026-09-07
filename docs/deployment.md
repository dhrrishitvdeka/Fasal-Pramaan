# Deployment

## Topology

Vercel (Next.js 16 App Router, Root Directory **`apps/dashboard`**) → Supabase (Auth, Postgres `web_*`, private storage) → Google Gemini (`gemini-3.8-flash` vision + `gemini-3.1-flash-live-preview` Live voice). Optional Copernicus Process API for fire burn scars. Weather is Open-Meteo (no key).

There is **no Hugging Face Space** to deploy.

## Vercel

1. Root Directory = `apps/dashboard`.
2. Set env vars from [environment-variables.md](environment-variables.md).
3. Ensure `GEMINI_VISION_MODEL` is `gemini-3.8-flash` (canonical default, with 3.7/3.5/2.5 fallbacks) and `GEMINI_LIVE_MODEL` is `gemini-3.1-flash-live-preview`.
4. Enable production rate limiting: set `ENABLE_RATE_LIMIT=true` to protect public API surfaces.
5. Long AI routes need `maxDuration: 60` (Pro plan; Hobby caps ~10s). Function keys in `apps/dashboard/vercel.json` are `app/api/...` paths.
6. Redeploy after saving env.

## Docker

`NEXT_PUBLIC_*` values bake into the client bundle at `next build`, so pass
them as build args (never rely on runtime `--env-file` for them):

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
  -t fasal-pramaan apps/dashboard
```

`GET /api/health` is excluded from the site lock so `HEALTHCHECK` stays green.

## Supabase

Run in the SQL editor, in order:

1. `scripts/setup_supabase.sql`
2. `scripts/setup_web_schema.sql`

Create/keep the private bucket `fasal-web-evidence` (JPEG/PNG/WebP, 15 MB). Read access requires server-signed temporary URLs; public bucket listing and unauthenticated downloads are prohibited.

## Smoke check after deploy

- `/unlock` if `SITE_LOCK_PASSWORD` is set
- Sign in as farmer (e.g. `farmer@fasalpramaan.com`) → Saathi → capture → submit
- Sign in as an email in `REVIEWER_EMAILS` (e.g. `reviewer@fasalpramaan.com`) → `/review` → open the claim → Gemini write-up visible
- `/api/health` returns `{ "ok": true, "status": "ok" }` only (no secrets)

## Optional Sentinel

`SENTINEL_TOKEN` must be a Copernicus Data Space Process API **Bearer access token**. Client id/secret alone will 401. Fire claims without a working token still submit; the card shows the heat proxy + Copernicus Browser link.
