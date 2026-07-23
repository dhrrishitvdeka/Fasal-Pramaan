# FasalPramaan Command Centre

The Command Centre is the reviewer-facing Next.js dashboard used in the presentation. It shows operational overview, map markers, review cases, alerts, health, and audit-oriented detail.

## Presentation use

1. From the repository root, start the stack:
   ```powershell
   Copy-Item .env.example .env
   powershell -ExecutionPolicy Bypass -File .\scripts\start-portable.ps1
   ```
   Or: `docker compose up -d --build`
2. Open http://localhost:3000.
3. Sign in as `reviewer@fasalpramaan.local` / `Demo@12345`.
4. Show Overview → Map → Review Queue → case detail → human correction with reason.

In Docker, the browser calls **`/backend`** (same origin). Next.js rewrites that path to the API container (`INTERNAL_API_BASE_URL=http://api:8000`). Evidence image previews use MinIO presigned URLs; CSP allows `NEXT_PUBLIC_MEDIA_ORIGIN` (default `http://localhost:9000`).

The dashboard holds access/refresh credentials in memory during the current session and clears the session on failed refresh/401. It is a local presentation client, not a production BFF/session architecture.

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

## User-facing boundaries

- Reviewers make or correct final assessments; the AI result is non-production assistance.
- Default model grades (A/B/C/U) do not include severity or affected area — use **Correct & verify**, not blind Accept, when those fields are empty.
- Seed map locations and cases are synthetic.
- Do not demonstrate admin capabilities to an audience unless they are necessary to the story.

See the root [presentation guide](../../GETTING_STARTED.md) and [architecture](../../docs/architecture.md).
