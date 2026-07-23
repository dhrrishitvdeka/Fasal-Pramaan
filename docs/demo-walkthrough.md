# Demonstration walkthrough

This walkthrough is the hands-on companion to the speaker script. It uses seeded synthetic data and can be rehearsed without a mobile device.

## Reviewer workflow

1. Start the stack with `scripts/start-portable.ps1` on Windows or
   `scripts/start-portable.sh` on macOS/Linux.
2. Open http://localhost:3000 and log in as `reviewer@fasalpramaan.local` / `Demo@12345`.
3. Open **Overview** and explain that it summarizes the case workload.
4. Open **Map** and explain that the locations are synthetic presentation markers.
5. Open **Review Queue**, select a seeded case, and inspect its evidence and AI result.
6. Use **Correct** and enter a reason. This demonstrates human ownership and auditability.
7. Show the updated status and audit/review history.

Seeded case predictions are synthetic `mock` workflow fixtures. They are for
demonstrating reviewer ownership and auditability, not v14 model accuracy.

## Farmer/API workflow

Use this only if you need a second perspective in the presentation:

```powershell
$login = Invoke-RestMethod -Method POST http://localhost:8000/api/v1/auth/login `
  -ContentType application/json `
  -Body '{"email":"farmer@fasalpramaan.local","password":"Demo@12345"}'
$headers = @{ Authorization = "Bearer $($login.access_token)" }

Invoke-RestMethod http://localhost:8000/api/v1/farms -Headers $headers
Invoke-RestMethod http://localhost:8000/api/v1/crop-cycles -Headers $headers
Invoke-RestMethod http://localhost:8000/api/v1/submissions -Headers $headers
```

Explain that the real mobile flow creates an idempotent draft, uploads signed evidence, confirms server verification, then finalizes to the worker queue.

## Farmer/field web app

The field app is included in Docker; no Flutter installation is required:

1. Open http://localhost:8085.
2. Sign in as `farmer@fasalpramaan.local` / `Demo@12345`.
3. Start **Capture Crop Evidence** and show the active crop cycle, three
   required angles, GPS policy, and offline-save path.
4. Camera and GPS require browser permission and real device support. If the
   presentation laptop has neither, stop at the guided capture screen and use
   `scripts/verify-e2e.ps1` for the server/model path.

## Model boundary

The current default is a local DINOv2 ViT-S/14 leaf-health assist for maize,
paddy/rice, potato, and wheat. Its A/B/C/U value is a screening bucket, not a
severity or insurance grade. Unsupported crops, weak signals, and unsuitable
images stay in human review, recapture, or physical inspection.

The default `crop_health_v4` artifact is fully local and loads without a model
download. Its internal frozen-test evidence is strong enough for this MVP, but
it is still labelled non-production because it lacks independent,
protocol-matched field validation. Do not hide the weakest potato-healthy
result (recall 0.25 on 16 frozen examples) when discussing limitations.
