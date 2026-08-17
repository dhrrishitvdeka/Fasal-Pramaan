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
| Supabase Auth | Reviewer `/login` (`signInWithPassword`). Farmer `/farmer/*` is public |

You do **not** need weather APIs, Gemini, FastAPI, MinIO, or Redis on Vercel.

---

## 2. One-time SQL (Supabase SQL Editor)

1. Run [`scripts/setup_supabase.sql`](../scripts/setup_supabase.sql) (PostGIS + private Docker-path bucket `fasalpramaan-evidence`).
2. Run [`scripts/setup_web_schema.sql`](../scripts/setup_web_schema.sql) (`web_plots`, `web_claims`, `web_claim_images`, `web_milestones`, `web_review_actions`, `web_profiles`, private bucket `fasal-web-evidence`).

Do **not** run Alembic / `python -m app.db.seed` against Supabase for the Vercel farmer/reviewer path. Those commands are only for the FastAPI Docker schema.

Create at least one Auth user (Authentication → Users) if you want reviewer login. Farmer capture works without a login.

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

1. Connect GitHub repo `dhrrishitvdeka/Fasal-Pramaan`. Keep the **repository root** as the project root — [`vercel.json`](../vercel.json) installs and builds `apps/dashboard`.
2. Paste the five env vars above. Redeploy after saving them.
3. Farmer: `/farmer/capture` → `POST /api/claims` writes the private bucket + `web_claims` + HF label.
4. Reviewer: `/review` lists the same claim ids. `/login` needs a Supabase Auth user.

There is no showcase or localStorage-only fallback on these routes.

---

## 5. Two backends (do not mix)

| Path | Database / storage | AI |
|---|---|---|
| **Vercel web** | Supabase `web_*` + `fasal-web-evidence` | Hugging Face |
| **Laptop Docker** | Local PostGIS + MinIO | Local DINOv2 ONNX (`crop_health_v4`) |

Docker Compose keeps `DATABASE_URL=...@db:5432/...`. Do not replace that with the Supabase pooler URL unless you are deliberately hosting FastAPI against Supabase (not required for Vercel).
