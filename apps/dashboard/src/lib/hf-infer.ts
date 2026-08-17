export const DEFAULT_HF_MODEL_ID = "wambugu71/crop_leaf_diseases_vit";

export type HfPrediction = {
  modelId: string;
  label: string;
  score: number;
  raw: unknown;
};

export type InferCropDiseaseInput = {
  imageBytes: Uint8Array;
  modelId?: string;
  apiToken?: string;
  fetchImpl?: typeof fetch;
  endpointBase?: string;
};

function pickTopLabel(payload: unknown): { label: string; score: number } {
  if (Array.isArray(payload) && payload.length > 0) {
    const ranked = [...payload].sort((a, b) => {
      const sa = typeof a?.score === "number" ? a.score : 0;
      const sb = typeof b?.score === "number" ? b.score : 0;
      return sb - sa;
    });
    const top = ranked[0] as { label?: string; score?: number };
    if (top?.label) {
      return { label: String(top.label), score: Number(top.score ?? 0) };
    }
  }
  if (payload && typeof payload === "object" && "error" in payload) {
    throw new Error(String((payload as { error: unknown }).error));
  }
  throw new Error("Hugging Face response did not include a label");
}

export function resolveHfModelId(explicit?: string): string {
  return (
    explicit ||
    process.env.NEXT_PUBLIC_HF_MODEL_ID ||
    process.env.HF_MODEL_ID ||
    DEFAULT_HF_MODEL_ID
  );
}

/** Call a hosted Hugging Face image-classification model. Only `fetchImpl` may be stubbed. */
export async function inferCropDisease(input: InferCropDiseaseInput): Promise<HfPrediction> {
  const modelId = resolveHfModelId(input.modelId);
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = (input.endpointBase || "https://router.huggingface.co/hf-inference/models").replace(
    /\/$/,
    "",
  );
  const url = `${base}/${modelId}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    Accept: "application/json",
  };
  const token = input.apiToken || process.env.HF_TOKEN || process.env.HUGGINGFACE_API_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const body = input.imageBytes.slice().buffer;
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Hugging Face inference failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const payload = await response.json();
  const top = pickTopLabel(payload);
  return {
    modelId,
    label: top.label,
    score: top.score,
    raw: payload,
  };
}
