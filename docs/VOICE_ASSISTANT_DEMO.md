# Farmer voice assistant (Fasal Saathi)

Fasal Saathi is a farmer-only, full-duplex voice feature built on the Google
Gemini Live API. The Flutter client streams 16 kHz PCM microphone audio and
plays the assistant’s 24 kHz native-audio response. Gemini may call a small,
explicit set of local app tools; it does not receive general code execution or
unrestricted navigation.

This feature is for local and demonstration use. It does not approve claims,
payouts, crop-loss decisions, diagnoses, or benefits. Classification results
remain assistive and always go through mandatory human review.

## Configure

Copy `.env.example` to `.env`, then set these **server-side** values:

```dotenv
VOICE_ASSISTANT_ENABLED=true
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
GEMINI_LIVE_VOICE=Kore
GEMINI_LIVE_SESSION_MINUTES=15
```

Never put `GEMINI_API_KEY` in Flutter build arguments, JavaScript, or source
control. The authenticated API exchanges it for a one-use ephemeral token. The
mobile/web client receives only that constrained short-lived token.

Token provisioning uses Gemini’s `v1alpha/auth_tokens` endpoint. On Flutter web
(the Docker field app), the browser opens a **same-origin** WebSocket at
`/backend/api/v1/voice/live` (nginx → API). The API container then connects to
Gemini’s constrained Live WebSocket using the ephemeral token, so the browser
does not open Google WSS directly.

Rebuild the API (and mobile if the UI changed) after enabling the feature:

```powershell
docker compose up -d --build api mobile
docker compose ps
```

Verify ephemeral-token issuance and the Live path without printing credentials:

```powershell
docker compose exec -T api python scripts/verify_gemini_live.py
```

Open `http://localhost:8085` and choose **Talk to Fasal Saathi**. After farmer
sign-in, the assistant starts and shows a live activity timeline. Browsers allow
microphone capture on `localhost`; a plain `http://LAN-IP` origin usually
blocks the mic because it is not a secure context (use HTTPS for that setup).

## Spoken demo script

Try these requests in Hindi or English:

1. “मेरे खेत बताओ” or “List my farms.”
2. “मेरे crop cycles बताओ.”
3. “इस crop cycle के लिए capture शुरू करो,” after identifying the cycle.
4. “अगली फोटो का निर्देश बताओ.”
5. “फोटो खींचो.” Repeat for the five guided angles.
6. “Observation लिखो: पत्तियों पर पीले धब्बे दिख रहे हैं.”
7. “Capture offline save करो.”
8. “Queue sync करो.” The assistant must explain the action and ask for a clear
   yes or no before upload or finalization.

## Tool and confirmation boundary

**Immediate allowlisted operations:**

- open farmer screens
- switch the app language between Hindi and English
- read the farmer’s farms, plots, crop types, growth stages, crop cycles,
  submissions, reminders, notifications, and local queue summary
- open guided capture for an exact crop-cycle identifier
- read the current capture instruction
- take the current capture angle after a clear request
- store a spoken observation on the open draft
- save a complete five-angle draft to encrypted offline storage

**Confirmation-required operations:**

- synchronize the encrypted offline queue
- finalize a specified uploaded submission for the review workflow
- create a farm, plot, or crop cycle
- update or snooze a recurring evidence reminder
- mark a notification as read or securely sign out

The action broker requires a prepare call, a later speech turn, an unexpired
pending action, and a single confirm call. It consumes the pending action before
execution so repeated model calls cannot replay it. A no/cancel request clears
the pending action.

Unsupported or invented function names fail closed. The Gemini API key never
reaches the client. Tool calls and outcomes are audit-recorded. Navigation is
limited to known farmer routes.

## Implementation map

| Area | Location |
|---|---|
| Auth, session token, Live proxy, audit | `services/api/app/api/v1/voice.py` |
| System instruction, tools, token minting | `services/api/app/services/gemini_live.py` |
| WebSocket protocol and PCM | `apps/mobile/lib/features/voice/gemini_live_transport.dart` |
| Allowlist and confirmation gate | `apps/mobile/lib/features/voice/voice_action_broker.dart` |
| Mic, playback, transcripts, session | `apps/mobile/lib/features/voice/voice_assistant_controller.dart` |
| Overlay UI | `apps/mobile/lib/features/voice/voice_assistant_overlay.dart` |
| Guided capture bridge | `apps/mobile/lib/features/voice/voice_capture_bridge.dart` |

Protocol references:

- [Ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)
- [Live API WebSocket](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket)

## Troubleshooting connection errors

1. **Server config** — `.env` must include a real key and the feature flag:
   ```dotenv
   VOICE_ASSISTANT_ENABLED=true
   GEMINI_API_KEY=your_google_ai_studio_key
   GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
   ```
   Then: `docker compose up -d --build api`.

2. **Smoke test from the API container** (does not print secrets):
   ```powershell
   docker compose exec -T api python scripts/verify_gemini_live.py
   ```
   - Fails on token create → key, billing, model access, or outbound network from the API container.
   - Fails on `setup_complete` → token or protocol mismatch with Gemini Live.
   - Succeeds → API path is healthy; check the browser/device path next.

3. **Client path (Docker web)** — the field app uses the same-origin proxy
   (`/backend/api/v1/voice/live`). The **API container** must reach Google over
   the internet. A working localhost API alone is not enough if the API host
   cannot open outbound WSS to Gemini.

4. **Secure context for microphone** — prefer `http://localhost:8085`. A plain
   `http://LAN-IP:8085` origin often cannot capture the mic.

5. **Transcript text looks glued together** — streaming tokens keep leading
   spaces; the client merges fragments with Hindi/Latin word boundaries. Hard
   refresh or rebuild the mobile image after updates to the voice UI.

## Known limitations

- Native output is buffered into a WAV turn before playback (small delay).
- Playback is half-duplex: the mic pauses while the completed audio turn plays.
- A dropped Live session is retried twice with a new one-use token; then the
  farmer taps **Try again**.
- The Docker web app receives server-generated in-app reminders. Background
  device notifications are scheduled only on native Android/iOS/macOS builds.
- Gemini Live and ephemeral tokens are preview services and must be reviewed
  again before any production rollout.
