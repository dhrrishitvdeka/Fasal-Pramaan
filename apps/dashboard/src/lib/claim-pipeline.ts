import { inferCropDisease, geminiVisionModel, type HfPrediction } from "./gemini-analyze";
import { computeAngleCoverage, isRealSha256, isUnusableLighting } from "./evidence";
import type { Submission } from "./api";
import { heuristicGate, geminiGate, type GateResult } from "./vision/gate-shared";
import type { ContextSignal } from "./context/types";
import { adaptiveConfidence, type AdaptiveResult } from "./context/adaptive-engine";
import { ROUTE_CONFIG, type Peril } from "./claim-routing";

// ---------- Vision gate helpers (shared with /api/vision/gate) ----------

const GATE_CACHE_TTL_MS = 10 * 60 * 1000;
const gateCache = new Map<string, { result: GateResult; expiresAt: number }>();

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

  const meta = {
    lat: input.lat,
    lon: input.lon,
    accuracyM: input.accuracyM,
    capturedAt: input.capturedAt,
    facing: input.facing,
    dimensions: input.dimensions,
    cvAnalysis: {
      cropScore: input.cropScore,
      greenPct: input.greenPct,
      luma: input.luma ?? null,
      blurScore: input.blurScore,
      hintCode: input.qualityPassed === false ? "crop_not_detected" : input.qualityPassed ? "ok" : undefined,
    },
    sha256: input.sha256,
    farmerObservation: input.farmerObservation,
  };

  // Try Gemini first with full image + metadata context; reuse same prompt via shared geminiGate.
  try {
    const gemini = await geminiGate(dataUrl, input.angleType || "closeup_damage", expectedCrop, peril, meta);
    if (gemini) {
      if (isRealSha) gateCache.set(sha, { result: gemini, expiresAt: Date.now() + GATE_CACHE_TTL_MS });
      return gemini;
    }
  } catch {
    // fall through to heuristic
  }

  const heuristic = heuristicGate(dataUrl, expectedCrop, peril, meta);
  const result: GateResult = { ...heuristic, fallback: true };
  if (isRealSha) gateCache.set(sha, { result, expiresAt: Date.now() + GATE_CACHE_TTL_MS });
  return result;
}

export type PersistedGateOutcome = {
  perImage: Array<GateResult & { angleType: string }>;
  gateFailed: boolean;
  blockingReason?: string;
  gateResult: unknown;
  /** True when the gate itself threw — the claim must fail CLOSED (no ungated inference). */
  gateUnavailable?: boolean;
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

  const perImage: Array<GateResult & { angleType: string }> = [];
  for (const img of inputImages) {
    const res = await gateSingleImage(img, expectedCrop, peril);
    perImage.push({ ...res, angleType: img.angleType });
  }

  const blocking = perImage.find((r) => !r.usable);
  const gateFailed = perImage.some((r) => !r.usable);
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

/**
 * Run the vision gate, failing CLOSED on errors (B1): a thrown gate becomes a
 * terminal `gate_unavailable` outcome instead of silently passing the claim through.
 * A successful run (including heuristic fallback when Gemini is unconfigured) is
 * returned unchanged — only genuine errors are terminal.
 */
async function runVisionGate(
  images: PersistedImageInput[],
  expectedCrop?: string,
  peril?: string,
): Promise<PersistedGateOutcome> {
  try {
    pruneGateCache();
    return await gateImagesGate(images, expectedCrop, peril);
  } catch (error) {
    const reason = "gate_unavailable";
    return {
      perImage: [],
      gateFailed: true,
      blockingReason: reason,
      gateResult: {
        perImage: [],
        gateFailed: true,
        blockingReason: reason,
        error: error instanceof Error ? error.message : String(error),
        checkedAt: new Date().toISOString(),
      },
      gateUnavailable: true,
    };
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
  luma?: number | null;
  greenPct?: number | null;
  cropScore?: number | null;
  facing?: string | null;
  dimensions?: { width: number; height: number } | null;
  farmerObservation?: string | null;
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
  sowing_date?: string | null;
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
  inference_status?: "pending" | "complete" | "failed" | null;
  inference_error?: string | null;
  inference_started_at?: string | null;
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
  blurScore?: number | null;
  greenPct?: number | null;
  luma?: number | null;
  cropScore?: number | null;
  facing?: string | null;
  dimensions?: { width: number; height: number } | null;
  timestamp?: string | null;
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
      blurScore: img.blurScore,
      greenPct: img.greenPct,
      luma: img.luma,
      cropScore: img.cropScore,
      facing: img.facing,
      dimensions: img.dimensions,
      capturedAt: img.timestamp || undefined,
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

export type ClaimUpdateOptions = {
  /** Compare-and-swap: fail if the stored status is no longer this value. */
  expectedStatus?: string;
};

export type ClaimStore = {
  insertClaim(row: WebClaimRow): Promise<WebClaimRow>;
  deleteClaim?(id: string): Promise<void>;
  updateClaim(id: string, patch: Partial<WebClaimRow>, opts?: ClaimUpdateOptions): Promise<void>;
  getClaim(id: string): Promise<WebClaimRow | null>;
  listClaims(): Promise<WebClaimRow[]>;
  insertImages(rows: WebImageRow[]): Promise<void>;
  replaceAngleImages(claimId: string, rows: WebImageRow[]): Promise<void>;
  listImages(claimId: string): Promise<WebImageRow[]>;
  uploadImage(path: string, bytes: Uint8Array, contentType: string): Promise<{ url: string; storagePath: string }>;
  downloadImage(path: string): Promise<Uint8Array>;
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
    modelId: geminiVisionModel(),
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
  const angleCoverage = computeAngleCoverage(
    images.map((img) => ({
      angleType: img.angleType,
      present: imageIsPresent(img),
      qualityPassed:
        img.qualityPassed == null ? undefined : img.qualityPassed === true ? true : false,
      blurScore: img.blurScore,
      lightingScore: img.lightingScore,
      sha256: img.sha256,
      lat: img.lat,
      lon: img.lon,
      accuracyM: img.accuracyM,
    })),
    reqAngles,
  );
  const coverage = Math.min(
    100,
    Math.round((angleCoverage.covered / Math.max(1, angleCoverage.total)) * 100),
  );
  const missing = angleCoverage.missing;
  const qualityParts = images
    .map((img) => {
      const parts = [img.blurScore, img.lightingScore].filter((n): n is number => typeof n === "number");
      if (!parts.length) return null;
      return parts.reduce((a, b) => a + b, 0) / parts.length;
    })
    .filter((value): value is number => typeof value === "number");
  const quality = qualityParts.length
    ? Math.round(qualityParts.reduce((a, b) => a + b, 0) / qualityParts.length)
    : 0;
  const realHashes = images.filter((img) => img.sha256 && isRealSha256(img.sha256)).length;
  const integrity = images.length === 0 ? 0 : Math.round((realHashes / images.length) * 100);
  const gpsOk = images.filter((img) => img.lat != null && img.lon != null);
  const context = images.length === 0 ? 0 : Math.round((gpsOk.length / images.length) * 100);
  const overall = Math.round(0.4 * quality + 0.3 * coverage + 0.2 * context + 0.1 * integrity);
  return {
    qualityScore: quality,
    coverageScore: coverage,
    contextScore: context,
    integrityScore: integrity,
    overallConfidence: overall,
    missingAngles: missing,
    qualityNotes: qualityParts.length ? `Measured blur/lighting on ${qualityParts.length} image(s)` : "Quality not measured",
    coverageNotes: `${angleCoverage.covered}/${angleCoverage.total} required angles present`,
    contextNotes:
      gpsOk.length === images.length && images.length > 0
        ? "GPS coordinates present on all images"
        : gpsOk.length > 0
          ? `GPS coordinates present on ${gpsOk.length}/${images.length} images`
          : "GPS unavailable",
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

/** Sanitize client-controlled strings before they become Storage object keys. */
export function safeStorageSegment(value: string, fallback: string): string {
  const last = String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop() || "";
  const stripped = last.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 80);
  return stripped || fallback;
}

function isDuplicateKeyError(message: string): boolean {
  return /duplicate|unique|already exists|23505/i.test(message);
}

const REVIEWER_LOCKED_STATUSES = new Set(["verified", "rejected"]);
const RECAPTURE_ALLOWED_STATUSES = new Set(["needs_recapture"]);
const INFERENCE_RETRY_AFTER_MS = 8_000;

function isReviewerLocked(claim: WebClaimRow): boolean {
  return (
    REVIEWER_LOCKED_STATUSES.has(claim.status) ||
    Boolean(claim.corrected_grade || claim.corrected_crop)
  );
}

/** Upload every frame and build persisted image rows (shared by submit + recapture paths). */
async function buildImageRows(
  store: ClaimStore,
  claimId: string,
  images: PersistedImageInput[],
  nowIso: string,
  perImageGate?: Array<GateResult & { angleType: string }> | null,
): Promise<WebImageRow[]> {
  const imageRows: WebImageRow[] = [];
  for (const image of images) {
    const imageId = safeStorageSegment(image.id || newId("img"), "img");
    const ext = (image.contentType || "image/jpeg").includes("png") ? "png" : "jpg";
    const path = `${safeStorageSegment(claimId, "claim")}/${safeStorageSegment(image.angleType, "angle")}-${imageId}.${ext}`;
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
      captured_at: image.capturedAt || nowIso,
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
  if (input.id) {
    const existing = await store.getClaim(claimId);
    if (existing) {
      throw new Error("Claim already exists");
    }
  }
  const preview = computeEvidencePreview(input.images, input.peril);
  const now = new Date().toISOString();
  // Upload blobs BEFORE inserting the claim so a mid-loop failure cannot leave
  // an imageless row. Orphaned storage objects are preferable to lost evidence.
  const imageRows = await buildImageRows(store, claimId, input.images, now, gate?.perImage);
  const claim: WebClaimRow = {
    id: claimId,
    plot_id: normalizePlotId(input.plotId),
    plot_name: input.plotName,
    plot_name_hi: input.plotNameHi,
    khasra_number: input.khasraNumber,
    crop_type: input.cropType,
    crop_type_hi: input.cropTypeHi,
    crop_variety: input.cropVariety,
    sowing_date: input.sowingDate ?? null,
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
    inference_status: "pending",
    inference_started_at: now,
  };
  // Insert with try/catch to allow missing column gracefully (e.g., before migration)
  try {
    await store.insertClaim(claim);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isDuplicateKeyError(msg)) {
      throw new Error("Claim already exists");
    }
    if (/context_signals|peril|intent_id|gate_result|sowing_date|inference_/i.test(msg)) {
      const {
        context_signals: _cs,
        peril: _peril,
        intent_id: _intent,
        gate_result: _gate,
        sowing_date: _sowing,
        inference_status: _inf,
        inference_error: _inferr,
        inference_started_at: _infat,
        ...fallback
      } = claim as any;
      try {
        await store.insertClaim(fallback as WebClaimRow);
      } catch (inner) {
        const innerMsg = inner instanceof Error ? inner.message : String(inner);
        if (isDuplicateKeyError(innerMsg)) throw new Error("Claim already exists");
        throw inner;
      }
    } else {
      throw err;
    }
  }

  try {
    await store.insertImages(imageRows);
  } catch (imgErr) {
    if (typeof store.deleteClaim === "function") {
      try {
        await store.deleteClaim(claimId);
      } catch {
        // best effort rollback
      }
    }
    throw imgErr;
  }
  return { claimId, claim };
}

export async function attachHfPrediction(
  store: ClaimStore,
  claimId: string,
  prediction: HfPrediction,
): Promise<void> {
  const current = await store.getClaim(claimId);
  if (!current) throw new Error("Claim not found");
  const safe = sanitizeHfPrediction(prediction);
  const warningNote = (safe.qualityWarnings || []).join(", ");
  const existingGate =
    current.gate_result && typeof current.gate_result === "object" && !Array.isArray(current.gate_result)
      ? (current.gate_result as Record<string, unknown>)
      : {};
  const geminiAnalysis = {
    adapter_type: "gemini_vision",
    model_id: safe.modelId,
    reasoning: safe.reasoning || "",
    visual_findings: safe.visualFindings || "",
    authenticity: safe.authenticity || null,
    per_image: safe.perImage || [],
    severity: safe.severity ?? null,
    affected_area_pct: safe.affectedAreaPct ?? null,
    growth_stage: safe.growthStage ?? null,
    peril_match: safe.perilMatch ?? null,
    predicted_grade: safe.predictedGrade,
    predicted_crop: safe.predictedCrop,
    primary_damage: safe.primaryDamage,
    grade_label: safe.gradeLabel,
  };
  const modelPatch: Partial<WebClaimRow> = {
    model_id: safe.modelId,
    hf_label: safe.plantDiseaseClass || safe.label,
    hf_score: safe.score,
    model_confidence: Math.round(safe.score * 1000) / 10,
    crop_confidence:
      safe.cropConfidence == null ? null : Math.round(safe.cropConfidence * 1000) / 10,
    inference_status: "complete",
    inference_error: null,
    gate_result: { ...existingGate, geminiAnalysis },
    updated_at: new Date().toISOString(),
  };
  // Late inference must never clobber a reviewer's accept/correct/reject.
  if (isReviewerLocked(current)) {
    await store.updateClaim(claimId, modelPatch);
    return;
  }
  await store.updateClaim(
    claimId,
    {
      ...modelPatch,
      disease_detected: safe.plantDiseaseClass || safe.primaryDamage || safe.label,
      crop_identified: safe.predictedCrop || null,
      severity_grade: safe.predictedGrade || null,
      severity_percentage: safe.affectedAreaPct ?? null,
      affected_area_hectares: null,
      estimated_loss_inr: null,
      ...(warningNote ? { quality_notes: warningNote } : {}),
      ...(safe.reasoning ? { context_notes: safe.reasoning.slice(0, 1500) } : {}),
    },
    { expectedStatus: current.status },
  );
}

/** Stamp a blocking gate verdict onto the claim (kept under_review so a reviewer can adjudicate). */
async function persistGateRejection(
  store: ClaimStore,
  claimId: string,
  gatePayload: unknown,
  reason: string,
): Promise<void> {
  try {
    await store.updateClaim(claimId, {
      status: "under_review",
      gate_result: gatePayload as any,
      quality_notes: `Gate rejected: ${reason}`,
      overall_confidence: 0,
      updated_at: new Date().toISOString(),
    } as any);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/gate_result/i.test(msg)) throw e;
  }
}

/** Persist the successful/audit gate_result for a passing gate (best-effort). */
async function persistGateResult(
  store: ClaimStore,
  claimId: string,
  gatePayload: unknown,
  opts?: { swallowAll?: boolean },
): Promise<void> {
  try {
    await store.updateClaim(claimId, {
      gate_result: gatePayload as any,
      updated_at: new Date().toISOString(),
    } as any);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (opts?.swallowAll) return;
    if (!/gate_result/i.test(msg)) throw e;
  }
}

/**
 * Terminal handling for a blocked or unavailable vision gate: record the verdict,
 * attach an unusable prediction, and return early — never falls through to HF inference.
 */
async function gateBlockedEarlyReturn(
  store: ClaimStore,
  claimId: string,
  gate: PersistedGateOutcome,
): Promise<{ claimId: string; prediction: HfPrediction }> {
  const reason = gate.blockingReason || "unusable";
  const gatePayload = gate.gateResult;
  await persistGateRejection(store, claimId, gatePayload, reason);
  const prediction = unusablePrediction([reason]);
  try {
    await attachHfPrediction(store, claimId, prediction);
    // re-ensure gate_result + overallConfidence 0 after attach (attach overwrites quality_notes)
    await persistGateRejection(store, claimId, gatePayload, reason);
  } catch {}
  return { claimId, prediction };
}

/** Persist the adaptive result; auto-recapture claims additionally flip to needs_recapture. */
async function persistAdaptiveResult(
  store: ClaimStore,
  claimId: string,
  adaptive: AdaptiveResult,
  adaptivePayload: Record<string, unknown>,
  previewMissingAngles: string[],
): Promise<void> {
  // Persist the adaptive verdict for the reviewer badge, but never auto-flip
  // status to needs_recapture. Auto-routing hid brand-new claims from the
  // pending queue and looked like a failed submit. Reviewers request recapture.
  const missing =
    adaptive.missingAngles.length > 0 ? adaptive.missingAngles : previewMissingAngles;
  try {
    await store.updateClaim(claimId, {
      adaptive_result: adaptivePayload as any,
      ...(missing.length ? { missing_angles: missing } : {}),
      updated_at: new Date().toISOString(),
    } as any);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/adaptive_result/i.test(msg)) throw e;
  }
}

export type InferRuntimeOptions = {
  apiToken?: string;
  fetchImpl?: typeof fetch;
  spaceUrl?: string;
  /** Persist + gate + context only; caller schedules Gemini attach (e.g. Next.js `after()`). */
  skipInference?: boolean;
};

async function markInferenceFailed(store: ClaimStore, claimId: string, inferError: string): Promise<void> {
  try {
    await store.updateClaim(claimId, {
      inference_status: "failed",
      inference_error: inferError.slice(0, 500),
      updated_at: new Date().toISOString(),
    } as Partial<WebClaimRow>);
  } catch {
    // column may be missing pre-migration
  }
}

export async function inferAndAttachToClaim(
  store: ClaimStore,
  claimId: string,
  images: PersistedImageInput[],
  cropType: string | undefined,
  infer: typeof inferCropDisease,
  inferOptions?: InferRuntimeOptions,
): Promise<{ prediction: HfPrediction | null; inferError?: string }> {
  if (imagesAreUnusable(images)) {
    const prediction = unusablePrediction();
    try {
      await attachHfPrediction(store, claimId, prediction);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/status changed|Claim not found/i.test(msg)) return { prediction: null, inferError: msg };
      throw error;
    }
    return { prediction };
  }
  const closeup = images.find((img) => img.angleType === "closeup_damage") || images[0];
  let prediction: HfPrediction | null = null;
  try {
    const uniqueAngles = new Map<string, { angleType: string; bytes: Uint8Array }>();
    for (const image of images) {
      if (!uniqueAngles.has(image.angleType)) {
        uniqueAngles.set(image.angleType, {
          angleType: image.angleType,
          bytes: requireImageBytes(image, image.angleType),
        });
      }
    }
    const extras = [...uniqueAngles.values()];
    const claimRow = await store.getClaim(claimId);
    prediction = await infer({
      imageBytes: requireImageBytes(closeup, closeup.angleType),
      expectedCrop: cropType,
      angleType: closeup.angleType,
      extraImages: extras,
      apiToken: inferOptions?.apiToken,
      fetchImpl: inferOptions?.fetchImpl,
      spaceUrl: inferOptions?.spaceUrl,
      peril: claimRow?.peril || undefined,
      farmerObservation:
        claimRow?.farmer_observations ||
        images.find((img) => img.farmerObservation)?.farmerObservation ||
        undefined,
    });
    await attachHfPrediction(store, claimId, prediction);
    return { prediction };
  } catch (error) {
    const inferError = error instanceof Error ? error.message : "Inference failed";
    if (prediction && /status changed/i.test(inferError)) {
      try {
        await attachHfPrediction(store, claimId, prediction);
        return { prediction };
      } catch {
        return { prediction: null, inferError };
      }
    }
    await markInferenceFailed(store, claimId, inferError);
    return { prediction: null, inferError };
  }
}

export function claimNeedsInferenceRetry(claim: WebClaimRow, nowMs: number = Date.now()): boolean {
  if (claim.inference_status === "complete") return false;
  if (REVIEWER_LOCKED_STATUSES.has(claim.status) && claim.hf_label) return false;
  if (claim.inference_status === "failed") return true;
  if (claim.hf_label && claim.model_id) return false;
  const started = claim.inference_started_at || claim.updated_at || claim.created_at;
  if (!started) return true;
  const startedMs = Date.parse(started);
  if (!Number.isFinite(startedMs)) return true;
  return nowMs - startedMs >= INFERENCE_RETRY_AFTER_MS;
}

export async function retryPendingInference(
  store: ClaimStore,
  claimId: string,
  infer: typeof inferCropDisease = inferCropDisease,
  inferOptions?: InferRuntimeOptions,
): Promise<{ prediction: HfPrediction | null; inferError?: string } | null> {
  const claim = await store.getClaim(claimId);
  if (!claim || !claimNeedsInferenceRetry(claim)) return null;
  try {
    await store.updateClaim(claimId, {
      inference_status: "pending",
      inference_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Partial<WebClaimRow>);
  } catch {
    // ignore missing columns
  }
  const rows = await store.listImages(claimId);
  const images: PersistedImageInput[] = [];
  for (const row of rows) {
    const path = row.storage_path;
    if (!path) continue;
    try {
      const bytes = await store.downloadImage(path);
      if (bytes.byteLength === 0) continue;
      images.push({
        angleType: row.angle_type,
        bytes,
        sha256: row.sha256 || undefined,
        lat: row.lat,
        lon: row.lon,
        accuracyM: row.accuracy_m,
        blurScore: row.blur_score,
        lightingScore: row.lighting_score,
        qualityPassed: row.quality_passed,
      });
    } catch {
      // skip unreadable blobs
    }
  }
  if (!images.length) {
    await markInferenceFailed(store, claimId, "no_image_bytes");
    return { prediction: null, inferError: "no_image_bytes" };
  }
  return inferAndAttachToClaim(store, claimId, images, claim.crop_type || undefined, infer, inferOptions);
}

export async function persistAndInfer(
  store: ClaimStore,
  input: PersistClaimInput,
  infer: typeof inferCropDisease = inferCropDisease,
  inferOptions?: InferRuntimeOptions,
): Promise<{ claimId: string; prediction: HfPrediction | null; inferError?: string; pendingInference?: boolean }> {
  // ----- Vision gate (computed BEFORE image persistence so each web_claim_images row can
  // carry its own per-angle gate_result; a thrown gate fails CLOSED via runVisionGate) -----
  const gate = await runVisionGate(input.images, input.cropType, input.peril);
  const persisted = await persistFarmerSubmission(store, input, gate);
  // Assemble multi-signal context internally (not via HTTP) and persist to claim with context_signals.
  // Best-effort: do not fail pipeline if context fetch errors or column missing.
  let effectiveSignals: ContextSignal[] = (input.contextSignals || []) as ContextSignal[];
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
        effectiveSignals = (ctx as any).signals as ContextSignal[];
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
  // If any image Gate usable==false, set claim's gate_result JSON and return unusablePrediction terminally.
  if (gate.gateFailed) {
    return gateBlockedEarlyReturn(store, persisted.claimId, gate);
  }
  // Gate passed — persist successful gate_result for audit trail (best-effort)
  if (gate.perImage.length) {
    await persistGateResult(store, persisted.claimId, gate.gateResult);
  }
  // ----- Adaptive engine: compute level/nextStep and persist for reviewer queue -----
  try {
    const previewForAdaptive = computeEvidencePreview(input.images, input.peril);
    const adaptive: AdaptiveResult = adaptiveConfidence({
      quality: previewForAdaptive.qualityScore,
      coverage: previewForAdaptive.coverageScore,
      context: previewForAdaptive.contextScore,
      integrity: previewForAdaptive.integrityScore,
      overall: previewForAdaptive.overallConfidence,
      peril: (input.peril as any) || "normal",
      signals: effectiveSignals,
      missingAngles: previewForAdaptive.missingAngles,
    });
    // For initial submission, there is no previous evaluation (meaningful delta only applies on recapture).
    const adaptivePayload = {
      ...adaptive,
      previousConfidence: null,
    };
    await persistAdaptiveResult(
      store,
      persisted.claimId,
      adaptive,
      adaptivePayload,
      previewForAdaptive.missingAngles,
    );
  } catch {
    // adaptive is best-effort; never block pipeline
  }
  if (inferOptions?.skipInference) {
    if (imagesAreUnusable(input.images)) {
      const prediction = unusablePrediction();
      await attachHfPrediction(store, persisted.claimId, prediction);
      return { claimId: persisted.claimId, prediction };
    }
    return { claimId: persisted.claimId, prediction: null, pendingInference: true };
  }
  const inferred = await inferAndAttachToClaim(
    store,
    persisted.claimId,
    input.images,
    input.cropType,
    infer,
    inferOptions,
  );
  return { claimId: persisted.claimId, ...inferred };
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
  return buildImageRows(store, claimId, images, new Date().toISOString(), perImageGate);
}

export async function recaptureAndInfer(
  store: ClaimStore,
  input: RecaptureInput,
  infer: typeof inferCropDisease = inferCropDisease,
  inferOptions?: InferRuntimeOptions,
): Promise<{ claimId: string; prediction: HfPrediction | null; inferError?: string; pendingInference?: boolean }> {
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
  if (!RECAPTURE_ALLOWED_STATUSES.has(existing.status)) {
    throw new Error(
      `Cannot recapture a ${existing.status} case. Recapture is only allowed after a reviewer request.`,
    );
  }
  // ----- Vision gate for recapture (computed BEFORE image persistence so each new
  // web_claim_images row carries its own per-angle gate_result; throws fail CLOSED) -----
  const gate = await runVisionGate(
    input.images,
    existing.crop_type || undefined,
    (existing as any).peril || undefined,
  );
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
    inference_status: "pending",
    inference_started_at: now,
    inference_error: null,
    updated_at: now,
  }, { expectedStatus: existing.status });

  // ----- Vision gate blocking for recapture (uses the gate computed early above) -----
  if (gate.gateFailed) {
    return gateBlockedEarlyReturn(store, input.claimId, gate);
  }
  if (gate.perImage.length) {
    await persistGateResult(store, input.claimId, gate.gateResult, { swallowAll: true });
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
    await persistAdaptiveResult(
      store,
      input.claimId,
      adaptive,
      adaptivePayload as unknown as Record<string, unknown>,
      preview.missingAngles,
    );
  } catch {
    // adaptive is best-effort; never block pipeline
  }

  if (inferOptions?.skipInference) {
    if (imagesAreUnusable(input.images)) {
      const prediction = unusablePrediction();
      await attachHfPrediction(store, input.claimId, prediction);
      return { claimId: input.claimId, prediction };
    }
    return { claimId: input.claimId, prediction: null, pendingInference: true };
  }
  const inferred = await inferAndAttachToClaim(
    store,
    input.claimId,
    input.images,
    existing.crop_type || undefined,
    infer,
    inferOptions,
  );
  return { claimId: input.claimId, ...inferred };
}

function geminiAnalysisFromGate(gate: unknown): {
  reasoning?: string;
  visual_findings?: string;
  authenticity?: HfPrediction["authenticity"] | null;
  per_image?: HfPrediction["perImage"];
  severity?: string | null;
  affected_area_pct?: number | null;
  growth_stage?: string | null;
  peril_match?: boolean | null;
  predicted_crop?: string | null;
  primary_damage?: string | null;
  grade_label?: string | null;
  quality_warnings?: string[];
} | null {
  if (!gate || typeof gate !== "object") return null;
  const blob = (gate as { geminiAnalysis?: unknown }).geminiAnalysis;
  if (!blob || typeof blob !== "object") return null;
  return blob as {
    reasoning?: string;
    visual_findings?: string;
    authenticity?: HfPrediction["authenticity"] | null;
    per_image?: HfPrediction["perImage"];
    severity?: string | null;
    affected_area_pct?: number | null;
    growth_stage?: string | null;
    peril_match?: boolean | null;
    predicted_crop?: string | null;
    primary_damage?: string | null;
    grade_label?: string | null;
    quality_warnings?: string[];
  };
}

function geminiAnomalyFlags(analysis: ReturnType<typeof geminiAnalysisFromGate>): string[] {
  const auth = analysis?.authenticity;
  if (!auth) return [];
  const flags: string[] = [];
  if (auth.screenReplay) flags.push("screen_replay");
  if (auth.aiGenerated) flags.push("ai_generated");
  if (auth.printedPhoto) flags.push("printed_photo");
  if (auth.indoorScene) flags.push("indoor_or_non_field");
  if (auth.authentic === false) flags.push("not_authentic");
  return flags;
}

export function claimToSubmission(claim: WebClaimRow, images: WebImageRow[]): Submission {
  return {
    id: claim.id,
    crop_cycle_id: claim.plot_id || claim.id,
    plot_name: claim.plot_name ?? null,
    plot_name_hi: claim.plot_name_hi ?? null,
    khasra_number: claim.khasra_number ?? null,
    crop_type: claim.crop_type ?? null,
    crop_type_hi: claim.crop_type_hi ?? null,
    crop_variety: claim.crop_variety ?? null,
    sowing_date: (claim as any).sowing_date ?? null,
    status: claim.status,
    createdAt: (claim as any).created_at || undefined,
    capture_lat: claim.capture_lat,
    capture_lon: claim.capture_lon,
    capture_accuracy_m: claim.capture_accuracy_m,
    farmer_observations: claim.farmer_observations,
    severity: claim.corrected_grade || claim.corrected_severity || claim.severity_grade,
    final_assessment_notes: claim.reviewer_notes,
    recapture_reason: claim.recapture_reason ?? null,
    recapture_reason_hi: claim.recapture_reason_hi ?? null,
    missing_angles: claim.missing_angles ?? [],
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
      gate_result: (img as { gate_result?: unknown }).gate_result ?? null,
    })),
    inference_status: (claim as { inference_status?: string | null }).inference_status ?? null,
    inference_error: (claim as { inference_error?: string | null }).inference_error ?? null,
    latest_prediction: claim.hf_label || geminiAnalysisFromGate(claim.gate_result)
      ? (() => {
          const analysis = geminiAnalysisFromGate(claim.gate_result);
          const unusable = workflowGrade(claim.severity_grade) === "U";
          return {
            model_version: claim.model_id || geminiVisionModel(),
            adapter_type: "gemini_vision",
            is_production_validated: false,
            predicted_crop: unusable
              ? "unknown"
              : claim.corrected_crop || analysis?.predicted_crop || claim.crop_identified,
            crop_confidence: unusable ? 0 : (claim.crop_confidence ?? 0) / 100,
            predicted_growth_stage: analysis?.growth_stage ?? null,
            predicted_grade: workflowGrade(claim.severity_grade),
            grade_label:
              analysis?.grade_label ||
              (unusable ? "unusable_or_not_authentic" : "gemini_workflow_bucket"),
            primary_damage: unusable
              ? "unknown"
              : claim.disease_detected || analysis?.primary_damage || claim.hf_label,
            severity: claim.corrected_severity ?? analysis?.severity ?? null,
            overall_confidence: unusable ? 0 : claim.hf_score ?? 0,
            affected_area_pct:
              claim.corrected_affected_area_pct ??
              analysis?.affected_area_pct ??
              claim.severity_percentage ??
              null,
            quality_warnings: unusable
              ? [claim.quality_notes || "unusable_or_not_authentic"]
              : Array.isArray(analysis?.quality_warnings)
                ? analysis.quality_warnings
                : [],
            anomaly_flags: geminiAnomalyFlags(analysis),
            human_review_recommendation: unusable
              ? "recapture"
              : "Assistive Gemini analysis — human review required",
            explanation: {
              model_id: claim.model_id,
              predicted_grade: claim.severity_grade,
              grade_is_workflow_bucket: true,
              reasoning: analysis?.reasoning || claim.context_notes || "",
              visual_findings: analysis?.visual_findings || "",
              authenticity: analysis?.authenticity || null,
              per_image: analysis?.per_image || [],
              peril_match: analysis?.peril_match ?? null,
            },
          };
        })()
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

  const mutatingDecision =
    payload.action === "accept" ||
    payload.action === "correct" ||
    payload.action === "reject" ||
    payload.action === "request_recapture" ||
    payload.action === "physical_inspection" ||
    payload.action === "override_gate";
  if (
    mutatingDecision &&
    (existing.status === "verified" || existing.status === "rejected") &&
    payload.action !== "request_recapture"
  ) {
    throw new Error(
      `Cannot ${payload.action.replaceAll("_", " ")} a ${existing.status} case. Reopen via recapture if new evidence is required.`,
    );
  }

  if (payload.action === "accept") {
    const gateResult = (existing as any).gate_result as
      | { gateFailed?: boolean; overridden?: boolean }
      | null
      | undefined;
    if (gateResult?.gateFailed && !gateResult.overridden) {
      throw new Error(
        "Cannot accept claim: authenticity gate verification failed. Override gate or request recapture first.",
      );
    }
    if (existing.integrity_score != null && existing.integrity_score < 50) {
      throw new Error(
        "Cannot accept claim: integrity score is below 50. Request physical inspection or recapture.",
      );
    }
  }

  let status = existing.status;
  if (payload.action === "request_recapture") status = "needs_recapture";
  else if (payload.action === "accept" || payload.action === "correct") status = "verified";
  else if (payload.action === "physical_inspection") status = "physical_inspection";
  else if (payload.action === "reject") status = "rejected";
  else if (payload.action === "annotate") status = existing.status;

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

    // Recalculate preview from stored images to restore non-zero confidence
    try {
      const images = await store.listImages(id);
      if (images.length > 0) {
        const preview = computeEvidencePreview(
          images.map((img) => ({
            angleType: img.angle_type,
            lat: img.lat ?? undefined,
            lon: img.lon ?? undefined,
            sha256: img.sha256 ?? undefined,
            blurScore: img.blur_score ?? undefined,
            lightingScore: img.lighting_score ?? undefined,
            qualityPassed: true, // overridden by reviewer
          })),
          (existing as any).peril,
        );
        patch.quality_score = preview.qualityScore;
        patch.coverage_score = preview.coverageScore;
        patch.context_score = preview.contextScore;
        patch.integrity_score = preview.integrityScore;
        patch.overall_confidence = preview.overallConfidence;
        patch.missing_angles = preview.missingAngles;
      }
    } catch {}
  }

  try {
    await store.updateClaim(id, patch, { expectedStatus: existing.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (payload.action === "override_gate" && /gate_result/i.test(msg)) {
      // legacy DB without web_claims.gate_result — persist everything except the gate blob
      const { gate_result: _g, ...rest } = patch as any;
      await store.updateClaim(id, rest as Partial<WebClaimRow>, { expectedStatus: existing.status });
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
      if (claims.has(row.id)) throw new Error("Claim already exists");
      claims.set(row.id, { ...row });
      return row;
    },
    async deleteClaim(id) {
      claims.delete(id);
      images.delete(id);
    },
    async updateClaim(id, patch, opts) {
      const current = claims.get(id);
      if (!current) throw new Error("Claim not found");
      if (opts?.expectedStatus && current.status !== opts.expectedStatus) {
        throw new Error("Claim status changed");
      }
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
    async downloadImage(path) {
      const bytes = blobs.get(path);
      if (!bytes) throw new Error("Image not found");
      return bytes;
    },
    async insertReviewAction(row) {
      reviewActions.push({ ...row });
    },
  };
}
