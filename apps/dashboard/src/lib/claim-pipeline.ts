import { inferCropDisease, type HfPrediction } from "./hf-infer";
import type { Submission } from "./api";

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
  bytes: Uint8Array;
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
  created_at?: string;
  updated_at?: string;
};

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
};

export type ClaimStore = {
  insertClaim(row: WebClaimRow): Promise<WebClaimRow>;
  updateClaim(id: string, patch: Partial<WebClaimRow>): Promise<void>;
  getClaim(id: string): Promise<WebClaimRow | null>;
  listClaims(): Promise<WebClaimRow[]>;
  insertImages(rows: WebImageRow[]): Promise<void>;
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

export function computeEvidencePreview(images: PersistedImageInput[]) {
  const present = new Set(images.map((img) => img.angleType));
  const usable = images.filter((img) => img.bytes.byteLength > 0);
  const coverage = Math.round((usable.length / REQUIRED_ANGLES.length) * 100);
  const missing = REQUIRED_ANGLES.filter((angle) => !present.has(angle));
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
    coverageNotes: `${usable.length}/${REQUIRED_ANGLES.length} required angles present`,
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

export async function persistFarmerSubmission(
  store: ClaimStore,
  input: PersistClaimInput,
): Promise<{ claimId: string; claim: WebClaimRow }> {
  if (!input.images.length) {
    throw new Error("At least one image is required");
  }
  const claimId = input.id || newId("claim");
  const preview = computeEvidencePreview(input.images);
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
    payout_status: "pending_review",
    created_at: now,
    updated_at: now,
  };
  await store.insertClaim(claim);

  const imageRows: WebImageRow[] = [];
  for (const image of input.images) {
    const imageId = image.id || newId("img");
    const ext = (image.contentType || "image/jpeg").includes("png") ? "png" : "jpg";
    const path = `${claimId}/${image.angleType}-${imageId}.${ext}`;
    const uploaded = await store.uploadImage(path, image.bytes, image.contentType || "image/jpeg");
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
  await store.insertImages(imageRows);
  return { claimId, claim };
}

export async function attachHfPrediction(
  store: ClaimStore,
  claimId: string,
  prediction: HfPrediction,
): Promise<void> {
  await store.updateClaim(claimId, {
    model_id: prediction.modelId,
    hf_label: prediction.label,
    hf_score: prediction.score,
    disease_detected: prediction.label,
    model_confidence: Math.round(prediction.score * 1000) / 10,
    crop_identified: prediction.label,
    crop_confidence: Math.round(prediction.score * 1000) / 10,
    updated_at: new Date().toISOString(),
  });
}

export async function persistAndInfer(
  store: ClaimStore,
  input: PersistClaimInput,
  infer: typeof inferCropDisease = inferCropDisease,
  inferOptions?: { apiToken?: string; fetchImpl?: typeof fetch; modelId?: string },
): Promise<{ claimId: string; prediction: HfPrediction | null; inferError?: string }> {
  const persisted = await persistFarmerSubmission(store, input);
  const closeup =
    input.images.find((img) => img.angleType === "closeup_damage") || input.images[0];
  try {
    const prediction = await infer({
      imageBytes: closeup.bytes,
      modelId: inferOptions?.modelId,
      apiToken: inferOptions?.apiToken,
      fetchImpl: inferOptions?.fetchImpl,
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
    images: images.map((img) => ({
      id: img.id,
      angle_type: img.angle_type,
      upload_status: img.storage_path || img.image_url ? "uploaded" : "pending",
      download_url: img.image_url,
      sha256: img.sha256,
    })),
    latest_prediction: claim.hf_label
      ? {
          model_version: claim.model_id || "",
          adapter_type: "huggingface",
          is_production_validated: false,
          predicted_crop: claim.crop_identified,
          crop_confidence: (claim.crop_confidence ?? 0) / 100,
          primary_damage: claim.hf_label,
          severity: claim.severity_grade,
          overall_confidence: claim.hf_score ?? 0,
          affected_area_pct: claim.severity_percentage,
          quality_warnings: [],
          anomaly_flags: [],
          human_review_recommendation: "Review recommended",
          explanation: {
            hf_label: claim.hf_label,
            hf_score: claim.hf_score,
            model_id: claim.model_id,
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
  payload: { action: string; notes?: string; reason?: string; required_angles?: string[] },
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

  await store.updateClaim(id, {
    status,
    reviewer_notes: payload.notes || existing.reviewer_notes,
    recapture_reason: payload.action === "request_recapture" ? payload.reason || payload.notes : existing.recapture_reason,
    missing_angles: payload.required_angles || existing.missing_angles,
    updated_at: new Date().toISOString(),
  });
  await store.insertReviewAction({
    id: newId("act"),
    claim_id: id,
    action: payload.action,
    notes: payload.notes,
    reason: payload.reason,
    required_angles: payload.required_angles,
    actor: "reviewer",
  });
  const updated = await getReviewerClaim(store, id);
  if (!updated) throw new Error("Claim missing after update");
  return updated;
}

export function createMemoryClaimStore(): ClaimStore & {
  claims: Map<string, WebClaimRow>;
  images: Map<string, WebImageRow[]>;
  blobs: Map<string, Uint8Array>;
} {
  const claims = new Map<string, WebClaimRow>();
  const images = new Map<string, WebImageRow[]>();
  const blobs = new Map<string, Uint8Array>();
  return {
    claims,
    images,
    blobs,
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
    async listImages(claimId) {
      return images.get(claimId) || [];
    },
    async uploadImage(path, bytes) {
      blobs.set(path, bytes);
      return { url: `memory://${path}`, storagePath: path };
    },
    async insertReviewAction() {
      return;
    },
  };
}
