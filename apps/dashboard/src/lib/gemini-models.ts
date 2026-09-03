/**
 * Canonical Gemini model IDs for the hosted MVP.
 * Source: https://ai.google.dev/gemini-api/docs/models (2026-09-02).
 *
 * gemini-2.0-flash is shut down (2026-06-01). Do not use it.
 * Vision / classify: gemini-3.8-flash (stable GA Flash).
 * Live voice: gemini-3.1-flash-live-preview (Live API).
 */

export const GEMINI_VISION_MODEL_DEFAULT = "gemini-3.8-flash";
export const GEMINI_LIVE_MODEL_DEFAULT = "gemini-3.1-flash-live-preview";
export const GEMINI_LIVE_VOICE_DEFAULT = "Kore";

export function resolveGeminiVisionModel(): string {
  const raw =
    process.env.GEMINI_VISION_MODEL ||
    process.env.GEMINI_MODEL ||
    GEMINI_VISION_MODEL_DEFAULT;
  return String(raw).replace(/^models\//, "").trim() || GEMINI_VISION_MODEL_DEFAULT;
}

export function resolveGeminiLiveModel(): string {
  const raw = process.env.GEMINI_LIVE_MODEL || GEMINI_LIVE_MODEL_DEFAULT;
  return String(raw).replace(/^models\//, "").trim() || GEMINI_LIVE_MODEL_DEFAULT;
}

export function resolveGeminiLiveVoice(): string {
  return (process.env.GEMINI_LIVE_VOICE || GEMINI_LIVE_VOICE_DEFAULT).trim() || GEMINI_LIVE_VOICE_DEFAULT;
}

export function resolveGeminiApiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
}
