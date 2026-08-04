# FasalPramaan Command Centre

Reviewer-facing Next.js dashboard for operational overview, map markers, review
cases, alerts, health, and audit-oriented case detail.

## Docker use

1. From the repository root, start the stack:
   ```powershell
   Copy-Item .env.example .env
   powershell -ExecutionPolicy Bypass -File .\scripts\start-portable.ps1
   ```
   Or: `docker compose up -d --build`
2. Open http://localhost:3000.
3. Sign in as `reviewer@fasalpramaan.local` / `Demo@12345`.
4. Work through Overview → Map → Review Queue → case detail → human correction
   with a reason.

In Docker, the browser calls **`/backend`** (same origin). Next.js rewrites that
path to the API container (`INTERNAL_API_BASE_URL=http://api:8000`). Evidence
image previews use MinIO presigned URLs; CSP allows `NEXT_PUBLIC_MEDIA_ORIGIN`
(default `http://localhost:9000`).

The dashboard holds access/refresh credentials in memory for the current browser
session and clears them on failed refresh/401. This is a local SPA client, not a
production BFF/session architecture.

## Local development

```powershell
cd apps\dashboard
npm ci
# Point at a running API (host-mapped compose API):
$env:NEXT_PUBLIC_API_BASE_URL="http://localhost:8000"
$env:NEXT_PUBLIC_MEDIA_ORIGIN="http://localhost:9000"
npm run dev
```

Useful checks:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

| Variable | Docker default | Local `npm run dev` typical value |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `/backend` | `http://localhost:8000` |
| `INTERNAL_API_BASE_URL` | `http://api:8000` | unused when the browser talks to the API directly |
| `NEXT_PUBLIC_MEDIA_ORIGIN` | `http://localhost:9000` (or `PUBLIC_HOST`) | same |

## Product boundaries

- Reviewers make or correct final assessments; the model result is non-production assistance.
- Default grades (A/B/C/U) do not include severity or affected area — use
  **Correct & verify**, not blind Accept, when those fields are empty.
- Seed creates accounts and catalogs only; farms and cases are created during use.

See [GETTING_STARTED.md](../../GETTING_STARTED.md) and
[architecture](../../docs/architecture.md).
