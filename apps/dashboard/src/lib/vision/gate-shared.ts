/**
 * Shared Gemini vision gate helpers.
 * Extracted from src/app/api/vision/gate/route.ts so both the API route
 * and the server-side claim pipeline can reuse the same heuristic + Gemini prompt.
 */

export const ALLOWED_GATE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export type GateResult = {
  usable: boolean;
  reason: string;
  crop_detected: string | null;
  warnings: string[];
  confidence: number;
  raw?: unknown;
  fallback?: boolean;
};

export function heuristicGate(dataUrl: string, expectedCrop?: string, peril?: string): GateResult {
  if (!dataUrl.startsWith("data:image/")) return { usable: false, reason: "not_image", crop_detected: null, warnings: ["not_image"], confidence: 0, fallback: true };
  const approxBytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
  if (approxBytes < 8000) return { usable: false, reason: "too_small_or_blank", crop_detected: null, warnings: ["too_small"], confidence: 0.1, fallback: true };
  // fire_burn can have low green — don't require crop check strictly
  if (peril === "fire_burn") return { usable: true, reason: "ok", crop_detected: expectedCrop || "unknown", warnings: [], confidence: 0.7, fallback: true };
  // naive crop check: if expectedCrop provided, assume gate passes (real check needs CV/Gemini)
  if (expectedCrop) return { usable: true, reason: "ok", crop_detected: expectedCrop, warnings: [], confidence: 0.62, fallback: true };
  return { usable: true, reason: "ok", crop_detected: "unknown", warnings: [], confidence: 0.6, fallback: true };
}

export async function geminiGate(
  imageDataUrl: string,
  angleType: string,
  expectedCrop: string | undefined,
  peril: string | undefined,
): Promise<GateResult | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) return null;
  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  if (!ALLOWED_GATE_TYPES.has(mime.toLowerCase())) return null;

  const cropInstruction = expectedCrop
    ? `Expected crop is ${expectedCrop}. If no crop is visible or a different crop is shown, mark not_usable.`
    : "Detect if any crop is visible.";
  const perilNote =
    peril === "fire_burn"
      ? "Fire/burn claims may show charred field with little green — do not reject for low green."
      : "Require clear crop presence.";

  const prompt = `You are a crop evidence gate for PMFBY insurance. Decide if this field photo is usable.

Check: ${cropInstruction} ${perilNote}
Also reject if: AI-generated/synthetic, screenshot, meme, too dark/blurry to see crop, no field at all, or angle is completely wrong (e.g., indoor).

Return ONLY JSON with keys:
{"usable": true|false, "reason": "ok"|"not_crop"|"wrong_crop"|"ai_generated"|"too_dark"|"too_blurry"|"no_field"|"unusable", "crop_detected": string|null, "warnings": string[], "confidence": 0.0-1.0 }

Angle: ${angleType}, Peril: ${peril || "normal"}`;

  const model = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_LIVE_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: b64 } }],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 512, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    if (!res.ok) return null;
    const json = JSON.parse(text) as any;
    const rawOut = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!rawOut) return null;
    const outText = rawOut.replace(/```(?:json)?\s*/gi, "").replace(/```\s*$/gi, "").trim();
    const parsed = JSON.parse(outText) as {
      usable?: boolean;
      reason?: string;
      crop_detected?: string | null;
      warnings?: string[];
      confidence?: number;
    };
    const usable = Boolean(parsed.usable);
    const reason = String(parsed.reason || (usable ? "ok" : "unusable"));
    // enforce crop-only if expectedCrop mismatch and not fire
    if (expectedCrop && parsed.crop_detected && peril !== "fire_burn") {
      const detected = String(parsed.crop_detected).toLowerCase();
      const expected = expectedCrop.toLowerCase();
      if (detected !== "unknown" && detected !== expected && !detected.includes(expected) && !expected.includes(detected)) {
        return {
          usable: false,
          reason: "wrong_crop",
          crop_detected: parsed.crop_detected || null,
          warnings: ["wrong_crop", ...(parsed.warnings || [])],
          confidence: parsed.confidence ?? 0.4,
          raw: parsed,
        };
      }
    }
    return {
      usable,
      reason,
      crop_detected: parsed.crop_detected ?? null,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : usable ? 0.7 : 0.3,
      raw: parsed,
    };
  } catch {
    return null;
  }
}
