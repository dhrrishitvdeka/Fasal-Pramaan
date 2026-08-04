# Changelog

All notable changes will be documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Hindi/English Fasal Saathi transcript bubbles no longer glue words together
  (preserve stream token spacing; Devanagari word-boundary merge).
- Field-app Docker build re-declares `API_BASE_URL` and gates the image on
  `flutter analyze` + `flutter test`.
- Web secure-storage fallback when browser crypto is unavailable over plain HTTP.
- Makefile migrate/seed targets no longer reference a missing Compose profile;
  `beat` is started with the full stack.

### Changed

- Service and app package versions aligned to **1.1.0**.
- Documentation refreshed to match proxy-based voice Live path, evidence
  reminder routes, empty operational seed, and removed broken doc links.

### Added

- Voice system instruction asks for short, clearly spaced Hindi/English replies.

## [1.1.0] — 2026-08-04

### Added

- **Fasal Saathi** Gemini Live Hindi/English voice assistant for farmers.
- Same-origin Live WebSocket proxy (`/api/v1/voice/live`) so the browser does
  not open Google WSS directly.
- Allowlisted voice tools (navigation, farms/plots/cycles, capture, reminders)
  with explicit spoken confirmation for sensitive writes, sync, and finalize.
- Streaming transcript merge so assistant replies show full sentences, not only
  the last token fragment.
- Mic PCM resample toward 16 kHz, session refresh before voice start, and
  safer crop-cycle confirmation (UUID checks + API error handling).
- Voice panel UI polish with open/close animation (no “demo” badge clutter).
- Recurring geo-tagged evidence reminders.
- Automatic local upload, classification, and reviewer-queue workflow.
- Clean operational-data reset that preserves demo accounts and catalogs.

### Fixed

- Seed bootstrap no longer inserts users with null `password_hash` (CI
  `api-and-model` seed crash).
- Voice connect timeouts from pre-accept Gemini token minting.
- Expired JWT 401s when starting voice without a session check.
- Uncaught Dio errors on voice-confirmed crop-cycle creation (422).

### Changed

- Local bootstrap contains no farms, submissions, images, predictions, or
  reviewer records.
- Gemini token provisioning retries transient upstream failures.
- Field-app nginx no longer immutably caches Flutter entry JS for a week.
- Repository licensing and contribution files are aligned for open-source use.

### Notes

- Model output remains assistive screening only; human review is mandatory.
- Voice assistant is a local feature requiring `VOICE_ASSISTANT_ENABLED` and a
  server-side `GEMINI_API_KEY`.
