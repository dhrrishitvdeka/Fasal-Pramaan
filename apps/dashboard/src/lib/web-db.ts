import { getSupabaseClient, isSupabaseConfigured } from "./supabase";
import { computeEvidencePreview, isRealSha256 } from "./evidence";
import { HF_MODEL_ID } from "./hf-model";
import type {
  ClaimAiPrediction,
  ClaimImageEvidence,
  ClaimStatus,
  FarmerClaim,
  FarmerPlot,
  GrowthTimelineMilestone,
} from "./farmerStore";
import type {
  EvidenceEvaluation,
  MapMarker,
  Overview,
  Submission,
} from "./api";

export const EVIDENCE_BUCKET = "fasal-web-evidence";

export interface WebPlotRow {
  id: string;
  name: string | null;
  name_hi: string | null;
  khasra_number: string | null;
  area_hectares: number | null;
  crop_type: string | null;
  crop_type_hi: string | null;
  crop_variety: string | null;
  current_stage: string | null;
  current_stage_hi: string | null;
  sowing_date: string | null;
  soil_type: string | null;
  soil_type_hi: string | null;
  irrigation_type: string | null;
  irrigation_type_hi: string | null;
  lat: number | null;
  lon: number | null;
  village: string | null;
  district: string | null;
  state: string | null;
  created_at: string | null;
}

export interface WebClaimRow {
  id: string;
  plot_id: string | null;
  plot_name: string | null;
  plot_name_hi: string | null;
  khasra_number: string | null;
  crop_type: string | null;
  crop_type_hi: string | null;
  crop_variety: string | null;
  status: string | null;
  farmer_observations: string | null;
  missing_angles: string[] | null;
  recapture_reason: string | null;
  recapture_reason_hi: string | null;
  reviewer_notes: string | null;
  quality_score: number | null;
  coverage_score: number | null;
  context_score: number | null;
  integrity_score: number | null;
  overall_confidence: number | null;
  quality_notes: string | null;
  coverage_notes: string | null;
  context_notes: string | null;
  integrity_notes: string | null;
  crop_identified: string | null;
  crop_confidence: number | null;
  disease_detected: string | null;
  disease_detected_hi: string | null;
  severity_percentage: number | null;
  severity_grade: string | null;
  affected_area_hectares: number | null;
  estimated_loss_inr: number | null;
  model_confidence: number | null;
  payout_status: string | null;
  payout_amount_inr: number | null;
  capture_lat: number | null;
  capture_lon: number | null;
  capture_accuracy_m: number | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

export interface WebClaimImageRow {
  id: string;
  claim_id: string;
  angle_type: string | null;
  image_url: string | null;
  storage_path: string | null;
  captured_at: string | null;
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  sha256: string | null;
  quality_passed: boolean | null;
  blur_score: number | null;
  lighting_score: number | null;
}

export interface WebMilestoneRow {
  id: string;
  plot_id: string | null;
  crop_name: string | null;
  crop_name_hi: string | null;
  stage_name: string | null;
  stage_name_hi: string | null;
  day_number: number | null;
  due_date: string | null;
  completed: boolean | null;
  completed_date: string | null;
  evidence_image_url: string | null;
  notes: string | null;
  is_overdue: boolean | null;
}

export interface WebReviewActionRow {
  id: string;
  claim_id: string;
  action: string | null;
  notes: string | null;
  reason: string | null;
  required_angles: string[] | null;
  actor: string | null;
  created_at: string | null;
}

export interface WebProfileRow {
  id: string;
  name: string | null;
  name_hi: string | null;
  kisan_id: string | null;
  phone: string | null;
  village: string | null;
  district: string | null;
  state: string | null;
}

export const EMPTY_AI_PREDICTION: ClaimAiPrediction = {
  cropIdentified: "",
  cropConfidence: 0,
  diseaseDetected: "",
  diseaseDetectedHi: "",
  severityPercentage: 0,
  severityGrade: "Low",
  affectedAreaHectares: 0,
  estimatedLossInr: 0,
  modelConfidence: 0,
};

export const EMPTY_FARMER_PROFILE = {
  name: "Farmer",
  nameHi: "किसान",
  kisanId: "",
  phone: "",
  village: "",
  district: "",
  state: "",
};

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asStatus(value: string | null | undefined): ClaimStatus {
  switch (value) {
    case "verified":
    case "needs_recapture":
    case "under_review":
    case "draft":
    case "submitted":
    case "physical_inspection":
      return "under_review";
    default:
      return "submitted";
  }
}

function asSeverityGrade(value: string | null | undefined): ClaimAiPrediction["severityGrade"] {
  if (value === "A" || value === "B" || value === "C" || value === "U") return value;
  if (value === "Medium" || value === "High" || value === "Severe") return value;
  return "Low";
}

export function plotFromRow(row: WebPlotRow): FarmerPlot {
  return {
    id: row.id,
    name: row.name || "",
    nameHi: row.name_hi || "",
    khasraNumber: row.khasra_number || "",
    areaHectares: row.area_hectares ?? 0,
    cropType: row.crop_type || "",
    cropTypeHi: row.crop_type_hi || "",
    cropVariety: row.crop_variety || "",
    currentStage: row.current_stage || "",
    currentStageHi: row.current_stage_hi || "",
    sowingDate: row.sowing_date || "",
    soilType: row.soil_type || "",
    soilTypeHi: row.soil_type_hi || "",
    irrigationType: row.irrigation_type || "",
    irrigationTypeHi: row.irrigation_type_hi || "",
    lat: row.lat ?? 0,
    lon: row.lon ?? 0,
    village: row.village || "",
    district: row.district || "",
    state: row.state || "",
  };
}

export function imageFromRow(row: WebClaimImageRow): ClaimImageEvidence {
  return {
    id: row.id,
    angleType: row.angle_type || "",
    imageUrl: row.image_url || "",
    storagePath: row.storage_path || undefined,
    timestamp: row.captured_at || new Date().toISOString(),
    lat: row.lat,
    lon: row.lon,
    accuracyM: row.accuracy_m,
    sha256: row.sha256 || "",
    qualityPassed: Boolean(row.quality_passed),
    blurScore: row.blur_score ?? undefined,
    lightingScore: row.lighting_score ?? undefined,
  };
}

export function claimFromRow(row: WebClaimRow, images: ClaimImageEvidence[]): FarmerClaim {
  const hasPrediction = Boolean(row.crop_identified || row.disease_detected || (row.model_confidence ?? 0) > 0);
  return {
    id: row.id,
    plotId: row.plot_id || "",
    plotName: row.plot_name || "",
    plotNameHi: row.plot_name_hi || "",
    khasraNumber: row.khasra_number || "",
    cropType: row.crop_type || "",
    cropTypeHi: row.crop_type_hi || "",
    cropVariety: row.crop_variety || "",
    status: asStatus(row.status),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
    farmerObservations: row.farmer_observations || "",
    images,
    missingAngles: row.missing_angles || [],
    recaptureReason: row.recapture_reason || undefined,
    recaptureReasonHi: row.recapture_reason_hi || undefined,
    reviewerNotes: row.reviewer_notes || undefined,
    evidenceTrust: {
      qualityScore: row.quality_score ?? 0,
      coverageScore: row.coverage_score ?? 0,
      contextScore: row.context_score ?? 0,
      integrityScore: row.integrity_score ?? 0,
      overallConfidence: row.overall_confidence ?? 0,
      qualityNotes: row.quality_notes || undefined,
      coverageNotes: row.coverage_notes || undefined,
      contextNotes: row.context_notes || undefined,
      integrityNotes: row.integrity_notes || undefined,
    },
    aiPrediction: hasPrediction
      ? {
          cropIdentified: row.crop_identified || "",
          cropConfidence: row.crop_confidence ?? 0,
          diseaseDetected: row.disease_detected || "",
          diseaseDetectedHi: row.disease_detected_hi || "",
          severityPercentage: row.severity_percentage ?? 0,
          severityGrade: asSeverityGrade(row.severity_grade),
          affectedAreaHectares: row.affected_area_hectares ?? 0,
          estimatedLossInr: row.estimated_loss_inr ?? 0,
          modelConfidence: row.model_confidence ?? 0,
        }
      : { ...EMPTY_AI_PREDICTION },
    payoutStatus:
      row.payout_status === "approved" ||
      row.payout_status === "pending_review" ||
      row.payout_status === "needs_action" ||
      row.payout_status === "processing"
        ? row.payout_status
        : undefined,
    payoutAmountInr: row.payout_amount_inr ?? undefined,
  };
}

export function milestoneFromRow(row: WebMilestoneRow): GrowthTimelineMilestone {
  return {
    id: row.id,
    plotId: row.plot_id || "",
    cropName: row.crop_name || "",
    cropNameHi: row.crop_name_hi || "",
    stageName: row.stage_name || "",
    stageNameHi: row.stage_name_hi || "",
    dayNumber: row.day_number ?? 0,
    dueDate: row.due_date || "",
    completed: Boolean(row.completed),
    completedDate: row.completed_date || undefined,
    evidenceImageUrl: row.evidence_image_url || undefined,
    notes: row.notes || undefined,
    isOverdue: Boolean(row.is_overdue),
  };
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch?.[1] || "image/jpeg";
  try {
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

export async function resolveImageUrl(imageUrl: string | null, storagePath: string | null): Promise<string> {
  if (storagePath && isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.storage
        .from(EVIDENCE_BUCKET)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
      if (!error && data?.signedUrl) return data.signedUrl;
    }
  }
  return imageUrl || "";
}

export async function uploadEvidenceBlob(
  claimId: string,
  angleType: string,
  blob: Blob
): Promise<{ imageUrl: string; storagePath: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }
  const ext = blob.type.includes("png") ? "png" : "jpg";
  const storagePath = `${claimId}/${angleType}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(storagePath, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) {
    throw new Error(error.message || "Evidence upload failed");
  }
  const { data, error: signError } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
  if (signError || !data?.signedUrl) {
    throw new Error(signError?.message || "Could not create a signed URL for uploaded evidence");
  }
  return { imageUrl: data.signedUrl, storagePath };
}

export async function persistClaimImages(
  claimId: string,
  images: ClaimImageEvidence[]
): Promise<ClaimImageEvidence[]> {
  const persisted: ClaimImageEvidence[] = [];
  for (const image of images) {
    if (image.imageUrl.startsWith("data:") && isSupabaseConfigured()) {
      const blob = dataUrlToBlob(image.imageUrl);
      if (!blob) {
        throw new Error(`Could not encode ${image.angleType} for upload`);
      }
      const uploaded = await uploadEvidenceBlob(claimId, image.angleType || "angle", blob);
      persisted.push({
        ...image,
        imageUrl: uploaded.imageUrl,
        storagePath: uploaded.storagePath,
      });
    } else {
      persisted.push(image);
    }
  }
  return persisted;
}

function claimRowFromFarmer(claim: FarmerClaim, createdBy: string | null): Partial<WebClaimRow> {
  const gps = claim.images.find((img) => img.lat != null && img.lon != null);
  const pred = claim.aiPrediction;
  const trust = claim.evidenceTrust;
  return {
    id: claim.id,
    plot_id: claim.plotId || null,
    plot_name: claim.plotName || null,
    plot_name_hi: claim.plotNameHi || null,
    khasra_number: claim.khasraNumber || null,
    crop_type: claim.cropType || null,
    crop_type_hi: claim.cropTypeHi || null,
    crop_variety: claim.cropVariety || null,
    status: claim.status,
    farmer_observations: claim.farmerObservations || null,
    missing_angles: claim.missingAngles || [],
    recapture_reason: claim.recaptureReason || null,
    recapture_reason_hi: claim.recaptureReasonHi || null,
    reviewer_notes: claim.reviewerNotes || null,
    quality_score: trust.qualityScore,
    coverage_score: trust.coverageScore,
    context_score: trust.contextScore,
    integrity_score: trust.integrityScore,
    overall_confidence: trust.overallConfidence,
    quality_notes: trust.qualityNotes || null,
    coverage_notes: trust.coverageNotes || null,
    context_notes: trust.contextNotes || null,
    integrity_notes: trust.integrityNotes || null,
    crop_identified: pred.cropIdentified || null,
    crop_confidence: pred.cropConfidence || null,
    disease_detected: pred.diseaseDetected || null,
    disease_detected_hi: pred.diseaseDetectedHi || null,
    severity_percentage: pred.severityPercentage || null,
    severity_grade: pred.severityGrade || null,
    affected_area_hectares: pred.affectedAreaHectares || null,
    estimated_loss_inr: pred.estimatedLossInr || null,
    model_confidence: pred.modelConfidence || null,
    payout_status: claim.payoutStatus || null,
    payout_amount_inr: claim.payoutAmountInr ?? null,
    capture_lat: gps?.lat ?? null,
    capture_lon: gps?.lon ?? null,
    capture_accuracy_m: gps?.accuracyM ?? null,
    created_at: claim.createdAt,
    updated_at: claim.updatedAt,
    created_by: createdBy,
  };
}

function imageRowFromEvidence(claimId: string, image: ClaimImageEvidence): Partial<WebClaimImageRow> {
  return {
    id: image.id || newId(),
    claim_id: claimId,
    angle_type: image.angleType,
    image_url: image.imageUrl.startsWith("data:") ? null : image.imageUrl,
    storage_path: image.storagePath || null,
    captured_at: image.timestamp,
    lat: image.lat ?? null,
    lon: image.lon ?? null,
    accuracy_m: image.accuracyM ?? null,
    sha256: isRealSha256(image.sha256) ? image.sha256 : null,
    quality_passed: image.qualityPassed,
    blur_score: image.blurScore ?? null,
    lighting_score: image.lightingScore ?? null,
  };
}

export async function fetchWebPlots(): Promise<FarmerPlot[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("web_plots").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data || []) as WebPlotRow[]).map(plotFromRow);
}

export async function fetchWebClaims(): Promise<FarmerClaim[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("web_claims").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const claims = (data || []) as WebClaimRow[];
  if (!claims.length) return [];
  const ids = claims.map((c) => c.id);
  const { data: imageRows, error: imageError } = await supabase
    .from("web_claim_images")
    .select("*")
    .in("claim_id", ids);
  if (imageError) throw new Error(imageError.message);
  const grouped = new Map<string, ClaimImageEvidence[]>();
  for (const row of (imageRows || []) as WebClaimImageRow[]) {
    const resolved = await resolveImageUrl(row.image_url, row.storage_path);
    const list = grouped.get(row.claim_id) || [];
    list.push(imageFromRow({ ...row, image_url: resolved }));
    grouped.set(row.claim_id, list);
  }
  return claims.map((row) => claimFromRow(row, grouped.get(row.id) || []));
}

export async function fetchWebClaimById(id: string): Promise<FarmerClaim | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("web_claims").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: imageRows, error: imageError } = await supabase
    .from("web_claim_images")
    .select("*")
    .eq("claim_id", id);
  if (imageError) throw new Error(imageError.message);
  const images: ClaimImageEvidence[] = [];
  for (const row of (imageRows || []) as WebClaimImageRow[]) {
    const resolved = await resolveImageUrl(row.image_url, row.storage_path);
    images.push(imageFromRow({ ...row, image_url: resolved }));
  }
  return claimFromRow(data as WebClaimRow, images);
}

export async function fetchWebMilestones(): Promise<GrowthTimelineMilestone[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("web_milestones").select("*").order("day_number", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data || []) as WebMilestoneRow[]).map(milestoneFromRow);
}

export async function fetchWebProfile(): Promise<typeof EMPTY_FARMER_PROFILE> {
  const supabase = getSupabaseClient();
  if (!supabase) return { ...EMPTY_FARMER_PROFILE };
  const { data, error } = await supabase.from("web_profiles").select("*").limit(1).maybeSingle();
  if (error || !data) return { ...EMPTY_FARMER_PROFILE };
  const row = data as WebProfileRow;
  return {
    name: row.name || "Farmer",
    nameHi: row.name_hi || "किसान",
    kisanId: row.kisan_id || "",
    phone: row.phone || "",
    village: row.village || "",
    district: row.district || "",
    state: row.state || "",
  };
}

export async function currentUserId(): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function currentActorLabel(): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) return "reviewer";
  const { data } = await supabase.auth.getUser();
  return data.user?.email || data.user?.id || "reviewer";
}

export async function insertWebClaim(claim: FarmerClaim): Promise<FarmerClaim> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }
  const createdBy = await currentUserId();
  const images = await persistClaimImages(claim.id, claim.images);
  const ready: FarmerClaim = { ...claim, images, evidenceTrust: computeEvidencePreview(images) };
  const { error } = await supabase.from("web_claims").insert(claimRowFromFarmer(ready, createdBy));
  if (error) throw new Error(error.message);
  if (images.length) {
    const { error: imageError } = await supabase
      .from("web_claim_images")
      .insert(images.map((img) => imageRowFromEvidence(ready.id, img)));
    if (imageError) throw new Error(imageError.message);
  }
  return ready;
}

export async function updateWebClaim(claim: FarmerClaim): Promise<FarmerClaim> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const createdBy = await currentUserId();
  const images = await persistClaimImages(claim.id, claim.images);
  const ready: FarmerClaim = { ...claim, images, evidenceTrust: computeEvidencePreview(images) };
  const { error } = await supabase
    .from("web_claims")
    .update(claimRowFromFarmer(ready, createdBy))
    .eq("id", ready.id);
  if (error) throw new Error(error.message);
  const { error: deleteError } = await supabase.from("web_claim_images").delete().eq("claim_id", ready.id);
  if (deleteError) throw new Error(deleteError.message);
  if (images.length) {
    const { error: imageError } = await supabase
      .from("web_claim_images")
      .insert(images.map((img) => imageRowFromEvidence(ready.id, img)));
    if (imageError) throw new Error(imageError.message);
  }
  return ready;
}

export async function updateWebMilestone(milestone: GrowthTimelineMilestone): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");
  const { error } = await supabase
    .from("web_milestones")
    .update({
      due_date: milestone.dueDate,
      completed: milestone.completed,
      completed_date: milestone.completedDate || null,
      evidence_image_url: milestone.evidenceImageUrl || null,
      notes: milestone.notes || null,
      is_overdue: milestone.isOverdue,
    })
    .eq("id", milestone.id);
  if (error) throw new Error(error.message);
}

export function evaluationFromClaim(claim: FarmerClaim): EvidenceEvaluation {
  const trust = claim.evidenceTrust;
  const missing = claim.missingAngles || [];
  const hashed = claim.images.filter((img) => isRealSha256(img.sha256)).length;
  const gpsOk = claim.images.some((img) => img.lat != null && img.lon != null);
  let uncType: string | null = null;
  let recAction: string | null = "none";
  if (trust.integrityScore < 70) {
    uncType = "integrity";
    recAction = "human_review";
  } else if (trust.coverageScore < 80 || missing.length > 0) {
    uncType = "coverage";
    recAction = "request_specific_evidence";
  } else if (trust.qualityScore < 70) {
    uncType = "visual";
    recAction = "retake_image";
  } else if (trust.contextScore < 70) {
    uncType = "context";
    recAction = "request_context";
  }
  return {
    submission_id: claim.id,
    evaluation_version: "web-evidence-v1",
    quality: {
      score: trust.qualityScore,
      available: Boolean(claim.images.some((img) => img.blurScore != null || img.lightingScore != null)),
      details: {
        issues: trust.qualityNotes ? [trust.qualityNotes] : [],
      },
    },
    coverage: {
      score: trust.coverageScore,
      available: true,
      details: {
        views_present: claim.images.length,
        views_required: 5,
        missing_views: missing,
        wide_context: claim.images.some((img) => img.angleType === "wide_field"),
        closeup_damage: claim.images.some((img) => img.angleType === "closeup_damage"),
      },
    },
    context: {
      score: trust.contextScore,
      available: gpsOk,
      details: {
        gps_valid: gpsOk,
        gps_accuracy_m: claim.images.find((img) => img.accuracyM != null)?.accuracyM ?? null,
        plot_match: null,
      },
    },
    integrity: {
      score: trust.integrityScore,
      available: true,
      details: {
        sha256_verified: hashed === claim.images.length && claim.images.length > 0,
        flags: hashed === claim.images.length ? [] : ["sha256_missing"],
      },
    },
    confidence: {
      final: trust.overallConfidence,
      threshold: 85,
      quality: trust.qualityScore,
      coverage: trust.coverageScore,
      context: trust.contextScore,
      integrity: trust.integrityScore,
    },
    uncertainty: {
      present: trust.overallConfidence < 85 || uncType != null,
      type: uncType || "none",
      severity: trust.overallConfidence < 50 ? "high" : trust.overallConfidence < 85 ? "medium" : "low",
      reasons: [trust.qualityNotes, trust.coverageNotes, trust.contextNotes, trust.integrityNotes].filter(
        (n): n is string => Boolean(n)
      ),
      recommended_action: recAction,
    },
    request:
      missing.length > 0
        ? {
            type: "request_specific_evidence",
            required_angles: missing,
          }
        : null,
  };
}

export function submissionFromClaim(claim: FarmerClaim): Submission {
  const pred = claim.aiPrediction;
  const hasPrediction = Boolean(pred.cropIdentified || pred.diseaseDetected || pred.modelConfidence > 0);
  const gps = claim.images.find((img) => img.lat != null && img.lon != null);
  return {
    id: claim.id,
    crop_cycle_id: claim.plotId || claim.id,
    status: claim.status,
    capture_lat: gps?.lat ?? null,
    capture_lon: gps?.lon ?? null,
    capture_accuracy_m: gps?.accuracyM ?? null,
    farmer_observations: claim.farmerObservations || null,
    severity: pred.severityGrade ? pred.severityGrade.toLowerCase() : null,
    final_severity: claim.status === "verified" ? pred.severityGrade?.toLowerCase() ?? null : null,
    final_assessment_notes: claim.reviewerNotes || null,
    images: claim.images.map((img) => ({
      id: img.id || `${claim.id}-${img.angleType}`,
      angle_type: img.angleType,
      upload_status: img.imageUrl ? "uploaded" : "missing",
      download_url: img.imageUrl || null,
      sha256: isRealSha256(img.sha256) ? img.sha256 : null,
      quality_flags: {
        quality_passed: img.qualityPassed,
        blur_score: img.blurScore ?? null,
        lighting_score: img.lightingScore ?? null,
      },
    })),
    latest_prediction: hasPrediction
      ? {
          model_version: HF_MODEL_ID,
          adapter_type: "hf_crop_leaf",
          is_production_validated: false,
          predicted_crop: pred.cropIdentified || null,
          crop_confidence: pred.cropConfidence ? pred.cropConfidence / 100 : null,
          primary_damage: pred.diseaseDetected || null,
          severity: pred.severityGrade?.toLowerCase() || null,
          overall_confidence: pred.modelConfidence ? pred.modelConfidence / 100 : null,
          affected_area_pct: pred.affectedAreaHectares || null,
          quality_warnings: claim.images.some((img) => !img.qualityPassed) ? ["unmeasured_or_failed_quality"] : [],
          anomaly_flags: isRealSha256(claim.images[0]?.sha256) ? [] : ["sha256_missing"],
          human_review_recommendation: "Human review required. No automated payout.",
        }
      : null,
    latest_evaluation: evaluationFromClaim(claim),
  };
}

export function emptyOverview(): Overview {
  return {
    total_submissions: 0,
    submissions_today: 0,
    pending_ai_processing: 0,
    pending_human_review: 0,
    verified_assessments: 0,
    recapture_requests: 0,
    high_severity_cases: 0,
    average_processing_seconds: 0,
    most_affected_crop: null,
    most_affected_district: null,
    low_confidence_rate: 0,
    submission_failure_rate: 0,
    average_evidence_confidence: 0,
    low_evidence_confidence_cases: 0,
    visual_uncertainty_cases: 0,
    coverage_uncertainty_cases: 0,
    context_uncertainty_cases: 0,
    integrity_flags: 0,
    recapture_rate: 0,
    evidence_resolution_rate: 0,
    avg_confidence_improvement: 0,
  };
}

export function overviewFromClaims(claims: FarmerClaim[]): Overview {
  const base = emptyOverview();
  const today = new Date().toISOString().slice(0, 10);
  const total = claims.length;
  const todayCount = claims.filter((c) => c.createdAt.startsWith(today)).length;
  const pending = claims.filter((c) => c.status === "under_review" || c.status === "submitted").length;
  const verified = claims.filter((c) => c.status === "verified").length;
  const recapture = claims.filter((c) => c.status === "needs_recapture").length;
  const high = claims.filter(
    (c) =>
      c.aiPrediction.severityGrade === "High" ||
      c.aiPrediction.severityGrade === "Severe" ||
      c.aiPrediction.severityPercentage >= 50
  ).length;
  const confidences = claims.map((c) => c.evidenceTrust.overallConfidence);
  const avgConf = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  const lowConf = claims.filter((c) => c.evidenceTrust.overallConfidence < 85).length;
  const integrityFlags = claims.filter((c) => c.evidenceTrust.integrityScore < 70).length;
  const visual = claims.filter((c) => c.evidenceTrust.qualityScore < 70).length;
  const coverage = claims.filter((c) => c.evidenceTrust.coverageScore < 80).length;
  const context = claims.filter((c) => c.evidenceTrust.contextScore < 70).length;
  const cropCounts = new Map<string, number>();
  for (const claim of claims) {
    if (claim.cropType) cropCounts.set(claim.cropType, (cropCounts.get(claim.cropType) || 0) + 1);
  }
  let mostCrop: string | null = null;
  let max = 0;
  for (const [crop, count] of cropCounts) {
    if (count > max) {
      max = count;
      mostCrop = crop;
    }
  }
  return {
    ...base,
    total_submissions: total,
    submissions_today: todayCount,
    pending_human_review: pending,
    verified_assessments: verified,
    recapture_requests: recapture,
    high_severity_cases: high,
    average_evidence_confidence: Number(avgConf.toFixed(1)),
    low_evidence_confidence_cases: lowConf,
    visual_uncertainty_cases: visual,
    coverage_uncertainty_cases: coverage,
    context_uncertainty_cases: context,
    integrity_flags: integrityFlags,
    recapture_rate: total ? recapture / total : 0,
    evidence_resolution_rate: total ? verified / total : 0,
    low_confidence_rate: total ? lowConf / total : 0,
    most_affected_crop: mostCrop,
  };
}

export function markersFromClaims(claims: FarmerClaim[]): MapMarker[] {
  const markers: MapMarker[] = [];
  for (const claim of claims) {
    const gps = claim.images.find((img) => img.lat != null && img.lon != null);
    if (!gps || gps.lat == null || gps.lon == null) continue;
    markers.push({
      id: claim.id,
      lat: gps.lat,
      lon: gps.lon,
      status: claim.status,
      severity: claim.aiPrediction.severityGrade?.toLowerCase() || null,
      crop_code: claim.cropType || null,
      primary_damage: claim.aiPrediction.diseaseDetected || null,
      confidence: claim.evidenceTrust.overallConfidence / 100,
      created_at: claim.createdAt,
    });
  }
  return markers;
}

export async function fetchReviewActions(claimId: string): Promise<WebReviewActionRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("web_review_actions")
    .select("*")
    .eq("claim_id", claimId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as WebReviewActionRow[];
}

export async function fetchAllReviewActions(): Promise<WebReviewActionRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("web_review_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data || []) as WebReviewActionRow[];
}

export interface ReviewActionPayload {
  action: string;
  notes?: string;
  reason?: string;
  override_reason?: string;
  required_angles?: string[];
  corrected_severity?: string;
  corrected_damage_codes?: string[];
  corrected_affected_area_pct?: number;
  corrected_crop?: string;
  corrected_growth_stage?: string;
  corrected_grade?: string;
}

export async function persistReviewAction(
  claimId: string,
  payload: ReviewActionPayload
): Promise<{ success: boolean; submission: Submission }> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const existing = await fetchWebClaimById(claimId);
  if (!existing) throw new Error("Claim not found");

  const action = payload.action;
  let status: ClaimStatus = existing.status;
  let missingAngles = existing.missingAngles || [];
  let recaptureReason = existing.recaptureReason;
  const reviewerNotes = payload.notes || payload.reason || payload.override_reason || existing.reviewerNotes;

  if (action === "accept" || action === "correct" || action === "override_correct") {
    status = "verified";
    missingAngles = [];
  } else if (action === "request_recapture") {
    status = "needs_recapture";
    missingAngles = payload.required_angles?.length ? payload.required_angles : missingAngles;
    recaptureReason = payload.reason || payload.override_reason || payload.notes || recaptureReason;
  } else if (action === "physical_inspection" || action === "request_physical_inspection") {
    status = "physical_inspection";
  }

  const next: FarmerClaim = {
    ...existing,
    status,
    missingAngles,
    recaptureReason,
    reviewerNotes,
    updatedAt: new Date().toISOString(),
    payoutStatus: status === "verified" ? "approved" : existing.payoutStatus,
  };

  if (payload.corrected_crop) {
    next.aiPrediction = { ...next.aiPrediction, cropIdentified: payload.corrected_crop };
  }
  if (payload.corrected_severity) {
    const grade =
      payload.corrected_severity === "high"
        ? "High"
        : payload.corrected_severity === "medium"
          ? "Medium"
          : payload.corrected_severity === "low"
            ? "Low"
            : next.aiPrediction.severityGrade;
    next.aiPrediction = { ...next.aiPrediction, severityGrade: grade };
  }
  if (payload.corrected_affected_area_pct != null) {
    next.aiPrediction = { ...next.aiPrediction, affectedAreaHectares: payload.corrected_affected_area_pct };
  }
  if (payload.corrected_damage_codes?.[0]) {
    next.aiPrediction = { ...next.aiPrediction, diseaseDetected: payload.corrected_damage_codes[0] };
  }

  const createdBy = await currentUserId();
  const { error: updateError } = await supabase
    .from("web_claims")
    .update({
      ...claimRowFromFarmer(next, createdBy),
      updated_at: next.updatedAt,
    })
    .eq("id", claimId);
  if (updateError) throw new Error(updateError.message);

  const actor = await currentActorLabel();
  const { error: actionError } = await supabase.from("web_review_actions").insert({
    id: newId(),
    claim_id: claimId,
    action,
    notes: payload.notes || null,
    reason: payload.reason || payload.override_reason || null,
    required_angles: payload.required_angles || null,
    actor,
    created_at: new Date().toISOString(),
  });
  if (actionError) throw new Error(actionError.message);

  return { success: true, submission: submissionFromClaim(next) };
}

export function analyticsFromClaims(claims: FarmerClaim[]) {
  const byCategory = new Map<string, number>();
  const bySeverity = new Map<string, number>();
  const byCrop = new Map<string, number>();
  for (const claim of claims) {
    const category = claim.aiPrediction.diseaseDetected || "Unassessed";
    byCategory.set(category, (byCategory.get(category) || 0) + 1);
    const severity = claim.aiPrediction.severityGrade || "Unassessed";
    bySeverity.set(severity, (bySeverity.get(severity) || 0) + 1);
    const crop = claim.cropType || "Unknown";
    byCrop.set(crop, (byCrop.get(crop) || 0) + 1);
  }
  return {
    byCategory: Array.from(byCategory, ([category, count]) => ({ category, count })),
    bySeverity: Array.from(bySeverity, ([severity, count]) => ({ severity, count })),
    byCrop: Array.from(byCrop, ([crop_name, count]) => ({ crop_name, count })),
  };
}

export function alertsFromClaims(claims: FarmerClaim[]) {
  return claims
    .filter((c) => c.status === "needs_recapture" || c.evidenceTrust.integrityScore < 70)
    .map((c) => ({
      id: `alert-${c.id}`,
      alert_type: c.status === "needs_recapture" ? "RECAPTURE_REQUIRED" : "INTEGRITY_GAP",
      severity: c.evidenceTrust.integrityScore < 70 ? "HIGH" : "MEDIUM",
      title: c.status === "needs_recapture" ? "Recapture requested" : "Integrity digest missing",
      message:
        c.status === "needs_recapture"
          ? `Claim ${c.id} needs recapture${c.missingAngles?.length ? ` of ${c.missingAngles.join(", ")}` : ""}.`
          : `Claim ${c.id} has no complete SHA-256 set.`,
      created_at: c.updatedAt,
      submission_id: c.id,
    }));
}
