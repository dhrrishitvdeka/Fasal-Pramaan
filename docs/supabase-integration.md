# Supabase + Hugging Face (hosted web path)

The **Vercel web app** (`apps/dashboard`) uses Supabase for `web_*` tables and a private photo bucket, and Hugging Face for leaf-disease inference. The laptop Docker stack (FastAPI, PostGIS, MinIO, local DINOv2) is unchanged and does **not** need to point at Supabase.

---

## 1. What the hosted path uses

| Piece | Role |
|---|---|
| Supabase Postgres (`web_*` tables) | Claims, images metadata, reviewer actions |
| Private bucket `fasal-web-evidence` | Real farmer photos (not public, no showcase data) |
| Hugging Face Space | `POST /api/claims` → `dhrrishitvdeka/fasal-pramaan-api` → `dhrrishitvdeka/fasal-pramaan-model` |
| Browser GPS | `navigator.geolocation` — no Maps / geocoding API |
| OpenStreetMap tiles | Reviewer map — no Mapbox / Google Maps key |
| Supabase Auth | Required JWT for farmer and reviewer. Browser key is auth-only; data goes through service-role API routes |

You do **not** need weather APIs, Gemini, FastAPI, MinIO, or Redis on Vercel.

---

## 2. One-time SQL (Supabase SQL Editor)

1. Run [`scripts/setup_supabase.sql`](../scripts/setup_supabase.sql) (PostGIS + private Docker-path bucket `fasalpramaan-evidence`).
2. Run [`scripts/setup_web_schema.sql`](../scripts/setup_web_schema.sql) (`web_plots`, `web_claims`, `web_claim_images`, `web_milestones`, `web_review_actions`, `web_profiles`, private bucket `fasal-web-evidence`).

Do **not** run Alembic / `python -m app.db.seed` against Supabase for the Vercel farmer/reviewer path. Those commands are only for the FastAPI Docker schema.

Create Auth users (Authentication → Users). Put reviewer emails in `REVIEWER_EMAILS`. Farmer and reviewer both sign in at `/login`. Anon RLS is closed — the publishable key cannot read or write `web_*` or `fasal-web-evidence`.

---

## 3. Environment variables

### Vercel (Production + Preview)

Set these in the Vercel project. Never commit values.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
HF_TOKEN=
HF_SPACE_URL=https://dhrrishitvdeka-fasal-pramaan-api.hf.space
SITE_LOCK_PASSWORD=
REVIEWER_EMAILS=
```

Leave **`NEXT_PUBLIC_API_BASE_URL` unset** on Vercel. If you set it to `http://api:8000` or a missing FastAPI host, the hosted site will try to talk to Docker and fail.

- `SUPABASE_SERVICE_ROLE_KEY` is **server-only**. Never prefix it with `NEXT_PUBLIC_`.
- `HF_TOKEN` is **server-only**. It must be allowed to call the private Space `dhrrishitvdeka/fasal-pramaan-api`. Never name it `NEXT_PUBLIC_*`.

### Local Next.js (`apps/dashboard/.env.local`, gitignored)

Same five keys as above. Template: [`apps/dashboard/.env.example`](../apps/dashboard/.env.example).

### Optional (scripts only, not Vercel)

`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_REGION` are only for `scripts/test_supabase_conn.py`.

---

## 4. Deploy the web app on Vercel

1. Connect GitHub repo `dhrrishitvdeka/Fasal-Pramaan`. Set Vercel **Root Directory** to `apps/dashboard`.
2. Paste the env vars above plus `SITE_LOCK_PASSWORD` and `REVIEWER_EMAILS`. Redeploy after saving them.
3. Farmer: `/login` → `/farmer/capture` → `POST /api/claims` (user JWT, service-role write) → private bucket + `web_claims` + HF label.
4. Reviewer: `/login` → `/review` lists claims. Review actions require a reviewer JWT.

There is no showcase or localStorage-only fallback on these routes.

---

## 5. Two backends (do not mix)

| Path | Database / storage | AI |
|---|---|---|
| **Vercel web** | Supabase `web_*` + `fasal-web-evidence` | Hugging Face |
| **Laptop Docker** | Local PostGIS + MinIO | Local DINOv2 ONNX (`crop_health_v4`) |

Docker Compose keeps `DATABASE_URL=...@db:5432/...`. Do not replace that with the Supabase pooler URL unless you are deliberately hosting FastAPI against Supabase (not required for Vercel).
