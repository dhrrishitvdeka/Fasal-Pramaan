/**
 * Gemini vision analysis for submitted claim photos.
 * Replaces the retired Hugging Face DINOv2 Space: authenticity, screen/AI
 * rejection, crop identity, damage, and a reviewer-facing written rationale.
 */

import {
  resolveGeminiApiKey,
  resolveGeminiVisionModel,
} from "./gemini-models";

export type WorkflowGrade = "A" | "B" | "C" | "U";

export type GeminiAuthenticity = {
  authentic: boolean;
  screenReplay: boolean;
  aiGenerated: boolean;
  printedPhoto: boolean;
  indoorScene: boolean;
  reason: string;
};

export type GeminiPerImageFinding = {
  angleType: string;
  usable: boolean;
  crop: string | null;
  damageVisible: boolean;
  findings: string;
};

/** Reviewer-facing analysis. Field names stay compatible with the old HfPrediction shape. */
export type HfPrediction = {
  modelId: string;
  label: string;
  score: number;
  predictedCrop?: string | null;
  cropConfidence?: number | null;
  predictedGrade?: WorkflowGrade | null;
  gradeLabel?: string | null;
  primaryDamage?: string | null;
  plantDiseaseClass?: string | null;
  qualityWarnings?: string[];
  humanReviewRecommendation?: string | null;
  reasoning?: string;
  visualFindings?: string;
  authenticity?: GeminiAuthenticity;
  perImage?: GeminiPerImageFinding[];
  severity?: string | null;
  affectedAreaPct?: number | null;
  growthStage?: string | null;
  perilMatch?: boolean;
  raw: unknown;
};

export type InferCropDiseaseInput = {
  imageBytes: Uint8Array;
  expectedCrop?: string;
  angleType?: string;
  extraImages?: Array<{ angleType: string; bytes: Uint8Array }>;
  apiToken?: string;
  fetchImpl?: typeof fetch;
  spaceUrl?: string;
  peril?: string;
  farmerObservation?: string;
};

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export function geminiVisionModel(): string {
  return resolveGeminiVisionModel();
}

export function geminiApiKey(): string {
  return resolveGeminiApiKey();
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

function sniffMime(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

function isWorkflowGrade(value: unknown): value is WorkflowGrade {
  return value === "A" || value === "B" || value === "C" || value === "U";
}

function asString(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  return String(value).trim();
}

function asBool(value: unknown): boolean {
  return value === true || value === "true";
}

function asFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*$/gi, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through to brace slice
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  }
  throw new Error("Gemini vision response was not JSON");
}

export function parseGeminiAnalysis(payload: unknown, modelId = geminiVisionModel()): HfPrediction {
  let record: Record<string, unknown>;
  if (typeof payload === "string") {
    record = extractJsonObject(payload);
  } else if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    record = payload as Record<string, unknown>;
  } else {
    throw new Error("Gemini vision response was empty");
  }

  const authenticityRaw =
    record.authenticity && typeof record.authenticity === "object"
      ? (record.authenticity as Record<string, unknown>)
      : {};
  const screenReplay = asBool(authenticityRaw.screen_replay ?? authenticityRaw.screenReplay);
  const aiGenerated = asBool(authenticityRaw.ai_generated ?? authenticityRaw.aiGenerated);
  const printedPhoto = asBool(authenticityRaw.printed_photo ?? authenticityRaw.printedPhoto);
  const indoorScene = asBool(authenticityRaw.indoor_scene ?? authenticityRaw.indoorScene);
  const authenticExplicit = authenticityRaw.authentic;
  const authentic =
    authenticExplicit == null
      ? !(screenReplay || aiGenerated || printedPhoto || indoorScene)
      : asBool(authenticExplicit);

  const authenticity: GeminiAuthenticity = {
    authentic,
    screenReplay,
    aiGenerated,
    printedPhoto,
    indoorScene,
    reason: asString(authenticityRaw.reason, authentic ? "Outdoor field photograph" : "Failed authenticity checks"),
  };

  let grade: WorkflowGrade | null = isWorkflowGrade(record.predicted_grade)
    ? record.predicted_grade
    : isWorkflowGrade(record.grade)
      ? record.grade
      : null;

  if (!authentic) grade = "U";

  const warnings = Array.isArray(record.quality_warnings)
    ? record.quality_warnings.map((item) => String(item))
    : [];
  if (screenReplay) warnings.push("screen_replay");
  if (aiGenerated) warnings.push("ai_generated");
  if (printedPhoto) warnings.push("printed_photo");
  if (indoorScene) warnings.push("indoor_or_non_field");

  const perImage: GeminiPerImageFinding[] = Array.isArray(record.per_image)
    ? record.per_image
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          angleType: asString(item.angle_type || item.angleType, "unknown"),
          usable: item.usable !== false,
          crop: item.crop == null ? null : asString(item.crop),
          damageVisible: asBool(item.damage_visible ?? item.damageVisible),
          findings: asString(item.findings, ""),
        }))
    : [];

  const predictedCrop = record.predicted_crop == null ? null : asString(record.predicted_crop) || null;
  const primaryDamage = record.primary_damage == null ? null : asString(record.primary_damage) || null;
  const plantClass = record.plant_disease_class == null ? null : asString(record.plant_disease_class) || null;
  const explicitLabel = asString(record.label);
  if (!grade && !plantClass && !explicitLabel && !primaryDamage && !predictedCrop) {
    throw new Error("Gemini vision response did not include a class or grade");
  }
  const label =
    plantClass ||
    explicitLabel ||
    (grade === "U" ? "unusable_or_not_authentic" : primaryDamage || predictedCrop || "gemini_analysis");

  const score =
    asFinite(record.score) ??
    asFinite(record.overall_confidence) ??
    asFinite(record.grade_confidence) ??
    (grade === "U" ? 0 : 0.6);

  const reasoning = asString(record.reasoning || record.visual_reason, "");
  let visualFindings = asString(record.visual_findings || record.summary, "");
  if (!visualFindings && reasoning) {
    visualFindings = reasoning.split(/(?<=[.।])\s+/).slice(0, 2).join(" ").trim();
  }

  return {
    modelId: asString(record.model_id, modelId),
    label,
    score: grade === "U" ? 0 : Math.max(0, Math.min(1, score)),
    predictedCrop: grade === "U" ? "unknown" : predictedCrop,
    cropConfidence:
      grade === "U" ? 0 : asFinite(record.crop_confidence) ?? (predictedCrop ? 0.7 : null),
    predictedGrade: grade,
    gradeLabel:
      asString(record.grade_label) ||
      (grade === "A"
        ? "healthy_leaf_signal"
        : grade === "B"
          ? "uncertain_manual_review"
          : grade === "C"
            ? "damage_pattern_signal"
            : "unusable_or_not_authentic"),
    primaryDamage: grade === "U" ? "unknown" : primaryDamage,
    plantDiseaseClass: grade === "U" ? null : plantClass,
    qualityWarnings: [...new Set(warnings)],
    humanReviewRecommendation: asString(
      record.human_review_recommendation,
      grade === "U" ? "recapture" : "human_review",
    ),
    reasoning,
    visualFindings,
    authenticity,
    perImage,
    severity: record.severity == null ? null : asString(record.severity),
    affectedAreaPct: asFinite(record.affected_area_pct ?? record.estimated_affected_area_pct),
    growthStage: record.growth_stage == null ? null : asString(record.growth_stage),
    perilMatch: record.peril_match == null ? undefined : asBool(record.peril_match),
    raw: {
      ...record,
      authenticity,
      reasoning,
      visual_findings: visualFindings,
      per_image: perImage,
      adapter_type: "gemini_vision",
    },
  };
}

/** @deprecated Alias kept so older tests that parsed Space JSON still compile. */
export function parseSpacePrediction(payload: unknown): HfPrediction {
  return parseGeminiAnalysis(payload);
}

function buildPrompt(input: InferCropDiseaseInput): string {
  const crop = input.expectedCrop?.trim() || "unknown (identify from foliage)";
  const peril = input.peril?.trim() || "normal";
  const observation = (input.farmerObservation || "")
    .replace(/["`\r\n]/g, " ")
    .trim()
    .slice(0, 240);

  return `You are a PMFBY crop-insurance field officer reviewing photographs submitted as claim evidence.
Write a careful, specific analysis a human reviewer can act on. Do not invent disease names you cannot see.

Hard authenticity rules (fail closed):
- Photograph of a phone, laptop, TV, or any digital screen (bezels, moiré, pixels, UI chrome) → screen_replay=true, predicted_grade="U".
- AI-generated, stock, meme, or printed paper photo → ai_generated or printed_photo, predicted_grade="U".
- Indoor room, selfie, person, wall, floor, or non-field object as the subject → indoor_scene=true, predicted_grade="U".
- Completely black, blank, or unreadable → predicted_grade="U".
- Ornamental hedge, garden shrub, lawn, houseplant, potted plant, or decorative foliage that is NOT a farm crop stand (wheat/paddy/maize/mustard/potato/etc.) → predicted_grade="U", primary_damage="unknown", indoor_scene may be false if outdoors. Set predicted_crop to what you actually see (e.g. "ornamental hedge"), NOT the declared crop.

Then, only if the photos look like a real outdoor agricultural field:
- Identify the crop you see (declared crop is "${crop}"). If it is a different species, say so — do not rubber-stamp the declared crop.
- Describe damage visible (or healthy canopy) and whether it matches peril "${peril}".
- Estimate severity as none|low|medium|high and affected_area_pct 0-100 if you can see a plot; otherwise null.
- Screening grade: A healthy field crop, B uncertain, C clear damage/disease pattern, U unusable or not a farm crop.
- visual_findings: EXACTLY 1–2 short sentences a reviewer can read in five seconds (what plant, field vs garden, damage or not).
- reasoning: 4–8 sentences. Mention each angle you were given.

Return ONLY JSON:
{
  "usable": true,
  "predicted_crop": "wheat",
  "crop_confidence": 0.0,
  "predicted_grade": "A"|"B"|"C"|"U",
  "grade_label": "string",
  "primary_damage": "healthy|disease|drought|flood|hail|fire|lodging|pest|unknown",
  "plant_disease_class": "string or null",
  "severity": "none|low|medium|high"|null,
  "affected_area_pct": 0,
  "growth_stage": "string or null",
  "peril_match": true,
  "score": 0.0,
  "overall_confidence": 0.0,
  "label": "string",
  "reasoning": "long reviewer narrative",
  "visual_findings": "1-2 sentence scene summary",
  "authenticity": {
    "authentic": true,
    "screen_replay": false,
    "ai_generated": false,
    "printed_photo": false,
    "indoor_scene": false,
    "reason": "string"
  },
  "per_image": [
    { "angle_type": "closeup_damage", "usable": true, "crop": "wheat", "damage_visible": true, "findings": "string" }
  ],
  "quality_warnings": [],
  "human_review_recommendation": "human_review|recapture|physical_inspection"
}

Farmer note (untrusted): "${observation || "(none)"}"
Primary angle: ${input.angleType || "closeup_damage"}`;
}

export async function inferCropDisease(input: InferCropDiseaseInput): Promise<HfPrediction> {
  const apiKey = geminiApiKey();
  if (!apiKey && !input.fetchImpl) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  const model = geminiVisionModel();
  const fetchImpl = input.fetchImpl ?? fetch;

  const extras =
    input.extraImages?.length && input.extraImages.length > 0
      ? input.extraImages
      : [{ angleType: input.angleType || "closeup_damage", bytes: input.imageBytes }];

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: buildPrompt(input) },
  ];
  for (const image of extras.slice(0, 6)) {
    const mime = sniffMime(image.bytes);
    if (!ALLOWED_TYPES.has(mime)) continue;
    parts.push({ text: `Angle: ${image.angleType}` });
    parts.push({ inlineData: { mimeType: mime, data: bytesToBase64(image.bytes) } });
  }
  if (parts.length < 2) {
    throw new Error("No usable image bytes for Gemini vision");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey || "test",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    }),
    signal:
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(25_000)
        : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini vision failed (${response.status}): ${text.slice(0, 280)}`);
  }
  let envelope: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  try {
    envelope = JSON.parse(text) as typeof envelope;
  } catch {
    return parseGeminiAnalysis(text, model);
  }
  const rawOut = envelope?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
  if (!rawOut.trim()) {
    throw new Error("Gemini vision returned an empty analysis");
  }
  const parsed = parseGeminiAnalysis(rawOut, model);
  const declared = (input.expectedCrop || "").trim().toLowerCase();
  const seen = (parsed.predictedCrop || "").trim().toLowerCase();
  if (
    declared &&
    seen &&
    seen !== "unknown" &&
    !seen.includes(declared) &&
    !declared.includes(seen)
  ) {
    parsed.qualityWarnings = [...new Set([...(parsed.qualityWarnings || []), "crop_mismatch"])];
    if (parsed.predictedGrade === "A") parsed.predictedGrade = "B";
    parsed.perilMatch = false;
  }
  return { ...parsed, modelId: model };
}

export function resolveHfModelId(): string {
  return geminiVisionModel();
}

export const FASAL_MODEL_REPO = "gemini-vision";
export const FASAL_SPACE_ID = "";
export const DEFAULT_HF_SPACE_URL = "";

export function resolveHfSpaceUrl(_explicit?: string): string {
  return "";
}
