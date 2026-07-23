# Team contribution notes

The immediate goal is a stable, honest presentation demo. Keep changes focused, reproducible, and clearly labelled when they affect the demo story.

## Before changing the demo

1. Read [GETTING_STARTED.md](./GETTING_STARTED.md) and rehearse the presentation flow.
2. Do not add real farmer data, credentials, or production service URLs.
3. Preserve the non-production AI disclaimer and mandatory human-review workflow.
4. Update the relevant documentation when a screen, route, environment variable, or demo step changes.

## Suggested branch names

`docs/...`, `fix/...`, `feat/...`, or `chore/...`.

## Minimum verification

```powershell
docker compose run --rm api pytest -q
docker compose run --rm ai pytest -q

cd apps\dashboard
npm run lint
npm run typecheck
npm test
```

Run Flutter checks too when changing mobile behavior and Flutter is available.

## Repository structure

| Path | Responsibility |
|---|---|
| `apps/mobile` | Evidence capture and offline sync |
| `apps/dashboard` | Reviewer Command Centre |
| `services/api` | API, auth, database, worker tasks |
| `services/ai` | Assistive AI adapters and evaluation |
| `docs` | Presentation and technical documentation |
| `scripts/fp.ps1` | Local presentation helper |

Never commit `.env`, secrets, real evidence, or private datasets. Use synthetic seed data only.
