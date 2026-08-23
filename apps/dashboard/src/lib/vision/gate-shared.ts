/**
 * Shared Gemini Multimodal Vision & Metadata Verification Gate helpers.
 *
 * Implements Stage 1 of the verification pipeline:
 * Evaluates Image + Comprehensive Metadata + Spatial/Environmental Context.
 * Rejects AI fakes, screen captures, wrong crops, and non-field artifacts
 * BEFORE passing verified authentic evidence to the Hugging Face DINOv2 model.
 */

export const ALLOWED_GATE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export type ImageEvidenceMetadata = {
  lat?: number | null;
  lon?: number | null;
  accuracyM?: number | null;
  capturedAt?: string | null;
  facing?: "environment" | "user" | string | null;
  dimensions?: { width: number; height: number } | null;
  cvAnalysis?: {
    cropScore?: number | null;
    greenPct?: number | null;
    isScreenDetected?: boolean | null;
    phenologyType?: string | null;
    luma?: number | null;
    blurScore?: number | null;
    hintCode?: string | null;
    modelLabel?: string | null;
    modelProb?: number | null;
  } | null;
  sha256?: string | null;
  plotName?: string | null;
  plotLat?: number | null;
  plotLon?: number | null;
  plotDistanceM?: number | null;
  farmerObservation?: string | null;
};

export type GateResult = {
  usable: boolean;
  reason: string;
  crop_detected: string | null;
  peril_match?: boolean;
  metadata_verified?: boolean;
  authenticity_score?: number;
  confidence: number;
  visual_reason?: string;
  warnings: string[];
  recommendations?: string[];
  raw?: unknown;
  fallback?: boolean;
};

export function heuristicGate(
  dataUrl: string,
  expectedCrop?: string,
  peril?: string,
  metadata?: ImageEvidenceMetadata,
): GateResult {
  if (!dataUrl.startsWith("data:image/")) {
    return {
      usable: false,
      reason: "not_image",
      crop_detected: null,
      warnings: ["not_image"],
      confidence: 0,
      fallback: true,
    };
  }

  const approxBytes = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);
  if (approxBytes < 8000) {
    return {
      usable: false,
      reason: "too_small_or_blank",
      crop_detected: null,
      warnings: ["too_small"],
      confidence: 0.1,
      fallback: true,
    };
  }

  const cv = metadata?.cvAnalysis;
  const luma = cv?.luma;
  if (luma != null && luma < 12) {
    return {
      usable: false,
      reason: "too_dark",
      crop_detected: null,
      warnings: ["too_dark"],
      confidence: 0.2,
      fallback: true,
    };
  }

  // fire_burn can have low green — don't require strict crop check
  if (peril === "fire_burn") {
    return {
      usable: true,
      reason: "ok",
      crop_detected: expectedCrop || "unknown",
      peril_match: true,
      metadata_verified: Boolean(metadata?.lat != null && metadata?.lon != null),
      warnings: [],
      confidence: 0.75,
      fallback: true,
    };
  }

  // If expectedCrop provided, assume gate passes in heuristic mode
  if (expectedCrop) {
    return {
      usable: true,
      reason: "ok",
      crop_detected: expectedCrop,
      peril_match: true,
      metadata_verified: Boolean(metadata?.lat != null && metadata?.lon != null),
      warnings: [],
      confidence: 0.65,
      fallback: true,
    };
  }

  return {
    usable: true,
    reason: "ok",
    crop_detected: "unknown",
    peril_match: true,
    metadata_verified: Boolean(metadata?.lat != null && metadata?.lon != null),
    warnings: [],
    confidence: 0.6,
    fallback: true,
  };
}

export async function geminiGate(
  imageDataUrl: string,
  angleType: string,
  expectedCrop: string | undefined,
  peril: string | undefined,
  metadata?: ImageEvidenceMetadata,
): Promise<GateResult | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!apiKey) return null;
  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  if (!ALLOWED_GATE_TYPES.has(mime.toLowerCase())) return null;

  const cropInstruction = expectedCrop
    ? `Expected declared crop is '${expectedCrop}'. If a completely different crop is evident, mark reason='wrong_crop'.`
    : "Identify the crop species or agricultural genus visible in the foliage/canopy.";

  const perilInstruction =
    peril === "fire_burn"
      ? "Peril is 'Fire / Burn Damage'. The scene may contain scorched earth, blackened stalks, or ash with low chlorophyll green. Do NOT reject for lack of green canopy if burn damage is evident."
      : peril === "flood"
      ? "Peril is 'Flood / Waterlogging Inundation'. Look for silt lines, standing water, submerged foliage, or waterlogging signs."
      : peril === "hailstorm"
      ? "Peril is 'Hailstorm Devastation'. Look for torn leaves, shredded stems, or physical hail puncturing."
      : peril === "lodging"
      ? "Peril is 'Crop Lodging'. Look for flattened stalks, wind tilt, or fallen stems."
      : peril === "drought"
      ? "Peril is 'Drought Stress'. Look for wilting leaves, severe yellowing/chlorosis, or parched soil."
      : "Verify authentic outdoor agricultural field conditions.";

  const safeObservation = metadata?.farmerObservation
    ? String(metadata.farmerObservation)
        .replace(/["`\r\n]/g, " ")
        .trim()
        .slice(0, 200)
    : "";

  const metaContextLines = metadata
    ? `
Capture Metadata Context:
- GPS Fix: Lat ${metadata.lat ?? "N/A"}, Lon ${metadata.lon ?? "N/A"} (Accuracy: ${metadata.accuracyM ?? "N/A"}m)
- Timestamp: ${metadata.capturedAt ?? "N/A"}
- Camera Facing: ${metadata.facing ?? "environment"}
- Dimensions: ${metadata.dimensions ? `${metadata.dimensions.width}x${metadata.dimensions.height}` : "N/A"}
- Realtime Edge CV: ${metadata.cvAnalysis?.greenPct ?? "N/A"}% canopy coverage, Luma ${metadata.cvAnalysis?.luma ?? "N/A"}, Blur score ${metadata.cvAnalysis?.blurScore ?? "N/A"}
- UNTRUSTED USER CLAIM: """${safeObservation || "(none)"}"""
`
    : "";

  const prompt = `You are the chief agricultural verification officer for the PMFBY crop insurance program.
Conduct an authoritative multimodal and contextual audit of this field evidence photograph.

${cropInstruction}
${perilInstruction}
${metaContextLines}

Evaluate:
1. Visual Authenticity: Reject any photograph of computer/phone screens, AI-generated images, photographs of printed paper, indoor/domestic scenes, or non-agricultural objects (reason='ai_generated' or 'not_crop' or 'no_field').
2. Exposure & Focus: Reject if completely pitch dark or washed out (reason='too_dark' or 'too_blurry').
3. Angle Compliance: Verify canonical framing (${angleType}).
4. Peril Consistency: Confirm if visual loss indicators match declared peril '${peril || "normal"}'.

Return ONLY valid JSON matching this schema:
{
  "usable": true | false,
  "reason": "ok" | "not_crop" | "wrong_crop" | "ai_generated" | "too_dark" | "too_blurry" | "no_field" | "unusable",
  "crop_detected": string | null,
  "peril_match": true | false,
  "metadata_verified": true | false,
  "authenticity_score": 0.0 - 1.0,
  "confidence": 0.0 - 1.0,
  "visual_reason": "Detailed 1-2 sentence technical agronomic explanation of what is visible",
  "warnings": string[],
  "recommendations": string[]
}

Angle: ${angleType}, Peril: ${peril || "normal"}`;

  const model =
    process.env.GEMINI_VISION_MODEL || process.env.GEMINI_LIVE_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: b64 } }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 768,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    const text = await res.text();
    if (!res.ok) return null;

    const json = JSON.parse(text) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const rawOut = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!rawOut) return null;

    const outText = rawOut.replace(/```(?:json)?\s*/gi, "").replace(/```\s*$/gi, "").trim();
    const parsed = JSON.parse(outText) as {
      usable?: boolean;
      reason?: string;
      crop_detected?: string | null;
      peril_match?: boolean;
      metadata_verified?: boolean;
      authenticity_score?: number;
      confidence?: number;
      visual_reason?: string;
      warnings?: string[];
      recommendations?: string[];
    };

    const usable = Boolean(parsed.usable);
    const reason = String(parsed.reason || (usable ? "ok" : "unusable"));

    // Enforce crop check if expectedCrop mismatch and not fire peril
    if (expectedCrop && parsed.crop_detected && peril !== "fire_burn") {
      const detected = String(parsed.crop_detected).toLowerCase();
      const expected = expectedCrop.toLowerCase();
      if (
        detected !== "unknown" &&
        detected !== expected &&
        !detected.includes(expected) &&
        !expected.includes(detected)
      ) {
        return {
          usable: false,
          reason: "wrong_crop",
          crop_detected: parsed.crop_detected || null,
          peril_match: Boolean(parsed.peril_match),
          metadata_verified: Boolean(parsed.metadata_verified),
          authenticity_score: parsed.authenticity_score ?? 0.85,
          confidence: parsed.confidence ?? 0.4,
          visual_reason: parsed.visual_reason || `Detected ${parsed.crop_detected} instead of declared ${expectedCrop}.`,
          warnings: ["wrong_crop", ...(parsed.warnings || [])],
          recommendations: parsed.recommendations || [],
          raw: parsed,
        };
      }
    }

    return {
      usable,
      reason,
      crop_detected: parsed.crop_detected ?? null,
      peril_match: Boolean(parsed.peril_match ?? true),
      metadata_verified: Boolean(parsed.metadata_verified ?? true),
      authenticity_score:
        typeof parsed.authenticity_score === "number" ? parsed.authenticity_score : usable ? 0.95 : 0.4,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : usable ? 0.85 : 0.3,
      visual_reason: parsed.visual_reason,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
      raw: parsed,
    };
  } catch {
    return null;
  }
}
