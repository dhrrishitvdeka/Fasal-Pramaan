# Farmer voice assistant demo

Fasal Saathi is a farmer-only, full-duplex voice demonstration built on the
Google Gemini Live API. The Flutter client streams 16 kHz PCM microphone audio
directly to Gemini and plays its 24 kHz native-audio response. Gemini can call a
small, explicit set of local app tools; it does not receive general code
execution or unrestricted navigation.

This is a demonstration feature. It does not approve claims, payouts, crop-loss
decisions, diagnoses, or benefits. Existing assessment results remain assistive
and continue through mandatory human review.

## Configure

Copy `.env.example` to `.env`, then set these server-side values:

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

Token provisioning uses Gemini's `v1alpha/auth_tokens` endpoint. The client
then connects with that token to the constrained `v1beta` Live WebSocket
endpoint required by Google's raw WebSocket protocol.

Start or rebuild the local demo:

```powershell
docker compose up -d --build api mobile
docker compose ps
```

Verify real ephemeral-token issuance and the constrained audio WebSocket
without printing either credential or response content:

```powershell
docker compose exec -T api python scripts/verify_gemini_live.py
```

Open `http://localhost:8085` and choose **Talk to Fasal Saathi** on the first
screen. After farmer sign-in, the assistant starts automatically and shows a
live activity timeline over the app. Browsers permit microphone capture on `localhost`; a
LAN IP generally requires HTTPS because microphone access is a secure-context
feature.

## Demonstration script

Try these spoken requests in Hindi or English:

1. “मेरे खेत बताओ” or “List my farms.”
2. “मेरे crop cycles बताओ.”
3. “इस crop cycle के लिए capture शुरू करो,” after identifying the desired
   cycle from the assistant.
4. “अगली फोटो का निर्देश बताओ.”
5. “फोटो खींचो.” Repeat for the five guided angles.
6. “Observation लिखो: पत्तियों पर पीले धब्बे दिख रहे हैं.”
7. “Capture offline save करो.”
8. “Queue sync करो.” The assistant must explain the action and ask for a clear
   yes or no before it can upload/finalize anything.

## Tool and confirmation boundary

Immediate allowlisted operations:

- open farmer screens;
- switch the visible app between Hindi and English;
- read the authenticated farmer's farms, plots, crop types, growth stages,
  crop cycles, submissions, reminders, notifications, and local queue summary;
- open guided capture for an exact crop-cycle identifier;
- read the current capture instruction;
- take the current capture angle after a clear farmer request;
- store a spoken observation on the open draft;
- save a complete five-angle draft to encrypted offline storage.

Confirmation-required operations:

- synchronize the encrypted offline queue;
- finalize a specified uploaded submission for the existing review workflow.
- create a farm, plot, or crop cycle;
- update or snooze a recurring evidence reminder;
- mark a notification as read or securely sign out.

The action broker requires a prepare call, a later speech turn, an unexpired
pending action, and a single confirm call. It consumes the pending action before
execution, so repeated model calls cannot replay it. A no/cancel request clears
the pending action.

Unsupported or invented function names fail closed. The Gemini API key is never
sent to the client, tool calls and outcomes are audit-recorded, and navigation
is restricted to known farmer routes.

## Implementation map

- `services/api/app/api/v1/voice.py`: farmer authentication, token endpoint,
  voice-action audit endpoint.
- `services/api/app/services/gemini_live.py`: server-side Gemini constraints,
  system instruction, one-use token provisioning, and tool declarations.
- `apps/mobile/lib/features/voice/gemini_live_transport.dart`: raw WebSocket
  protocol and PCM audio messages.
- `apps/mobile/lib/features/voice/voice_action_broker.dart`: allowlist,
  confirmation gate, action execution, and safe result shaping.
- `apps/mobile/lib/features/voice/voice_assistant_controller.dart`: microphone,
  audio playback, transcripts, tool dispatch, and session lifecycle.
- `apps/mobile/lib/features/voice/voice_assistant_overlay.dart`: global farmer
  microphone UI.
- `apps/mobile/lib/features/voice/voice_capture_bridge.dart`: mounted guided
  capture controls.
- `apps/mobile/lib/features/reminders/evidence_reminders_screen.dart`: recurring
  4–5 photo plan controls and capture deep links.
- `apps/mobile/lib/services/evidence_notification_service.dart`: native local
  notification scheduling mirrored from server-owned plans.

Protocol choices follow Google's current documentation for
[ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)
and the [raw Live API WebSocket protocol](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket).

## Troubleshooting Fasal Saathi connection errors

If the overlay shows a connection error (including a former raw
`TimeoutException after 0:00:15` style message), work top-down:

1. **Server config** — `.env` must include a real key and the feature flag:
   ```dotenv
   VOICE_ASSISTANT_ENABLED=true
   GEMINI_API_KEY=your_google_ai_studio_key
   GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview
   ```
   Then rebuild/restart API: `docker compose up -d --build api`.

2. **Smoke test from the API container** (does not print secrets):
   ```powershell
   docker compose exec -T api python scripts/verify_gemini_live.py
   ```
   - Fails on token create → key, billing, model access, or network from API.
   - Fails on `setup_complete` → token/protocol mismatch with Gemini Live.
   - Succeeds → API path is healthy; check the browser/device path next.

3. **Client path** — the Flutter app opens
   `wss://generativelanguage.googleapis.com/...BidiGenerateContentConstrained`
   **directly**. The device or browser must reach Google over the internet;
   a working localhost API is not enough if outbound WSS is blocked.

4. **Secure context for microphone** — prefer `http://localhost:8085`. A plain
   `http://LAN-IP:8085` origin often cannot capture the mic.

5. **UI copy after the transport hardening** — socket open vs session setup
   failures produce distinct messages (network/firewall vs Gemini session
   confirmation). Socket close or Gemini `error` frames fail fast instead of
   waiting a full 15–20s timeout.

## Known demonstration limitations

- Native output is buffered into a WAV turn before playback. This avoids
  platform-specific raw-audio sinks but adds a small response delay.
- Playback is half-duplex: microphone streaming pauses while the assistant's
  completed audio turn plays, then resumes.
- A dropped Live session is retried twice with a new one-use token. After that,
  the farmer must tap **Try again** so failures remain visible and bounded.
- The Docker web app receives server-generated in-app reminders. Background
  device notifications are scheduled only by native Android/iOS/macOS builds.
- Gemini Live and ephemeral tokens are preview services and must be re-reviewed
  before any production rollout.
