# Fasal-Pramaan documentation

Hosted stack: **Next.js (`apps/dashboard`) on Vercel + Supabase + Google Gemini**. There is no Hugging Face Space on the live path.

## How a claim actually runs

1. Farmer signs in (Supabase Auth).
2. Fasal Saathi classifies peril (heuristic, then Gemini if `GEMINI_API_KEY` is set) and opens capture.
3. Viewfinder: on-device OpenCV (canopy colour, texture, screen/moiré). Frames stay on the phone.
4. After shutter: `POST /api/vision/gate` (Gemini authenticity).
5. Submit: `POST /api/claims` stores SHA-256 stills, assembles weather/satellite context, then Gemini writes the reviewer analysis.
6. Reviewer sees the Gemini write-up on `/review/[id]` and decides. AI never pays out.

Saathi Live is **audio-only** (`gemini-3.1-flash-live-preview`). Gemini vision / classify defaults to **`gemini-3.8-flash`**.

## Guides

| Doc | What it is |
|---|---|
| [architecture.md](architecture.md) | Topology and claim pipeline |
| [api.md](api.md) | HTTP routes |
| [evidence-evaluation.md](evidence-evaluation.md) | 4-pillar scores (quality / coverage / GPS / SHA-256) |
| [adaptive-recapture.md](adaptive-recapture.md) | Recapture after reviewer request |
| [environment-variables.md](environment-variables.md) | Vercel / `.env.local` keys |
| [deployment.md](deployment.md) | Vercel Root Directory = `apps/dashboard` |
| [supabase-integration.md](supabase-integration.md) | `web_*` tables and private evidence bucket |
| [security.md](security.md) | Auth, RLS, secrets |
| [known-limitations.md](known-limitations.md) | Honest demo limits |
| [demo-walkthrough.md](demo-walkthrough.md) | Stage script |
| [VOICE_ASSISTANT_DEMO.md](VOICE_ASSISTANT_DEMO.md) | Saathi Live (mic + speaker) |
| [GETTING_STARTED.md](../GETTING_STARTED.md) | Local run |

Perils and required angles live in `apps/dashboard/src/lib/claim-routing.ts`.
