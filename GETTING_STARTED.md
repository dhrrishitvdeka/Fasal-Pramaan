# Getting Started with Fasal-Pramaan

Welcome to **Fasal-Pramaan (*फसल प्रमाण*)** — the AI-assisted crop evidence capture, trust evaluation, and verification webapp.

This guide walks you through setting up and running the Next.js webapp (`apps/dashboard`) locally against your own Supabase project, and deploying it to Vercel. There is a single deployable: the dashboard.

---

## 1. Prerequisites

- **Node.js 22** (CI pins 22; the Docker image uses `node:22-alpine`) and npm.
- **A Supabase account** (free tier works): you will create one project for auth, Postgres tables, and evidence storage.
- **Git**: for cloning the repository.
- **Optional API keys**:
  - `GEMINI_API_KEY` — vision gate, post-submit field analysis, Saathi classify, and Live voice. Default vision model is `gemini-3.8-flash`. If Vercel still has `GEMINI_VISION_MODEL=gemini-2.0-flash`, change or delete it (that model is shut down).
  - `SENTINEL_TOKEN` / `IMD_API_KEY` — optional external context signals; without them signals return `pending` (IMD rainfall still works through the open-meteo proxy with no key).

---

## 2. Clone & Install

```bash
git clone https://github.com/dhrrishitvdeka/Fasal-Pramaan.git
cd Fasal-Pramaan/apps/dashboard

# Clean, reproducible install from the lockfile
npm ci
```

(From the repository root, `npm run dev`, `npm run build`, `npm test`, etc. all proxy into `apps/dashboard` via `--prefix`.)

---

## 3. Configure Environment

```bash
# Windows (PowerShell)
Copy-Item .env.example .env.local

# macOS / Linux (Bash)
cp .env.example .env.local
```

Fill in at minimum:

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Browser-safe publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only; never expose to the client |

| `SITE_LOCK_PASSWORD` | no | Leave empty locally; set on Vercel to password-lock the site |
| `GEMINI_API_KEY` | recommended | Vision gate, field analysis, Saathi Live voice |
| `GEMINI_LIVE_MODEL` / `GEMINI_LIVE_VOICE` / `GEMINI_LIVE_SESSION_MINUTES` | optional | Saathi Live tuning (defaults provided) |
| `SENTINEL_TOKEN` / `IMD_API_KEY` | optional | External context signals |
| `REVIEWER_EMAILS` | yes | Comma-separated reviewer emails; everyone else is a farmer |

Never commit `.env.local`. Server-only keys must never be named `NEXT_PUBLIC_*`.

---

## 4. Apply the Supabase SQL

In the Supabase dashboard open **SQL Editor** and run these files in order (all in `scripts/`):

1. `scripts/setup_supabase.sql` — base project setup (extensions, storage bucket, storage policies).
2. `scripts/setup_web_schema.sql` — `web_*` tables, peril routing columns, and complete Row Level Security lockdown.

Then create Auth users for yourself (and reviewers). Emails listed in `REVIEWER_EMAILS` get the reviewer role at `/review`; everyone else is a farmer.

Optionally verify connectivity (requires the `psycopg` package: `pip install psycopg`):

```bash
python scripts/test_supabase_conn.py
```

---

## 5. Run Locally

```bash
npm run dev        # inside apps/dashboard → http://localhost:3000
```

Sign in at `/login`, then:

- **Farmer**: start at `/farmer/saathi` (Saathi intake) or go straight to `/farmer/capture`.
- **Reviewer** (email in `REVIEWER_EMAILS`): open `/review`.

Weather context uses the `api.open-meteo.com` IMD proxy with no key; Gemini vision gate and Sentinel activate automatically when their keys are present.

---

## 6. Test, Lint, Typecheck

```bash
# Inside apps/dashboard
npm run lint
npm run typecheck
npm test
npm run build

# Or from the repository root (same commands via --prefix apps/dashboard)
```

CI runs lint, typecheck, unit tests, and the production build on every push and pull request (see `.github/workflows/ci.yml`). The Playwright e2e suite is separate — run it locally with `PLAYWRIGHT_E2E=1 npm run e2e` (it boots a production server and needs the staging env described in `e2e/helpers.ts`).

---

## 6.5 Run with Docker

```bash
cd apps/dashboard
docker build -t fasal-dashboard .
docker run -p 3000:3000 --env-file .env.local fasal-dashboard
```

The image is a multi-stage build on `node:22-alpine`; the container serves the standalone Next.js output as a non-root user and exposes `GET /api/health` for the built-in healthcheck.

---

## 7. Deploy to Vercel

1. Push this repository to GitHub and import it into Vercel (**Add New… → Project**).
2. Framework preset: **Next.js**.
3. **Set Root Directory to `apps/dashboard`** (Settings → General). This is required so Vercel finds `next` in `apps/dashboard/package.json`.
4. Add the environment variables from step 3 in Project Settings → Environment Variables. Never commit their values.
5. Deploy.

After deploy, confirm:

- The site loads (site lock appears if `SITE_LOCK_PASSWORD` is set).
- A farmer can sign in and submit a claim from `/farmer/capture`; photos land in the Supabase storage bucket with `web_claims.created_by` recorded.
- The same claim id appears at `/review` only for reviewer accounts.

---

## Troubleshooting

- **Claims fail to save** — check `SUPABASE_SERVICE_ROLE_KEY` is set server-side and the SQL scripts were applied; run `python scripts/test_supabase_conn.py`.
- **Vision gate always heuristic** — `GEMINI_API_KEY` missing or invalid.
- **Context signals stuck on `pending`** — expected without `SENTINEL_TOKEN`; IMD works keyless via the open-meteo proxy.
- **New user can't see `/review`** — add their email to `REVIEWER_EMAILS` and redeploy/restart.

Details: [docs/supabase-integration.md](docs/supabase-integration.md), [docs/environment-variables.md](docs/environment-variables.md), [docs/deployment.md](docs/deployment.md).
