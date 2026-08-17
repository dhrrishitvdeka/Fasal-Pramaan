# Local laptop stack

This folder is how you run the **full Docker system** (API, AI, Postgres, MinIO, mobile, dashboard rewrite). It is separate from the Vercel webapp.

The Vercel app lives **outside** this folder: `../apps/dashboard`. GitHub → Vercel builds that Next.js app. Do not point Vercel at `local/`.

## Start everything locally

From this folder:

```powershell
.\start.ps1
```

```bash
sh start.sh
```

Or from the repo root (same stack):

```powershell
Copy-Item local\.env .env -ErrorAction SilentlyContinue
powershell -ExecutionPolicy Bypass -File .\scripts\start-portable.ps1
```

## Files

| Path | Role |
|---|---|
| `local/.env` | Your secrets (gitignored). Copied to repo-root `.env` for Compose. |
| `../.env.example` | Placeholder template with no secrets. |
| `../docker-compose.yml` | Compose topology (left at repo root so CI paths stay valid). |
| `../services/api` | FastAPI + evidence engine |
| `../services/ai` | Local ONNX models |
| `../apps/mobile` | Flutter field app |
| `../apps/dashboard` | Next.js farmer + reviewer webapp (Vercel) |

## Cloud vs Docker database

- Docker Compose keeps using local PostGIS (`DATABASE_URL=...@db:5432/...`).
- The webapp on Vercel uses `NEXT_PUBLIC_SUPABASE_*` in `apps/dashboard/.env.local` (and the same keys in Vercel project settings).
- `SUPABASE_DB_PASSWORD` in `.env` is only for `python scripts/test_supabase_conn.py`, not for the Docker Postgres container.
