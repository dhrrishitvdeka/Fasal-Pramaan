# End-to-end walkthrough

This walkthrough covers the local farmer → classification → reviewer flow.
Demo accounts are pre-created; farms, crop cycles, evidence, classifications,
and review records are created during use.

## Farmer workflow

1. Start the stack with `scripts/start-portable.ps1` on Windows or
   `scripts/start-portable.sh` on macOS/Linux.
2. Open http://localhost:8085 and log in as `farmer@fasalpramaan.local` / `Demo@12345`.
3. Create a farm, plot, and crop cycle in the app or through confirmed voice
   actions.
4. Open **Capture Crop Evidence**, grant camera and location permissions, and
   capture the five required angles.
5. Select **Save & submit**. The app uploads the evidence and starts the local
   classifier automatically. If the network is unavailable, the encrypted
   draft remains queued and resumes when connectivity returns.

## Reviewer workflow

1. Open http://localhost:3000 and log in as
   `reviewer@fasalpramaan.local` / `Demo@12345`.
2. Open **Review Queue** after local classification completes.
3. Select the newly captured case and inspect its evidence, model result, and
   geo-tagged location.
4. Use **Correct** and enter a reason to demonstrate human ownership and the
   review audit trail.
5. Show the updated status and review history.

## Farmer/API workflow

Optional API checks (same farmer account):

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
3. Create or select a crop cycle, then start **Capture Crop Evidence** and show
   the five required angles, GPS policy, and automatic submission path.
4. Camera and GPS require browser permission and real device support. If the
   host has neither, use a phone on the same trusted LAN. The app does not
   create substitute images when a camera is unavailable.

## Model boundary

The current default is a local DINOv2 ViT-S/14 leaf-health assist for maize,
paddy/rice, potato, and wheat. Its A/B/C/U value is a screening bucket, not a
severity or insurance grade. Unsupported crops, weak signals, and unsuitable
images stay in human review, recapture, or physical inspection.

The default `crop_health_v4` artifact is fully local and loads without a model
download. Its internal frozen-test evidence supports this local demonstration, but
it is still labelled non-production because it lacks independent,
protocol-matched field validation. Do not hide the weakest potato-healthy
result (recall 0.25 on 16 frozen examples) when discussing limitations.
