# Contributing to Fasal-Pramaan

Thank you for contributing to Fasal-Pramaan. We welcome community contributions, architectural improvements, and bug fixes.

---

## 1. Development Workflow

1. **Review Technical Specs**: Read [System Architecture](docs/architecture.md), [Evidence Evaluation](docs/evidence-evaluation.md), and [API Reference](docs/api.md).
2. **Branch Naming**: Use descriptive branch prefixes:
   - `feat/feature-name` (New capability or enhancement)
   - `fix/bug-description` (Bug or defect fix)
   - `docs/doc-update` (Documentation improvements)
   - `perf/optimization` (Performance enhancements)
3. **Security Standards**: Never commit `.env`, `.env.local`, private keys, secrets, or real personal data. Server-only keys must never be named `NEXT_PUBLIC_*`.

The webapp lives in `apps/dashboard` — that is the single deployable (Vercel Root Directory = `apps/dashboard`). Keep all app changes inside it.

---

## 2. Automated Quality Assurance Checks

All pull requests must pass the automated verification suite (CI runs the same steps on Node 22 with a working directory of `apps/dashboard`):

```bash
cd apps/dashboard
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Or equivalently from the repository root (scripts proxy via `--prefix apps/dashboard`):

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

If your change touches Supabase schema or RLS, update the SQL in `scripts/` (`setup_supabase.sql`, `setup_web_schema.sql`, `setup_web_schema_peril.sql`, `lock_web_rls.sql`) rather than editing tables ad hoc, and document the migration path in the PR.

---

## 3. Pull Request Guidelines

- **Clear Description**: Summarize the architectural motivation, changes made, and verification steps executed.
- **Atomic Commits**: Keep unrelated refactors separate from functional feature commits.
- **Code of Conduct**: All contributors are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## 4. Local E2E Tests

Playwright specs live in `apps/dashboard/e2e` and target `http://localhost:3000`. The dev webServer is **not** booted by default (so a plain `npm run e2e` against an already-running server never spawns a second Next.js process). To run the full suite with an auto-started server:

```bash
cd apps/dashboard
PLAYWRIGHT_E2E=1 npm run e2e
```

Use `npm run e2e:headed` instead of `npm run e2e` to watch the browsers while tests run (same env vars).

Requirements:

- **`PLAYWRIGHT_E2E=1`** — explicitly opts into booting the dev webServer via Playwright's `webServer` config (`playwright.config.ts`). Without it, tests assume something is already serving port 3000.
- **`E2E_SUPABASE_URL`** — optional but recommended. When set (optionally with `E2E_SUPABASE_ANON_KEY`, defaulting to `e2e-anon-key`), the spawned server points at that Supabase URL so pages exercise the "Supabase configured" code paths; all network calls are mocked via `page.route` in the specs themselves.
- First run needs browsers installed: `npx playwright install chromium`.

PowerShell users: `$env:PLAYWRIGHT_E2E="1"; npm run e2e`.
