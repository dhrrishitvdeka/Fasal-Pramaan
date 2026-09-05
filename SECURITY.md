# Security Policy & Vulnerability Reporting

## 1. Supported Versions

Security updates and vulnerability patches are actively maintained and applied to the default `main` branch.

The security scope of this repository is the **webapp only**: the Next.js dashboard (`apps/dashboard` on Vercel), Supabase (Auth, Postgres `web_*`, storage), and outbound Gemini / Open-Meteo / Copernicus / Bhuvan / Overpass calls. Legacy Hugging Face Space stubs have been retired and removed.

---

## 2. Reporting a Vulnerability

If you discover a potential security vulnerability within Fasal-Pramaan, please report it responsibly:

1. **GitHub Private Vulnerability Reporting**: Use the **Security $\rightarrow$ Report a vulnerability** tab on GitHub.
2. **Private Email Disclosure**: If private GitHub reporting is unavailable, contact the project maintainers via the contact details listed on their GitHub profile.

Please include:
- Affected page, API route, or module (e.g., `/api/claims`, `/api/vision/gate`, Supabase RLS).
- Step-by-step reproduction instructions or proof-of-concept.
- Potential impact and suggested remediation if known.

*Please do not report security vulnerabilities via public GitHub issues.*

---

## 3. Security Guidelines & Best Practices

- **Never Commit Secrets**: Ensure `.env` / `.env.local` and sensitive API keys are excluded from version control. Copy `apps/dashboard/.env.example` locally only.
- **Server-Only Credentials**: High-privilege tokens (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `SENTINEL_TOKEN`, `IMD_API_KEY`) must reside exclusively on the server and never be named `NEXT_PUBLIC_*`. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are browser-safe.
- **Row Level Security**: All `web_*` tables are locked down with RLS policies. Apply [`scripts/setup_web_schema.sql`](scripts/setup_web_schema.sql) in the Supabase SQL editor after `setup_supabase.sql`. Evidence photos live in a private storage bucket; uploads go through server routes using the service role.
- **Role Separation**: Users whose email appears in `REVIEWER_EMAILS` can access reviewer routes; everyone else is a farmer. Server-side API routes verify the Supabase JWT before any read or write — no client-trusted roles.
- **Site Lock**: On Vercel, setting `SITE_LOCK_PASSWORD` gates the entire deployment behind a password check (`/api/unlock`). Leave it empty for local development only.
- **Immediate Credential Rotation**: If credentials or keys are inadvertently exposed, revoke and rotate them immediately across all environments.

For complete architectural security specifications, see [Security Architecture](docs/security.md).
