/**
 * Shared Gemini Multimodal Vision & Metadata Verification Gate helpers.
 *
 * Implements Stage 1 of the verification pipeline:
 * Evaluates Image + Comprehensive Metadata + Spatial/Environmental Context.
 * Rejects AI fakes, screen captures, wrong crops, and non-field artifacts
 * BEFORE Gemini writes the reviewer-facing agronomic analysis.
 */

import { resolveGeminiVisionModel } from "@/lib/gemini-models";
import { isCropMatch } from "../crop-synonyms";

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
    isPersonDetected?: boolean | null;
    phenologyType?: string | null;
    luma?: number | null;
    blurScore?: number | null;
    hintCode?: string | null;
    modelLabel?: string | null;
    modelProb?: number | null;
  } | null;
  sha256?: string | null;
  pHash?: string | null;
  isDuplicate?: boolean | null;
  plotName?: string | null;
  plotLat?: number | null;
  plotLon?: number | null;
  plotDistanceM?: number | null;
  farmerObservation?: string | null;
  isDemoMode?: boolean | null;
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

  if (metadata?.isDuplicate === true) {
    return {
      usable: false,
      reason: "duplicate_angle",
      crop_detected: expectedCrop || null,
      visual_reason: "Exact duplicate photo or angle already uploaded across evidence slots",
      warnings: ["duplicate_angle"],
      confidence: 0.1,
      fallback: true,
    };
  }

  const cv = metadata?.cvAnalysis;
  const isClearCropFoliage = (cv?.cropScore != null && cv.cropScore >= 60) || (cv?.greenPct != null && cv.greenPct >= 35);

  if (cv?.hintCode === "person_detected" || (cv?.hintCode === "screen_detected" && !isClearCropFoliage)) {
    return {
      usable: false,
      reason: cv.hintCode === "screen_detected" ? "screen_replay_detected" : cv.hintCode,
      crop_detected: null,
      warnings: [cv.hintCode],
      confidence: 0.05,
      fallback: true,
    };
  }

  if (cv?.isPersonDetected === true) {
    return {
      usable: false,
      reason: "person_detected",
      crop_detected: null,
      visual_reason: "Human or non-crop subject detected instead of outdoor crop foliage",
      warnings: ["person_detected"],
      confidence: 0.05,
      fallback: true,
    };
  }

  if (cv?.isScreenDetected === true && !isClearCropFoliage) {
    return {
      usable: false,
      reason: "screen_replay_detected",
      crop_detected: null,
      visual_reason: "Photo of a screen/monitor display detected",
      warnings: ["screen_detected"],
      confidence: 0.05,
      fallback: true,
    };
  }

  const luma = cv?.luma;
  // Keep in lockstep with cv-core DARK_LUMA_MIN (14). Fire perils use 5.
  const darkFloor = peril === "fire_burn" ? 5 : 14;
  if (luma != null && luma < darkFloor) {
    return {
      usable: false,
      reason: "too_dark",
      crop_detected: null,
      warnings: ["too_dark"],
      confidence: 0.2,
      fallback: true,
    };
  }

  const blur = cv?.blurScore;
  // Standard blur threshold is 18; fire_burn can have smoke/ash haze, but blur < 10 is severely unusable
  const blurFloor = peril === "fire_burn" ? 10 : 18;
  if (blur != null && blur > 0 && blur < blurFloor) {
    return {
      usable: false,
      reason: "too_blurry",
      crop_detected: expectedCrop || null,
      warnings: ["too_blurry"],
      confidence: 0.25,
      fallback: true,
    };
  }

  const cropScore = cv?.cropScore;
  const greenPctEarly = cv?.greenPct;
  // Fresh on-device measurements override a stale `crop_not_detected` hint:
  // only honor the hint when there is no fresh cropScore/greenPct to contradict it.
  const hasFreshCropSignal = cropScore != null || greenPctEarly != null;
  if (
    cv?.hintCode === "crop_not_detected" &&
    !hasFreshCropSignal &&
    peril !== "fire_burn" &&
    !metadata?.isDemoMode
  ) {
    return {
      usable: false,
      reason: "crop_not_detected",
      crop_detected: expectedCrop || null,
      warnings: ["crop_not_detected"],
      confidence: 0.2,
      fallback: true,
    };
  }
  if (cropScore != null && cropScore < 75 && peril !== "fire_burn" && !metadata?.isDemoMode) {
    return {
      usable: false,
      reason: "crop_not_detected",
      crop_detected: expectedCrop || null,
      visual_reason: `On-device crop score ${cropScore}% is below the 75% lock`,
      warnings: ["crop_not_detected"],
      confidence: 0.2,
      fallback: true,
    };
  }

  const greenPct = cv?.greenPct;
  if (greenPct != null && greenPct < 8 && peril !== "fire_burn" && !metadata?.isDemoMode) {
    return {
      usable: false,
      reason: "not_crop",
      crop_detected: null,
      warnings: ["not_crop"],
      confidence: 0.2,
      fallback: true,
    };
  }

  // fire_burn can have low green — don't require strict crop check, but mark heuristic fallback
  if (peril === "fire_burn") {
    return {
      usable: true,
      reason: "ok",
      crop_detected: expectedCrop || "unknown",
      peril_match: true,
      metadata_verified: Boolean(metadata?.lat != null && metadata?.lon != null),
      warnings: ["fire_burn_heuristic_fallback"],
      confidence: expectedCrop ? 0.65 : 0.6,
      fallback: true,
    };
  }

  // Without CV measurements, fail closed — expectedCrop must not auto-pass (unless demo mode).
  const hasQualitySignal =
    cropScore != null || luma != null || blur != null || greenPct != null || cv?.hintCode != null;
  if (!hasQualitySignal && !metadata?.isDemoMode) {
    return {
      usable: false,
      reason: "heuristic_unverified",
      crop_detected: expectedCrop || null,
      warnings: ["heuristic_unverified"],
      confidence: 0.15,
      fallback: true,
    };
  }

  return {
    usable: true,
    reason: "ok",
    crop_detected: expectedCrop || "unknown",
    peril_match: true,
    metadata_verified: Boolean(metadata?.lat != null && metadata?.lon != null),
    warnings: [],
    confidence: expectedCrop ? 0.65 : 0.6,
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
    ? `Expected declared crop is '${expectedCrop}' (including common regional/agronomic synonyms such as paddy/rice/dhan, maize/corn/makka, gram/chickpea/chana, wheat/gehun). If a completely different crop is evident, mark reason='wrong_crop'.`
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

  const demoInstruction = metadata?.isDemoMode
    ? "PRESENTATION / DEMO MODE ACTIVE: This photograph is captured during a live indoor stage demonstration. Relax rigid outdoor farm field requirements; do not reject with 'not_crop' or 'no_field' solely due to indoor room context if sample plants or agricultural materials are presented."
    : "";


  const prompt = `You are the chief agricultural verification officer for the PMFBY crop insurance program.
Conduct an authoritative multimodal and contextual audit of this field evidence photograph.

${cropInstruction}
${perilInstruction}
${demoInstruction}
${metaContextLines}

Evaluate:
1. Visual Authenticity (fail closed): Reject photographs OF a phone, laptop, monitor, TV, or any second screen (bezels, status bar, moiré, pixel grid, UI chrome) with reason='screen_replay'. Reject AI-generated, stock, meme, or printed paper with reason='ai_generated'. Reject indoor rooms, selfies, and non-field objects with reason='not_crop' or 'no_field' (unless in Demo Mode). Ornamental hedge, garden shrub, lawn, houseplant, or decorative foliage that is not a farm crop stand → reason='not_crop' (or 'wrong_crop' if a crop was declared), usable=false.
2. Exposure & Focus: Reject if completely pitch dark or washed out (reason='too_dark' or 'too_blurry').
3. Crop Evidence Verification: Accept any clear photograph showing the crop stand, agricultural field, or crop damage/symptoms (${angleType}). Do NOT enforce rigid camera angle constraints. Flag retake ONLY if photo quality is unusable (pitch dark, blurry, fake, screen replay, non-crop, or exact duplicate angle).
4. Peril Consistency: Confirm if visual loss indicators match declared peril '${peril || "normal"}'.

Return ONLY valid JSON matching this schema:
{
  "usable": true | false,
  "reason": "ok" | "not_crop" | "wrong_crop" | "ai_generated" | "screen_replay" | "too_dark" | "too_blurry" | "no_field" | "duplicate_angle" | "unusable",
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

  const model = resolveGeminiVisionModel();
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

    let usable = Boolean(parsed.usable);
    let reason = String(parsed.reason || (usable ? "ok" : "unusable"));
    let warnings = Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [];

    // Enforce crop check if expectedCrop mismatch and not fire peril
    if (expectedCrop && parsed.crop_detected && peril !== "fire_burn") {
      if (!isCropMatch(expectedCrop, parsed.crop_detected)) {
        return {
          usable: false,
          reason: "wrong_crop",
          crop_detected: parsed.crop_detected || null,
          peril_match: Boolean(parsed.peril_match),
          metadata_verified: Boolean(parsed.metadata_verified),
          authenticity_score: parsed.authenticity_score ?? 0.85,
          confidence: parsed.confidence ?? 0.4,
          visual_reason: parsed.visual_reason || `Detected ${parsed.crop_detected} instead of declared ${expectedCrop}.`,
          warnings: ["wrong_crop", ...warnings],
          recommendations: parsed.recommendations || [],
          raw: parsed,
        };
      } else {
        // Disarm false-positive wrong_crop from LLM if synonym matched (e.g. paddy <-> rice)
        if (reason === "wrong_crop") {
          reason = "ok";
          usable = true;
        }
        warnings = warnings.filter((w) => w !== "wrong_crop" && w !== "crop_mismatch");
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
      warnings,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
      raw: parsed,
    };
  } catch {
    return null;
  }
}
