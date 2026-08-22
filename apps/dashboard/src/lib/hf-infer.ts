export const FASAL_MODEL_REPO = "dhrrishitvdeka/fasal-pramaan-model";
export const FASAL_SPACE_ID = "dhrrishitvdeka/fasal-pramaan-api";
export const DEFAULT_HF_SPACE_URL = "https://dhrrishitvdeka-fasal-pramaan-api.hf.space";

export type WorkflowGrade = "A" | "B" | "C" | "U";

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
};

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary);
}

export function resolveHfSpaceUrl(explicit?: string): string {
  return (
    explicit ||
    process.env.HF_SPACE_URL ||
    process.env.FASAL_HF_SPACE_URL ||
    DEFAULT_HF_SPACE_URL
  ).replace(/\/$/, "");
}

export function resolveHfModelId(): string {
  return process.env.HF_MODEL_ID || FASAL_MODEL_REPO;
}

function isWorkflowGrade(value: unknown): value is WorkflowGrade {
  return value === "A" || value === "B" || value === "C" || value === "U";
}

function looksLikePlaceholderClassifier(payload: unknown): boolean {
  if (!Array.isArray(payload) || payload.length === 0) return false;
  const first = payload[0] as { label?: string };
  const label = String(first?.label || "");
  return /tomato|leaf_blight|wambugu|vit/i.test(label) && !("predicted_grade" in (first as object));
}

export function parseSpacePrediction(payload: unknown): HfPrediction {
  if (looksLikePlaceholderClassifier(payload)) {
    throw new Error("Rejected placeholder classifier payload; Fasal-Pramaan Space required");
  }
  let body = payload;
  if (Array.isArray(payload) && payload.length > 0) {
    body = payload[0];
  }
  if (!body || typeof body !== "object") {
    throw new Error("Fasal-Pramaan Space response was empty");
  }
  const record = body as Record<string, unknown>;
  if (record.ok === false) {
    throw new Error(String(record.error || "Space inference failed"));
  }
  if (typeof record.error === "string" && record.ok !== true && !record.predicted_grade) {
    throw new Error(record.error);
  }
  const grade = isWorkflowGrade(record.predicted_grade) ? record.predicted_grade : null;
  const plantClass = record.plant_disease_class ? String(record.plant_disease_class) : null;
  const label = String(plantClass || record.label || record.grade_label || "");
  const score = Number(record.score ?? record.overall_confidence ?? record.grade_confidence ?? 0);
  if (!label) {
    throw new Error("Fasal-Pramaan Space response did not include a class or grade");
  }
  return {
    modelId: String(record.model_id || resolveHfModelId()),
    label,
    score,
    predictedCrop: record.predicted_crop == null ? null : String(record.predicted_crop),
    cropConfidence: typeof record.crop_confidence === "number" ? record.crop_confidence : null,
    predictedGrade: grade,
    gradeLabel: record.grade_label == null ? null : String(record.grade_label),
    primaryDamage: record.primary_damage == null ? null : String(record.primary_damage),
    plantDiseaseClass: plantClass,
    qualityWarnings: Array.isArray(record.quality_warnings)
      ? record.quality_warnings.map((item) => String(item))
      : [],
    humanReviewRecommendation:
      record.human_review_recommendation == null
        ? null
        : String(record.human_review_recommendation),
    raw: record,
  };
}

function parseSsePayload(text: string): unknown {
  const lines = text.split(/\r?\n/).filter((line) => line.startsWith("data:"));
  if (lines.length === 0) {
    return JSON.parse(text);
  }
  let last: unknown = null;
  for (const line of lines) {
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    last = JSON.parse(data);
  }
  return last;
}

async function callGradioPredictApi(
  spaceUrl: string,
  token: string | undefined,
  data: unknown[],
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const started = await fetchImpl(`${spaceUrl}/gradio_api/call/predict_api`, {
    method: "POST",
    headers,
    body: JSON.stringify({ data }),
    signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(12000) : undefined,
  });
  const startText = await started.text();
  if (!started.ok) {
    throw new Error(`Fasal-Pramaan Space failed (${started.status}): ${startText.slice(0, 300)}`);
  }
  const startJson = JSON.parse(startText) as { event_id?: string; data?: unknown };
  if (startJson.data !== undefined && !startJson.event_id) {
    return startJson.data;
  }
  if (parseSpacePredictionSafe(startJson)) {
    return startJson;
  }
  const eventId = startJson.event_id;
  if (!eventId) {
    return startJson;
  }
  const stream = await fetchImpl(`${spaceUrl}/gradio_api/call/predict_api/${eventId}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(12000) : undefined,
  });
  const streamText = await stream.text();
  if (!stream.ok) {
    throw new Error(`Fasal-Pramaan Space poll failed (${stream.status}): ${streamText.slice(0, 300)}`);
  }
  return parseSsePayload(streamText);
}

function parseSpacePredictionSafe(payload: unknown): boolean {
  try {
    parseSpacePrediction(payload);
    return true;
  } catch {
    return false;
  }
}

/** Call the Fasal-Pramaan Hugging Face Space. Only `fetchImpl` may be stubbed. */
export async function inferCropDisease(input: InferCropDiseaseInput): Promise<HfPrediction> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const spaceUrl = resolveHfSpaceUrl(input.spaceUrl);
  const token = input.apiToken || process.env.HF_TOKEN || process.env.HUGGINGFACE_API_TOKEN;
  const imageB64 = bytesToBase64(input.imageBytes);
  const extras = input.extraImages?.length
    ? input.extraImages
    : [{ angleType: input.angleType || "closeup_damage", bytes: input.imageBytes }];
  const imagesJson = JSON.stringify(
    extras.map((image) => ({
      image_b64: bytesToBase64(image.bytes),
      angle_type: image.angleType,
    })),
  );

  const payload = await callGradioPredictApi(
    spaceUrl,
    token,
    [imageB64, input.expectedCrop || "", input.angleType || "closeup_damage", imagesJson],
    fetchImpl,
  );
  return parseSpacePrediction(payload);
}
