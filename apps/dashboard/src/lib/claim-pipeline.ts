import { inferCropDisease, resolveHfModelId, type HfPrediction } from "./hf-infer";
import { isUnusableLighting } from "./evidence";
import type { Submission } from "./api";
import { heuristicGate, geminiGate, type GateResult } from "./vision/gate-shared";
import type { ContextSignal } from "./context/types";
import { adaptiveConfidence, type AdaptiveResult } from "./context/adaptive-engine";
import { ROUTE_CONFIG, type Peril } from "./claim-routing";

// ---------- Vision gate helpers (shared with /api/vision/gate) ----------

const GATE_CACHE_TTL_MS = 10 * 60 * 1000;
const GATE_BLOCK_REASONS = new Set(["wrong_crop", "ai_generated", "too_dark", "not_crop"]);
const gateCache = new Map<string, { result: GateResult; expiresAt: number }>();

export function shouldGatePeril(peril?: string | null): boolean {
  if (peril == null || String(peril).trim() === "") return true;
  // Gate all perils — fire_burn is handled leniently inside heuristic/gemini gate.
  // Return false here to skip gating for a peril entirely if needed.
  const p = String(peril).trim().toLowerCase();
  // Example: if you ever want to skip gating for a specific peril, add: if (p === "some_peril") return false;
  void p;
  return true;
}

function bytesToDataUrl(bytes: Uint8Array, contentType?: string): string {
  const mime = (contentType || "image/jpeg").toLowerCase();
  let base64: string;
  if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(bytes).toString("base64");
  } else {
    let binary = "";
    bytes.forEach((value) => {
      binary += String.fromCharCode(value);
    });
    base64 = btoa(binary);
  }
  return `data:${mime};base64,${base64}`;
}

async function gateSingleImage(
  input: PersistedImageInput,
  expectedCrop?: string,
  peril?: string,
): Promise<GateResult> {
  const sha = input.sha256 ? String(input.sha256).toLowerCase() : "";
  const isRealSha = sha && /^[a-f0-9]{64}$/i.test(sha);
  if (isRealSha) {
    const cached = gateCache.get(sha);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.result;
    }
    if (cached) gateCache.delete(sha);
  }

  let dataUrl: string | null = null;
  if (input.bytes && input.bytes.byteLength > 0) {
    dataUrl = bytesToDataUrl(input.bytes, input.contentType);
  }
  if (!dataUrl) {
    const fallback: GateResult = {
      usable: false,
      reason: "not_image",
      crop_detected: null,
      warnings: ["not_image"],
      confidence: 0,
      fallback: true,
    };
    if (isRealSha) gateCache.set(sha, { result: fallback, expiresAt: Date.now() + GATE_CACHE_TTL_MS });
    return fallback;
  }

  // Try Gemini first if API key is configured; reuse same prompt as gate route (via shared geminiGate).
  // This is the direct-import path (more efficient than POST /api/vision/gate). If you prefer the
  // HTTP path, you can POST to /api/vision/gate with AbortSignal.timeout(5000) instead:
  //   const res = await fetch("/api/vision/gate", { method:"POST", body: JSON.stringify({ imageDataUrl: dataUrl, angleType, expectedCrop, peril }), signal: AbortSignal.timeout(5000) })
  try {
    const gemini = await geminiGate(dataUrl, input.angleType || "closeup_damage", expectedCrop, peril);
    if (gemini) {
      if (isRealSha) gateCache.set(sha, { result: gemini, expiresAt: Date.now() + GATE_CACHE_TTL_MS });
      return gemini;
    }
  } catch {
    // fall through to heuristic
  }

  const heuristic = heuristicGate(dataUrl, expectedCrop, peril);
  const result: GateResult = { ...heuristic, fallback: true };
  if (isRealSha) gateCache.set(sha, { result, expiresAt: Date.now() + GATE_CACHE_TTL_MS });
  return result;
}

export type PersistedGateOutcome = {
  perImage: Array<GateResult & { angleType: string }>;
  gateFailed: boolean;
  blockingReason?: string;
  gateResult: unknown;
};

/** Attach per-angle gate results onto image rows before insertImages persists them. */
function attachPerImageGate(
  rows: WebImageRow[],
  perImage?: Array<GateResult & { angleType: string }> | null,
): WebImageRow[] {
  if (!perImage || perImage.length === 0) return rows;
  const byAngle = new Map(perImage.map((entry) => [entry.angleType, entry]));
  return rows.map((row) => {
    const hit = byAngle.get(row.angle_type);
    return hit ? { ...row, gate_result: hit } : row;
  });
}

export async function gateImagesGate(
  inputImages: PersistedImageInput[],
  expectedCrop?: string,
  peril?: string,
): Promise<PersistedGateOutcome> {
  if (!inputImages.length) {
    return { perImage: [], gateFailed: false, gateResult: { perImage: [], gateFailed: false } };
  }
  if (!shouldGatePeril(peril)) {
    const perImage = inputImages.map((img) => ({
      usable: true,
      reason: "ok",
      crop_detected: expectedCrop || "unknown",
      warnings: [] as string[],
      confidence: 0.62,
      fallback: true as const,
      angleType: img.angleType,
    }));
    return {
      perImage,
      gateFailed: false,
      gateResult: { perImage, gateFailed: false, skippedPeril: peril ?? null, expectedCrop: expectedCrop || null },
    };
  }

  const perImage: Array<GateResult & { angleType: string }> = [];
  for (const img of inputImages) {
    const res = await gateSingleImage(img, expectedCrop, peril);
    perImage.push({ ...res, angleType: img.angleType });
  }

  const blocking = perImage.find((r) => !r.usable && GATE_BLOCK_REASONS.has(r.reason));
  const gateFailed = Boolean(blocking);
  const blockingReason = blocking?.reason;

  const gateResult = {
    perImage,
    gateFailed,
    blockingReason: blockingReason || null,
    expectedCrop: expectedCrop || null,
    peril: peril || null,
    checkedAt: new Date().toISOString(),
  };

  return { perImage, gateFailed, blockingReason, gateResult };
}

// Optional helper to clear expired entries (not required but keeps map bounded)
function pruneGateCache(): void {
  const now = Date.now();
  for (const [key, entry] of gateCache.entries()) {
    if (now >= entry.expiresAt) gateCache.delete(key);
  }
  // also bound size
  if (gateCache.size > 500) {
    const toDelete = gateCache.size - 500;
    let i = 0;
    for (const key of gateCache.keys()) {
      if (i++ >= toDelete) break;
      gateCache.delete(key);
    }
  }
}

export const REQUIRED_ANGLES = [
  "wide_field",
  "left_context",
  "mid_canopy",
  "right_context",
  "closeup_damage",
] as const;

export type PersistedImageInput = {
  id?: string;
  angleType: string;
  bytes?: Uint8Array;
  present?: boolean;
  contentType?: string;
  sha256?: string;
  lat?: number | null;
  lon?: number | null;
  accuracyM?: number | null;
  capturedAt?: string;
  qualityPassed?: boolean | null;
  blurScore?: number | null;
  lightingScore?: number | null;
};

export type PersistClaimInput = {
  id?: string;
  plotId?: string;
  plotName?: string;
  plotNameHi?: string;
  khasraNumber?: string;
  cropType?: string;
  cropTypeHi?: string;
  cropVariety?: string;
  farmerObservations?: string;
  captureLat?: number | null;
  captureLon?: number | null;
  captureAccuracyM?: number | null;
  gpsStatus?: string | null;
  peril?: string;
  intentId?: string;
  plotLat?: number | null;
  plotLon?: number | null;
  sowingDate?: string | null;
  createdBy?: string | null;
  contextSignals?: ContextSignal[];
  images: PersistedImageInput[];
};

export type WebClaimRow = {
  id: string;
  plot_id?: string | null;
  plot_name?: string | null;
  plot_name_hi?: string | null;
  khasra_number?: string | null;
  crop_type?: string | null;
  crop_type_hi?: string | null;
  crop_variety?: string | null;
  status: string;
  farmer_observations?: string | null;
  missing_angles?: string[] | null;
  recapture_reason?: string | null;
  recapture_reason_hi?: string | null;
  reviewer_notes?: string | null;
  quality_score?: number | null;
  coverage_score?: number | null;
  context_score?: number | null;
  integrity_score?: number | null;
  overall_confidence?: number | null;
  quality_notes?: string | null;
  coverage_notes?: string | null;
  context_notes?: string | null;
  integrity_notes?: string | null;
  crop_identified?: string | null;
  crop_confidence?: number | null;
  disease_detected?: string | null;
  disease_detected_hi?: string | null;
  severity_percentage?: number | null;
  severity_grade?: string | null;
  affected_area_hectares?: number | null;
  estimated_loss_inr?: number | null;
  model_confidence?: number | null;
  model_id?: string | null;
  hf_label?: string | null;
  hf_score?: number | null;
  payout_status?: string | null;
  payout_amount_inr?: number | null;
  capture_lat?: number | null;
  capture_lon?: number | null;
  capture_accuracy_m?: number | null;
  gps_status?: string | null;
  peril?: string | null;
  intent_id?: string | null;
  gate_result?: unknown;
  context_signals?: unknown;
  adaptive_result?: unknown;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  corrected_crop?: string | null;
  corrected_grade?: string | null;
  corrected_severity?: string | null;
  corrected_damage_codes?: string[] | null;
  corrected_affected_area_pct?: number | null;
  corrected_growth_stage?: string | null;
};

export type ReviewerActionInput = {
  action: string;
  notes?: string;
  reason?: string;
  required_angles?: string[];
  actor?: string;
  corrected_crop?: string;
  corrected_grade?: string;
  corrected_severity?: string;
  corrected_damage_codes?: string[];
  corrected_affected_area_pct?: number;
  corrected_growth_stage?: string;
};

export type RecaptureInput = {
  claimId: string;
  images: PersistedImageInput[];
  farmerObservations?: string;
  captureLat?: number | null;
  captureLon?: number | null;
  captureAccuracyM?: number | null;
  gpsStatus?: string | null;
};

export type RecaptureClientImage = {
  angleType: string;
  imageUrl: string;
  sha256?: string;
  lat?: number | null;
  lon?: number | null;
  accuracyM?: number | null;
  lightingScore?: number | null;
  qualityPassed?: boolean | null;
};

export function buildRecaptureSubmitInput(
  claimId: string,
  existing: {
    plotId?: string;
    plotName?: string;
    plotNameHi?: string;
    khasraNumber?: string;
    cropType?: string;
    cropTypeHi?: string;
    cropVariety?: string;
    farmerObservations?: string;
  },
  recapturedImages: RecaptureClientImage[],
) {
  const fresh = recapturedImages.filter((img) => img.imageUrl.startsWith("data:"));
  if (!fresh.length) {
    throw new Error("Recapture requires newly captured images");
  }
  return {
    id: claimId,
    plotId: existing.plotId,
    plotName: existing.plotName,
    plotNameHi: existing.plotNameHi,
    khasraNumber: existing.khasraNumber,
    cropType: existing.cropType,
    cropTypeHi: existing.cropTypeHi,
    cropVariety: existing.cropVariety,
    farmerObservations: existing.farmerObservations,
    captureLat: fresh[0]?.lat,
    captureLon: fresh[0]?.lon,
    captureAccuracyM: fresh[0]?.accuracyM,
    images: fresh.map((img) => ({
      angleType: img.angleType,
      imageDataUrl: img.imageUrl,
      sha256: img.sha256,
      lat: img.lat,
      lon: img.lon,
      accuracyM: img.accuracyM,
      lightingScore: img.lightingScore,
      qualityPassed: img.qualityPassed,
    })),
  };
}

export type WebImageRow = {
  id: string;
  claim_id: string;
  angle_type: string;
  image_url?: string | null;
  storage_path?: string | null;
  captured_at?: string | null;
  lat?: number | null;
  lon?: number | null;
  accuracy_m?: number | null;
  sha256?: string | null;
  quality_passed?: boolean | null;
  blur_score?: number | null;
  lighting_score?: number | null;
  gate_result?: unknown;
};

export type ClaimStore = {
  insertClaim(row: WebClaimRow): Promise<WebClaimRow>;
  updateClaim(id: string, patch: Partial<WebClaimRow>): Promise<void>;
  getClaim(id: string): Promise<WebClaimRow | null>;
  listClaims(): Promise<WebClaimRow[]>;
  insertImages(rows: WebImageRow[]): Promise<void>;
  replaceAngleImages(claimId: string, rows: WebImageRow[]): Promise<void>;
  listImages(claimId: string): Promise<WebImageRow[]>;
  uploadImage(path: string, bytes: Uint8Array, contentType: string): Promise<{ url: string; storagePath: string }>;
  insertReviewAction(row: {
    id: string;
    claim_id: string;
    action: string;
    notes?: string;
    reason?: string;
    required_angles?: string[];
    actor?: string;
  }): Promise<void>;
};

function imageIsPresent(image: PersistedImageInput): boolean {
  if (image.present) return true;
  return Boolean(image.bytes && image.bytes.byteLength > 0);
}

export function workflowGrade(value?: string | null): "A" | "B" | "C" | "U" | null {
  return value === "A" || value === "B" || value === "C" || value === "U" ? value : null;
}

export function imagesAreUnusable(images: PersistedImageInput[]): boolean {
  const measured = images.filter((image) => image.lightingScore != null);
  return measured.length > 0 && measured.every((image) => isUnusableLighting(image.lightingScore));
}

export function unusablePrediction(warnings: string[] = ["image_too_dark"]): HfPrediction {
  return {
    modelId: resolveHfModelId(),
    label: "unusable_or_out_of_domain",
    score: 0,
    predictedCrop: "unknown",
    cropConfidence: 0,
    predictedGrade: "U",
    gradeLabel: "unusable_or_out_of_domain",
    primaryDamage: "unknown",
    plantDiseaseClass: null,
    qualityWarnings: warnings,
    humanReviewRecommendation: "recapture",
    raw: { skipped: true, quality_warnings: warnings },
  };
}

export function sanitizeHfPrediction(prediction: HfPrediction): HfPrediction {
  const warnings = prediction.qualityWarnings || [];
  const unusable =
    prediction.predictedGrade === "U" ||
    warnings.some((item) => /too_dark|no_usable_image|unusable/i.test(item));
  if (!unusable) return prediction;
  return {
    ...prediction,
    predictedCrop: "unknown",
    cropConfidence: 0,
    predictedGrade: "U",
    score: 0,
    primaryDamage: "unknown",
    plantDiseaseClass: null,
    label: prediction.gradeLabel || prediction.label || "unusable_or_out_of_domain",
    qualityWarnings: warnings.length ? warnings : ["unusable_or_out_of_domain"],
  };
}

export function computeEvidencePreview(images: PersistedImageInput[], peril?: string | null) {
  const reqAngles: readonly string[] =
    (peril && ROUTE_CONFIG[peril as Peril]?.requiredAngles) || REQUIRED_ANGLES;
  const present = new Set(images.map((img) => img.angleType));
  const usable = images.filter(imageIsPresent);
  const coverage = Math.min(100, Math.round((usable.length / Math.max(1, reqAngles.length)) * 100));
  const missing = reqAngles.filter((angle) => !present.has(angle));
  const measuredQuality = images
    .map((img) => img.blurScore)
    .filter((value): value is number => typeof value === "number");
  const quality = measuredQuality.length
    ? Math.round(measuredQuality.reduce((a, b) => a + b, 0) / measuredQuality.length)
    : 0;
  const realHashes = images.filter((img) => img.sha256 && /^[a-f0-9]{64}$/i.test(img.sha256)).length;
  const integrity = images.length === 0 ? 0 : Math.round((realHashes / images.length) * 100);
  const gpsOk = images.some((img) => img.lat != null && img.lon != null);
  const context = gpsOk ? 80 : 0;
  const overall = Math.round(0.4 * quality + 0.3 * coverage + 0.2 * context + 0.1 * integrity);
  return {
    qualityScore: quality,
    coverageScore: coverage,
    contextScore: context,
    integrityScore: integrity,
    overallConfidence: overall,
    missingAngles: missing,
    qualityNotes: measuredQuality.length ? "Measured from capture metadata" : "Quality not measured",
    coverageNotes: `${usable.length}/${reqAngles.length} required angles present`,
    contextNotes: gpsOk ? "GPS coordinates present on at least one image" : "GPS unavailable",
    integrityNotes: realHashes ? `${realHashes} SHA-256 digest(s) stored` : "No SHA-256 digest stored",
  };
}

export function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** FK-safe plot id: empty / whitespace must be null, not "". */
export function normalizePlotId(plotId?: string | null): string | null {
  if (plotId == null) return null;
  const trimmed = plotId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requireImageBytes(image: PersistedImageInput, label: string): Uint8Array {
  if (!image.bytes || image.bytes.byteLength === 0) {
    throw new Error(`${label} requires image bytes`);
  }
  return image.bytes;
}

export async function persistFarmerSubmission(
  store: ClaimStore,
  input: PersistClaimInput,
  gate?: PersistedGateOutcome | null,
): Promise<{ claimId: string; claim: WebClaimRow }> {
  if (!input.images.length) {
    throw new Error("At least one image is required");
  }
  if (input.images.some((image) => !image.bytes || image.bytes.byteLength === 0)) {
    throw new Error("Each new image must include bytes");
  }
  const claimId = input.id || newId("claim");
  const preview = computeEvidencePreview(input.images, input.peril);
  const now = new Date().toISOString();
  const claim: WebClaimRow = {
    id: claimId,
    plot_id: normalizePlotId(input.plotId),
    plot_name: input.plotName,
    plot_name_hi: input.plotNameHi,
    khasra_number: input.khasraNumber,
    crop_type: input.cropType,
    crop_type_hi: input.cropTypeHi,
    crop_variety: input.cropVariety,
    status: "under_review",
    farmer_observations: input.farmerObservations || "",
    missing_angles: preview.missingAngles,
    quality_score: preview.qualityScore,
    coverage_score: preview.coverageScore,
    context_score: preview.contextScore,
    integrity_score: preview.integrityScore,
    overall_confidence: preview.overallConfidence,
    quality_notes: preview.qualityNotes,
    coverage_notes: preview.coverageNotes,
    context_notes: preview.contextNotes,
    integrity_notes: preview.integrityNotes,
    capture_lat: input.captureLat ?? null,
    capture_lon: input.captureLon ?? null,
    capture_accuracy_m: input.captureAccuracyM ?? null,
    gps_status: input.gpsStatus ?? null,
    peril: (input.peril as any) || "normal",
    intent_id: (input.intentId as any) || null,
    context_signals: (input.contextSignals as any) ?? null,
    payout_status: "pending_review",
    created_by: input.createdBy ?? null,
    created_at: now,
    updated_at: now,
  };
  // Insert with try/catch to allow missing column gracefully (e.g., before migration)
  try {
    await store.insertClaim(claim);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/context_signals|peril|intent_id|gate_result/i.test(msg)) {
      const { context_signals: _cs, peril: _peril, intent_id: _intent, gate_result: _gate, ...fallback } = claim as any;
      await store.insertClaim(fallback as WebClaimRow);
    } else {
      throw err;
    }
  }

  const imageRows: WebImageRow[] = [];
  for (const image of input.images) {
    const imageId = image.id || newId("img");
    const ext = (image.contentType || "image/jpeg").includes("png") ? "png" : "jpg";
    const path = `${claimId}/${image.angleType}-${imageId}.${ext}`;
    const uploaded = await store.uploadImage(
      path,
      requireImageBytes(image, image.angleType),
      image.contentType || "image/jpeg",
    );
    imageRows.push({
      id: imageId,
      claim_id: claimId,
      angle_type: image.angleType,
      image_url: uploaded.url,
      storage_path: uploaded.storagePath,
      captured_at: image.capturedAt || now,
      lat: image.lat ?? null,
      lon: image.lon ?? null,
      accuracy_m: image.accuracyM ?? null,
      sha256: image.sha256 || null,
      quality_passed: image.qualityPassed ?? null,
      blur_score: image.blurScore ?? null,
      lighting_score: image.lightingScore ?? null,
    });
  }
  await store.insertImages(attachPerImageGate(imageRows, gate?.perImage));
  return { claimId, claim };
}

export async function attachHfPrediction(
  store: ClaimStore,
  claimId: string,
  prediction: HfPrediction,
): Promise<void> {
  const safe = sanitizeHfPrediction(prediction);
  const warningNote = (safe.qualityWarnings || []).join(", ");
  await store.updateClaim(claimId, {
    model_id: safe.modelId,
    hf_label: safe.plantDiseaseClass || safe.label,
    hf_score: safe.score,
    disease_detected: safe.plantDiseaseClass || safe.primaryDamage || safe.label,
    model_confidence: Math.round(safe.score * 1000) / 10,
    crop_identified: safe.predictedCrop || null,
    crop_confidence:
      safe.cropConfidence == null ? null : Math.round(safe.cropConfidence * 1000) / 10,
    severity_grade: safe.predictedGrade || null,
    severity_percentage: null,
    affected_area_hectares: null,
    estimated_loss_inr: null,
    ...(warningNote ? { quality_notes: warningNote } : {}),
    updated_at: new Date().toISOString(),
  });
}

export async function persistAndInfer(
  store: ClaimStore,
  input: PersistClaimInput,
  infer: typeof inferCropDisease = inferCropDisease,
  inferOptions?: { apiToken?: string; fetchImpl?: typeof fetch; spaceUrl?: string },
): Promise<{ claimId: string; prediction: HfPrediction | null; inferError?: string }> {
  // ----- Vision gate (computed BEFORE image persistence so each web_claim_images row can
  // carry its own per-angle gate_result; blocking logic below is unchanged) -----
  let gate: PersistedGateOutcome | null = null;
  try {
    pruneGateCache();
    gate = await gateImagesGate(input.images, input.cropType, input.peril);
  } catch {
    gate = null; // gate errors should not block persistence or inference
  }
  const persisted = await persistFarmerSubmission(store, input, gate);
  // Assemble multi-signal context internally (not via HTTP) and persist to claim with context_signals.
  // Best-effort: do not fail pipeline if context fetch errors or column missing.
  try {
    if (!input.contextSignals || input.contextSignals.length === 0) {
      const lat = input.captureLat ?? input.images.find((i) => i.lat != null)?.lat ?? null;
      const lon = input.captureLon ?? input.images.find((i) => i.lon != null)?.lon ?? null;
      const { assembleContext } = await import("./context/assemble");
      const ctx = await assembleContext({
        lat,
        lon,
        peril: input.peril,
        sowingDate: input.sowingDate ?? undefined,
        plotLat: input.plotLat ?? null,
        plotLon: input.plotLon ?? null,
      });
      if (Array.isArray((ctx as any).signals) && (ctx as any).signals.length) {
        try {
          await store.updateClaim(persisted.claimId, {
            context_signals: (ctx as any).signals as any,
            updated_at: new Date().toISOString(),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!/context_signals/i.test(msg)) throw e;
          // column missing before migration — swallow
        }
      }
    }
  } catch {
    // swallow context assembly errors
  }
  // ----- Vision gate blocking (uses the gate computed early above; cache behavior unchanged) -----
  // If any image Gate usable==false with reason wrong_crop|ai_generated|too_dark|not_crop,
  // then set claim's gate_result JSON and return unusablePrediction.
  try {
    if (gate && gate.gateFailed) {
      const reason = gate.blockingReason || "unusable";
      const gatePayload = gate.gateResult;
      try {
        await store.updateClaim(persisted.claimId, {
          gate_result: gatePayload as any,
          quality_notes: `Gate rejected: ${reason}`,
          overall_confidence: 0,
          updated_at: new Date().toISOString(),
        } as any);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/gate_result/i.test(msg)) throw e;
      }
      const prediction = unusablePrediction([reason]);
      await attachHfPrediction(store, persisted.claimId, prediction);
      // re-ensure gate_result + overallConfidence 0 after attach (attach overwrites quality_notes)
      try {
        await store.updateClaim(persisted.claimId, {
          gate_result: gatePayload as any,
          quality_notes: `Gate rejected: ${reason}`,
          overall_confidence: 0,
        } as any);
      } catch {}
      return { claimId: persisted.claimId, prediction };
    }
    // Gate passed — persist successful gate_result for audit trail (best-effort)
    if (gate && gate.perImage.length) {
      try {
        await store.updateClaim(persisted.claimId, {
          gate_result: gate.gateResult as any,
          updated_at: new Date().toISOString(),
        } as any);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/gate_result/i.test(msg)) throw e;
      }
    }
  } catch {
    // gate errors should not block inference — fallback to HF infer
  }
  // ----- Adaptive engine: compute level/nextStep and persist for reviewer queue -----
  try {
    const previewForAdaptive = computeEvidencePreview(input.images, input.peril);
    const storedSignals = (() => {
      const stored = (persisted.claim as any).context_signals;
      if (Array.isArray(stored)) return stored as ContextSignal[];
      return (input.contextSignals || []) as ContextSignal[];
    })();
    const adaptive: AdaptiveResult = adaptiveConfidence({
      quality: previewForAdaptive.qualityScore,
      coverage: previewForAdaptive.coverageScore,
      context: previewForAdaptive.contextScore,
      integrity: previewForAdaptive.integrityScore,
      overall: previewForAdaptive.overallConfidence,
      peril: (input.peril as any) || "normal",
      signals: storedSignals,
      missingAngles: previewForAdaptive.missingAngles,
    });
    // Confidence delta vs. the claim as stored before this write (meaningful on re-submission).
    let prevConfidence: number | null = null;
    try {
      const existing = await store.getClaim(persisted.claimId);
      prevConfidence = existing?.overall_confidence ?? null;
    } catch {}
    const adaptivePayload = {
      ...adaptive,
      previousConfidence: prevConfidence,
      ...(prevConfidence != null
        ? { confidence_delta: Math.round((previewForAdaptive.overallConfidence - prevConfidence) * 10) / 10 }
        : {}),
    };
    if (adaptive.nextStep === "request_missing") {
      // Auto recapture request: the adaptive engine detected an evidence gap — route the
      // claim straight to needs_recapture instead of waiting in the reviewer queue.
      // (escalate_to_human / proceed stay under_review.)
      const autoPatch = {
        status: "needs_recapture",
        missing_angles:
          adaptive.missingAngles.length > 0 ? adaptive.missingAngles : previewForAdaptive.missingAngles,
        recapture_reason: adaptive.reasons[0] || "Automated evidence gap detected",
        recapture_reason_hi: adaptive.reasonsHi[0] || null,
        adaptive_result: adaptivePayload,
        updated_at: new Date().toISOString(),
      };
      try {
        await store.updateClaim(persisted.claimId, autoPatch as any);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/adaptive_result|recapture_reason/i.test(msg)) throw e;
        const {
          adaptive_result: _ar,
          recapture_reason: _rr,
          recapture_reason_hi: _rh,
          ...fallback
        } = autoPatch as any;
        await store.updateClaim(persisted.claimId, fallback as any);
      }
    } else {
      try {
        await store.updateClaim(persisted.claimId, {
          adaptive_result: adaptivePayload as any,
          updated_at: new Date().toISOString(),
        } as any);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/adaptive_result/i.test(msg)) throw e;
      }
    }
  } catch {
    // adaptive is best-effort; never block pipeline
  }
  if (imagesAreUnusable(input.images)) {
    const prediction = unusablePrediction();
    await attachHfPrediction(store, persisted.claimId, prediction);
    return { claimId: persisted.claimId, prediction };
  }
  const closeup =
    input.images.find((img) => img.angleType === "closeup_damage") || input.images[0];
  try {
    const prediction = await infer({
      imageBytes: requireImageBytes(closeup, closeup.angleType),
      expectedCrop: input.cropType,
      angleType: closeup.angleType,
      extraImages: input.images.map((image) => ({
        angleType: image.angleType,
        bytes: requireImageBytes(image, image.angleType),
      })),
      apiToken: inferOptions?.apiToken,
      fetchImpl: inferOptions?.fetchImpl,
      spaceUrl: inferOptions?.spaceUrl,
    });
    await attachHfPrediction(store, persisted.claimId, prediction);
    return { claimId: persisted.claimId, prediction };
  } catch (error) {
    return {
      claimId: persisted.claimId,
      prediction: null,
      inferError: error instanceof Error ? error.message : "Inference failed",
    };
  }
}

function rowToPreviewInput(row: WebImageRow): PersistedImageInput {
  return {
    angleType: row.angle_type,
    present: Boolean(row.storage_path || row.image_url),
    sha256: row.sha256 || undefined,
    lat: row.lat,
    lon: row.lon,
    accuracyM: row.accuracy_m,
    blurScore: row.blur_score,
    lightingScore: row.lighting_score,
    qualityPassed: row.quality_passed,
  };
}

async function uploadNewImages(
  store: ClaimStore,
  claimId: string,
  images: PersistedImageInput[],
  perImageGate?: Array<GateResult & { angleType: string }> | null,
): Promise<WebImageRow[]> {
  const now = new Date().toISOString();
  const imageRows: WebImageRow[] = [];
  for (const image of images) {
    const imageId = image.id || newId("img");
    const ext = (image.contentType || "image/jpeg").includes("png") ? "png" : "jpg";
    const path = `${claimId}/${image.angleType}-${imageId}.${ext}`;
    const uploaded = await store.uploadImage(
      path,
      requireImageBytes(image, image.angleType),
      image.contentType || "image/jpeg",
    );
    imageRows.push({
      id: imageId,
      claim_id: claimId,
      angle_type: image.angleType,
      image_url: uploaded.url,
      storage_path: uploaded.storagePath,
      captured_at: image.capturedAt || now,
      lat: image.lat ?? null,
      lon: image.lon ?? null,
      accuracy_m: image.accuracyM ?? null,
      sha256: image.sha256 || null,
      quality_passed: image.qualityPassed ?? null,
      blur_score: image.blurScore ?? null,
      lighting_score: image.lightingScore ?? null,
    });
  }
  return attachPerImageGate(imageRows, perImageGate);
}

export async function recaptureAndInfer(
  store: ClaimStore,
  input: RecaptureInput,
  infer: typeof inferCropDisease = inferCropDisease,
  inferOptions?: { apiToken?: string; fetchImpl?: typeof fetch; spaceUrl?: string },
): Promise<{ claimId: string; prediction: HfPrediction | null; inferError?: string }> {
  if (!input.images.length) {
    throw new Error("At least one image is required");
  }
  if (input.images.some((image) => !image.bytes || image.bytes.byteLength === 0)) {
    throw new Error("Recapture images must include bytes");
  }
  const existing = await store.getClaim(input.claimId);
  if (!existing) {
    throw new Error("Claim not found");
  }
  // ----- Vision gate for recapture (computed BEFORE image persistence so each new
  // web_claim_images row carries its own per-angle gate_result) -----
  let gate: PersistedGateOutcome | null = null;
  try {
    pruneGateCache();
    gate = await gateImagesGate(input.images, existing.crop_type || undefined, (existing as any).peril || undefined);
  } catch {
    gate = null; // gate errors should not block persistence or inference
  }
  const uploaded = await uploadNewImages(store, input.claimId, input.images, gate?.perImage);
  await store.replaceAngleImages(input.claimId, uploaded);
  const merged = await store.listImages(input.claimId);
  const preview = computeEvidencePreview(merged.map(rowToPreviewInput), (existing as any).peril);
  const now = new Date().toISOString();
  await store.updateClaim(input.claimId, {
    status: "under_review",
    farmer_observations: input.farmerObservations ?? existing.farmer_observations,
    missing_angles: preview.missingAngles,
    recapture_reason: null,
    quality_score: preview.qualityScore,
    coverage_score: preview.coverageScore,
    context_score: preview.contextScore,
    integrity_score: preview.integrityScore,
    overall_confidence: preview.overallConfidence,
    quality_notes: preview.qualityNotes,
    coverage_notes: preview.coverageNotes,
    context_notes: preview.contextNotes,
    integrity_notes: preview.integrityNotes,
    capture_lat: input.captureLat ?? existing.capture_lat,
    capture_lon: input.captureLon ?? existing.capture_lon,
    capture_accuracy_m: input.captureAccuracyM ?? existing.capture_accuracy_m,
    gps_status: input.gpsStatus ?? existing.gps_status,
    payout_status: existing.payout_status || "pending_review",
    updated_at: now,
  });

  // ----- Vision gate blocking for recapture (uses the gate computed early above) -----
  try {
    if (gate && gate.gateFailed) {
      const reason = gate.blockingReason || "unusable";
      const gatePayload = gate.gateResult;
      try {
        await store.updateClaim(input.claimId, {
          gate_result: gatePayload as any,
          quality_notes: `Gate rejected: ${reason}`,
          overall_confidence: 0,
          updated_at: new Date().toISOString(),
        } as any);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/gate_result/i.test(msg)) throw e;
      }
      const prediction = unusablePrediction([reason]);
      await attachHfPrediction(store, input.claimId, prediction);
      try {
        await store.updateClaim(input.claimId, {
          gate_result: gatePayload as any,
          quality_notes: `Gate rejected: ${reason}`,
          overall_confidence: 0,
        } as any);
      } catch {}
      return { claimId: input.claimId, prediction };
    }
    if (gate && gate.perImage.length) {
      try {
        await store.updateClaim(input.claimId, {
          gate_result: gate.gateResult as any,
          updated_at: new Date().toISOString(),
        } as any);
      } catch {}
    }
  } catch {
    // gate errors should not block inference
  }

  // ----- Adaptive engine for recapture (same policy as first submission) -----
  try {
    const storedSignals = (() => {
      const stored = (existing as any).context_signals;
      if (Array.isArray(stored)) return stored as ContextSignal[];
      return [];
    })();
    const adaptive: AdaptiveResult = adaptiveConfidence({
      quality: preview.qualityScore,
      coverage: preview.coverageScore,
      context: preview.contextScore,
      integrity: preview.integrityScore,
      overall: preview.overallConfidence,
      peril: ((existing as any).peril as any) || "normal",
      signals: storedSignals as ContextSignal[],
      missingAngles: preview.missingAngles,
    });
    // prev_confidence = the claim's confidence BEFORE this recapture was applied.
    const prevConfidence = existing.overall_confidence ?? null;
    const adaptivePayload = {
      ...adaptive,
      previousConfidence: prevConfidence,
      ...(prevConfidence != null
        ? { confidence_delta: Math.round((preview.overallConfidence - prevConfidence) * 10) / 10 }
        : {}),
    };
    try {
      await store.updateClaim(input.claimId, {
        adaptive_result: adaptivePayload as any,
        updated_at: new Date().toISOString(),
      } as any);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/adaptive_result/i.test(msg)) throw e;
    }
  } catch {
    // adaptive is best-effort; never block pipeline
  }

  if (imagesAreUnusable(input.images)) {
    const prediction = unusablePrediction();
    await attachHfPrediction(store, input.claimId, prediction);
    return { claimId: input.claimId, prediction };
  }

  const closeup =
    input.images.find((img) => img.angleType === "closeup_damage") || input.images[0];
  try {
    const prediction = await infer({
      imageBytes: requireImageBytes(closeup, closeup.angleType),
      expectedCrop: existing.crop_type || undefined,
      angleType: closeup.angleType,
      extraImages: input.images.map((image) => ({
        angleType: image.angleType,
        bytes: requireImageBytes(image, image.angleType),
      })),
      apiToken: inferOptions?.apiToken,
      fetchImpl: inferOptions?.fetchImpl,
      spaceUrl: inferOptions?.spaceUrl,
    });
    await attachHfPrediction(store, input.claimId, prediction);
    return { claimId: input.claimId, prediction };
  } catch (error) {
    return {
      claimId: input.claimId,
      prediction: null,
      inferError: error instanceof Error ? error.message : "Inference failed",
    };
  }
}

export function claimToSubmission(claim: WebClaimRow, images: WebImageRow[]): Submission {
  return {
    id: claim.id,
    crop_cycle_id: claim.plot_id || claim.id,
    status: claim.status,
    capture_lat: claim.capture_lat,
    capture_lon: claim.capture_lon,
    capture_accuracy_m: claim.capture_accuracy_m,
    farmer_observations: claim.farmer_observations,
    severity: claim.severity_grade,
    final_assessment_notes: claim.reviewer_notes,
    peril: (claim as any).peril || null,
    intent_id: (claim as any).intent_id || null,
    gate_result: (claim as any).gate_result ?? null,
    context_signals: (claim as any).context_signals ?? null,
    contextSignals: (claim as any).context_signals ?? null,
    adaptive_result: (claim as any).adaptive_result ?? null,
    images: images.map((img) => ({
      id: img.id,
      angle_type: img.angle_type,
      upload_status: img.storage_path || img.image_url ? "uploaded" : "pending",
      download_url: img.image_url,
      sha256: img.sha256,
      quality_flags: {
        quality_passed: img.quality_passed,
        blur_score: img.blur_score,
        lighting_score: img.lighting_score,
      },
    })),
    latest_prediction: claim.hf_label
      ? {
          model_version: claim.model_id || "",
          adapter_type: "crop_health_v4",
          is_production_validated: false,
          predicted_crop: workflowGrade(claim.severity_grade) === "U" ? "unknown" : claim.crop_identified,
          crop_confidence:
            workflowGrade(claim.severity_grade) === "U" ? 0 : (claim.crop_confidence ?? 0) / 100,
          predicted_grade: workflowGrade(claim.severity_grade),
          grade_label: workflowGrade(claim.severity_grade)
            ? workflowGrade(claim.severity_grade) === "U"
              ? "unusable_or_out_of_domain"
              : "workflow_bucket"
            : null,
          primary_damage:
            workflowGrade(claim.severity_grade) === "U"
              ? "unknown"
              : claim.disease_detected || claim.hf_label,
          severity: claim.corrected_severity ?? null,
          overall_confidence: workflowGrade(claim.severity_grade) === "U" ? 0 : claim.hf_score ?? 0,
          affected_area_pct: claim.corrected_affected_area_pct ?? null,
          quality_warnings:
            workflowGrade(claim.severity_grade) === "U"
              ? [claim.quality_notes || "unusable_or_out_of_domain"]
              : [],
          anomaly_flags: [],
          human_review_recommendation:
            workflowGrade(claim.severity_grade) === "U" ? "recapture" : "Review recommended",
          explanation: {
            hf_label: claim.hf_label,
            hf_score: claim.hf_score,
            model_id: claim.model_id,
            predicted_grade: claim.severity_grade,
            grade_is_workflow_bucket: true,
          },
        }
      : null,
    latest_evaluation: {
      evaluation_version: "evidence-confidence-v1",
      quality: { score: claim.quality_score ?? 0, available: claim.quality_score != null },
      coverage: {
        score: claim.coverage_score ?? 0,
        available: true,
        details: { missing_views: claim.missing_angles || [] },
      },
      context: { score: claim.context_score ?? 0, available: true },
      integrity: { score: claim.integrity_score ?? 0, available: true },
      confidence: {
        final: claim.overall_confidence ?? 0,
        threshold: 85,
        quality: claim.quality_score ?? 0,
        coverage: claim.coverage_score ?? 0,
        context: claim.context_score ?? 0,
        integrity: claim.integrity_score ?? 0,
      },
      confidence_delta:
        (claim.adaptive_result as any)?.confidence_delta ??
        (claim.adaptive_result as any)?.delta ??
        null,
      previous_confidence: (claim.adaptive_result as any)?.previousConfidence ?? null,
      uncertainty: {
        present: (claim.overall_confidence ?? 0) < 85,
        type: (claim.missing_angles || []).length ? "coverage" : "none",
        severity: "medium",
        reasons: claim.missing_angles?.length ? [`Missing: ${claim.missing_angles.join(", ")}`] : [],
        recommended_action: (claim.missing_angles || []).length
          ? "request_specific_evidence"
          : "none",
      },
    },
  };
}

export async function listReviewerQueue(store: ClaimStore): Promise<Submission[]> {
  const claims = await store.listClaims();
  const items: Submission[] = [];
  for (const claim of claims) {
    const images = await store.listImages(claim.id);
    items.push(claimToSubmission(claim, images));
  }
  return items;
}

export async function getReviewerClaim(store: ClaimStore, id: string): Promise<Submission | null> {
  const claim = await store.getClaim(id);
  if (!claim) return null;
  const images = await store.listImages(id);
  return claimToSubmission(claim, images);
}

export async function applyReviewerAction(
  store: ClaimStore,
  id: string,
  payload: ReviewerActionInput,
): Promise<Submission> {
  const existing = await store.getClaim(id);
  if (!existing) {
    throw new Error("Claim not found");
  }
  let status = existing.status;
  if (payload.action === "request_recapture") status = "needs_recapture";
  else if (payload.action === "accept" || payload.action === "correct") status = "verified";
  else if (payload.action === "physical_inspection") status = "physical_inspection";
  else if (payload.action === "reject") status = "rejected";

  const patch: Partial<WebClaimRow> = {
    status,
    reviewer_notes: payload.notes || existing.reviewer_notes,
    recapture_reason:
      payload.action === "request_recapture"
        ? payload.reason || payload.notes
        : existing.recapture_reason,
    missing_angles:
      payload.action === "request_recapture"
        ? payload.required_angles || existing.missing_angles
        : payload.action === "accept" || payload.action === "correct"
          ? []
          : existing.missing_angles,
    updated_at: new Date().toISOString(),
  };

  if (payload.action === "correct") {
    if (payload.corrected_crop) {
      patch.corrected_crop = payload.corrected_crop;
      patch.crop_identified = payload.corrected_crop;
    }
    if (payload.corrected_grade) {
      patch.corrected_grade = payload.corrected_grade;
      patch.severity_grade = payload.corrected_grade;
    }
    if (payload.corrected_severity) {
      patch.corrected_severity = payload.corrected_severity;
    }
    if (payload.corrected_damage_codes?.length) {
      patch.corrected_damage_codes = payload.corrected_damage_codes;
      patch.disease_detected = payload.corrected_damage_codes[0];
    }
    if (payload.corrected_affected_area_pct != null && Number.isFinite(payload.corrected_affected_area_pct)) {
      patch.corrected_affected_area_pct = payload.corrected_affected_area_pct;
      patch.severity_percentage = payload.corrected_affected_area_pct;
    }
    if (payload.corrected_growth_stage) {
      patch.corrected_growth_stage = payload.corrected_growth_stage;
    }
  }

  if (payload.action === "override_gate") {
    // Reviewer explicitly marks gate-blocked evidence as usable — keep status unchanged,
    // stamp the override into gate_result and clear the blocking quality note.
    const existingGate = ((existing as any).gate_result ?? {}) as Record<string, unknown>;
    const sanitizedReason = String(payload.reason || payload.notes || "")
      .trim()
      .slice(0, 500);
    (patch as any).gate_result = {
      ...(existingGate && typeof existingGate === "object" && !Array.isArray(existingGate)
        ? existingGate
        : {}),
      overridden: true,
      overriddenBy: payload.actor || "reviewer",
      overriddenAt: new Date().toISOString(),
      ...(sanitizedReason ? { overrideReason: sanitizedReason } : {}),
    };
    patch.quality_notes = existing.quality_notes
      ? `${existing.quality_notes} (gate overridden)`
      : "(gate overridden)";
  }

  try {
    await store.updateClaim(id, patch);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (payload.action === "override_gate" && /gate_result/i.test(msg)) {
      // legacy DB without web_claims.gate_result — persist everything except the gate blob
      const { gate_result: _g, ...rest } = patch as any;
      await store.updateClaim(id, rest as Partial<WebClaimRow>);
    } else {
      throw err;
    }
  }
  await store.insertReviewAction({
    id: newId("act"),
    claim_id: id,
    action: payload.action,
    notes: payload.notes,
    reason: payload.reason,
    required_angles: payload.required_angles,
    actor: payload.actor || "reviewer",
  });
  const updated = await getReviewerClaim(store, id);
  if (!updated) throw new Error("Claim missing after update");
  return updated;
}

export function createMemoryClaimStore(): ClaimStore & {
  claims: Map<string, WebClaimRow>;
  images: Map<string, WebImageRow[]>;
  blobs: Map<string, Uint8Array>;
  reviewActions: Array<{
    id: string;
    claim_id: string;
    action: string;
    notes?: string;
    reason?: string;
    required_angles?: string[];
    actor?: string;
  }>;
} {
  const claims = new Map<string, WebClaimRow>();
  const images = new Map<string, WebImageRow[]>();
  const blobs = new Map<string, Uint8Array>();
  const reviewActions: Array<{
    id: string;
    claim_id: string;
    action: string;
    notes?: string;
    reason?: string;
    required_angles?: string[];
    actor?: string;
  }> = [];
  return {
    claims,
    images,
    blobs,
    reviewActions,
    async insertClaim(row) {
      claims.set(row.id, { ...row });
      return row;
    },
    async updateClaim(id, patch) {
      const current = claims.get(id);
      if (!current) throw new Error("Claim not found");
      claims.set(id, { ...current, ...patch });
    },
    async getClaim(id) {
      return claims.get(id) ?? null;
    },
    async listClaims() {
      return [...claims.values()].sort((a, b) =>
        String(b.created_at).localeCompare(String(a.created_at)),
      );
    },
    async insertImages(rows) {
      for (const row of rows) {
        const list = images.get(row.claim_id) || [];
        list.push(row);
        images.set(row.claim_id, list);
      }
    },
    async replaceAngleImages(claimId, rows) {
      const existing = images.get(claimId) || [];
      const replaced = new Set(rows.map((row) => row.angle_type));
      images.set(claimId, [...existing.filter((row) => !replaced.has(row.angle_type)), ...rows]);
    },
    async listImages(claimId) {
      return images.get(claimId) || [];
    },
    async uploadImage(path, bytes) {
      blobs.set(path, bytes);
      return { url: `memory://${path}`, storagePath: path };
    },
    async insertReviewAction(row) {
      reviewActions.push({ ...row });
    },
  };
}
