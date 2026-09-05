import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import { isRealSha256 } from "./evidence";
import { resolveGeminiVisionModel } from "./gemini-models";
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
  khata_number?: string | null;
  hissa_number?: string | null;
  tehsil?: string | null;
  ownership_type?: string | null;
  season?: string | null;
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
  gps_status?: string | null;
  peril?: string | null;
  intent_id?: string | null;
  gate_result?: unknown;
  context_signals?: unknown;
  adaptive_result?: unknown;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  sowing_date?: string | null;
  model_id?: string | null;
  hf_label?: string | null;
  hf_score?: number | null;
  inference_status?: string | null;
  inference_error?: string | null;
  inference_started_at?: string | null;
  corrected_crop?: string | null;
  corrected_grade?: string | null;
  corrected_severity?: string | null;
  corrected_damage_codes?: string[] | null;
  corrected_affected_area_pct?: number | null;
  corrected_growth_stage?: string | null;
  growth_stage?: string | null;
  predicted_growth_stage?: string | null;
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
  gate_result?: unknown;
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
  email?: string | null;
  name?: string | null;
  name_hi?: string | null;
  full_name?: string | null;
  full_name_hi?: string | null;
  role?: string | null;
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
  nameHi: "",
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
    case "rejected":
      return value;
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
  const hectares = row.area_hectares ?? 0;
  const kattha = Number((hectares / 0.01265).toFixed(2));
  return {
    id: row.id,
    name: row.name || "",
    nameHi: row.name_hi || "",
    khasraNumber: row.khasra_number || "",
    khataNumber: row.khata_number || "",
    hissaNumber: row.hissa_number || "",
    tehsil: row.tehsil || "",
    ownershipType: row.ownership_type || "owner",
    season: row.season || "",
    areaHectares: hectares,
    areaKattha: kattha,
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
  let extra: Partial<FarmerClaim> = {};
  try {
    extra = {
      peril: (row as any).peril ?? null,
      intentId: (row as any).intent_id ?? null,
      gateResult: (row as any).gate_result ?? null,
      gate_result: (row as any).gate_result ?? null,
      contextSignals: (row as any).context_signals ?? null,
      context_signals: (row as any).context_signals ?? null,
      captureLat: row.capture_lat,
      captureLon: row.capture_lon,
    };
  } catch {
    extra = {};
  }

  const gateRes = (row as any).gate_result as any;
  const analysis = gateRes?.geminiAnalysis || gateRes?.analysis || null;
  const growthStage =
    row.corrected_growth_stage ||
    analysis?.growth_stage ||
    row.growth_stage ||
    row.predicted_growth_stage ||
    ((row as any).context_signals as any)?.growth_stage ||
    undefined;

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
    growthStage: growthStage || undefined,
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
          cropIdentified: row.corrected_crop || row.crop_identified || "",
          cropConfidence: row.crop_confidence ?? 0,
          diseaseDetected:
            (row.corrected_damage_codes && row.corrected_damage_codes.length > 0
              ? row.corrected_damage_codes[0]
              : row.disease_detected) || "",
          diseaseDetectedHi: row.disease_detected_hi || "",
          severityPercentage: row.corrected_affected_area_pct ?? row.severity_percentage ?? 0,
          severityGrade: asSeverityGrade(row.corrected_grade || row.corrected_severity || row.severity_grade),
          affectedAreaHectares: row.affected_area_hectares ?? 0,
          estimatedLossInr: row.estimated_loss_inr ?? 0,
          modelConfidence: row.model_confidence ?? 0,
          growthStage: growthStage || undefined,
        }
      : { ...EMPTY_AI_PREDICTION, growthStage: growthStage || undefined },
    payoutStatus:
      row.payout_status === "approved" ||
      row.payout_status === "pending_review" ||
      row.payout_status === "needs_action" ||
      row.payout_status === "processing"
        ? row.payout_status
        : undefined,
    payoutAmountInr: row.payout_amount_inr ?? undefined,
    ...extra,
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

export async function resolveImageUrl(
  imageUrl: string | null,
  storagePath: string | null,
  client?: SupabaseClient | null,
): Promise<string> {
  const supabase = client ?? getSupabaseClient();
  if (storagePath && supabase) {
    const { data, error } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return imageUrl || "";
}



function claimRowFromFarmer(claim: FarmerClaim, createdBy: string | null): Partial<WebClaimRow> {
  const gps = claim.images.find((img) => img.lat != null && img.lon != null);
  const pred = claim.aiPrediction;
  const trust = claim.evidenceTrust;
  const base: Partial<WebClaimRow> = {
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
    gps_status: (claim as any).gpsStatus ?? null,
    growth_stage: pred.growthStage || claim.growthStage || null,
    predicted_growth_stage: pred.growthStage || claim.growthStage || null,
    created_at: claim.createdAt,
    updated_at: claim.updatedAt,
    created_by: createdBy,
  };
  // Attach multi-signal columns best-effort â€” swallow unknown column errors via try/catch
  try {
    const extra: Partial<WebClaimRow> = {};
    const peril = (claim as any).peril ?? (claim as any).claimType ?? null;
    if (peril) (extra as any).peril = String(peril).toLowerCase();
    const intentId = (claim as any).intentId ?? (claim as any).intent_id ?? null;
    if (intentId) (extra as any).intent_id = String(intentId);
    const gate = (claim as any).gateResult ?? (claim as any).gate_result ?? null;
    if (gate != null) (extra as any).gate_result = gate as any;
    const ctx = (claim as any).contextSignals ?? (claim as any).context_signals ?? null;
    if (ctx != null) (extra as any).context_signals = ctx as any;
    return { ...base, ...extra };
  } catch {
    return base;
  }
}

function imageRowFromEvidence(claimId: string, image: ClaimImageEvidence): Partial<WebClaimImageRow> {
  try {
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
      gate_result: (image as any).gateResult ?? (image as any).gate_result ?? null,
    };
  } catch {
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
        views_required: 3,
        missing_views: missing,
        wide_context: claim.images.some((img) => img.angleType === "wide_field" || img.angleType === "photo_1"),
        closeup_damage: claim.images.some((img) => img.angleType === "closeup_damage" || img.angleType === "photo_3"),
        photo_1: claim.images.some((img) => img.angleType === "photo_1" || img.angleType === "wide_field"),
        photo_2: claim.images.some((img) => img.angleType === "photo_2" || img.angleType === "mid_canopy"),
        photo_3: claim.images.some((img) => img.angleType === "photo_3" || img.angleType === "closeup_damage"),
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
  let extra: any = {};
  try {
    extra = {
      peril: (claim as any).peril ?? null,
      intent_id: (claim as any).intentId ?? (claim as any).intent_id ?? null,
      gate_result: (claim as any).gateResult ?? (claim as any).gate_result ?? null,
      context_signals: (claim as any).contextSignals ?? (claim as any).context_signals ?? null,
      contextSignals: (claim as any).contextSignals ?? (claim as any).context_signals ?? null,
    };
  } catch {
    extra = {};
  }
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
    ...extra,
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
          model_version: resolveGeminiVisionModel(),
          adapter_type: "gemini_vision",
          is_production_validated: false,
          predicted_crop: pred.cropIdentified || null,
          crop_confidence: pred.cropConfidence ? pred.cropConfidence / 100 : null,
          primary_damage: pred.diseaseDetected || null,
          severity: pred.severityGrade?.toLowerCase() || null,
          overall_confidence: pred.modelConfidence ? pred.modelConfidence / 100 : null,
          affected_area_pct: pred.severityPercentage ?? null,
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
  const now = new Date();
  const todayStr = now.toDateString();
  const total = claims.length;
  const todayCount = claims.filter((c) => {
    try {
      return new Date(c.createdAt).toDateString() === todayStr;
    } catch {
      return false;
    }
  }).length;
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
    pending_ai_processing: claims.filter(
      (c) =>
        (c.status === "under_review" || c.status === "submitted") &&
        !c.aiPrediction.cropIdentified &&
        !c.aiPrediction.diseaseDetected &&
        (c.aiPrediction.modelConfidence || 0) === 0,
    ).length,
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

function mapSeverityGrade(grade?: string | null): string {
  const g = (grade || "").trim().toLowerCase();
  if (g === "c" || g === "high" || g === "severe" || g === "critical") return "high";
  if (g === "b" || g === "medium") return "medium";
  if (g === "a" || g === "low") return "low";
  if (g === "u" || g === "none") return "none";
  return g || "low";
}

export function markersFromClaims(claims: FarmerClaim[]): MapMarker[] {
  const markers: MapMarker[] = [];
  for (const claim of claims) {
    const gps = claim.images.find((img) => img.lat != null && img.lon != null);
    const lat = gps?.lat ?? claim.captureLat ?? null;
    const lon = gps?.lon ?? claim.captureLon ?? null;
    if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) continue;
    markers.push({
      id: claim.id,
      lat,
      lon,
      status: claim.status,
      severity: mapSeverityGrade(claim.aiPrediction.severityGrade),
      crop_code: claim.cropType || null,
      primary_damage: claim.aiPrediction.diseaseDetected || null,
      confidence: claim.evidenceTrust.overallConfidence / 100,
      created_at: claim.createdAt,
    });
  }
  return markers;
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


export interface PerilAnalytics {
  peril: string;
  count: number;
  avgConfidence: number;
  recaptureRate: number;
}

export function analyticsFromClaims(claims: FarmerClaim[]) {
  const byCategory = new Map<string, number>();
  const bySeverity = new Map<string, number>();
  const byCrop = new Map<string, number>();
  const byPeril = new Map<string, { count: number; confSum: number; recaptures: number }>();
  for (const claim of claims) {
    const category = claim.aiPrediction.diseaseDetected || "Unassessed";
    byCategory.set(category, (byCategory.get(category) || 0) + 1);
    const severity = claim.aiPrediction.severityGrade || "Unassessed";
    bySeverity.set(severity, (bySeverity.get(severity) || 0) + 1);
    const crop = claim.cropType || "Unknown";
    byCrop.set(crop, (byCrop.get(crop) || 0) + 1);
    const peril = String((claim as any).peril || "normal");
    const entry = byPeril.get(peril) || { count: 0, confSum: 0, recaptures: 0 };
    entry.count += 1;
    entry.confSum += claim.evidenceTrust?.overallConfidence ?? 0;
    if (claim.status === "needs_recapture") entry.recaptures += 1;
    byPeril.set(peril, entry);
  }
  return {
    byCategory: Array.from(byCategory, ([category, count]) => ({ category, count })),
    bySeverity: Array.from(bySeverity, ([severity, count]) => ({ severity, count })),
    byCrop: Array.from(byCrop, ([crop_name, count]) => ({ crop_name, count })),
    byPeril: Array.from(byPeril.entries())
      .map(([peril, v]): PerilAnalytics => ({
        peril,
        count: v.count,
        avgConfidence: Number((v.confSum / v.count).toFixed(1)),
        recaptureRate: v.count ? v.recaptures / v.count : 0,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

export function alertsFromClaims(claims: FarmerClaim[]) {
  const alerts: Array<{
    id: string;
    alert_type: string;
    severity: string;
    title: string;
    message: string;
    created_at?: string;
    submission_id?: string;
  }> = [];
  for (const c of claims) {
    const gate = (c as { gate_result?: { gateFailed?: boolean; overridden?: boolean } }).gate_result;
    if (c.status === "needs_recapture") {
      alerts.push({
        id: `alert-recapture-${c.id}`,
        alert_type: "recapture_required",
        severity: "medium",
        title: "Recapture requested",
        message: `Claim ${c.id} needs recapture${c.missingAngles?.length ? ` of ${c.missingAngles.join(", ")}` : ""}.`,
        created_at: c.updatedAt,
        submission_id: c.id,
      });
    }
    if (c.evidenceTrust.integrityScore < 70) {
      alerts.push({
        id: `alert-integrity-${c.id}`,
        alert_type: "integrity_gap",
        severity: "high",
        title: "Integrity flag",
        message: `Claim ${c.id} integrity score is ${c.evidenceTrust.integrityScore}.`,
        created_at: c.updatedAt,
        submission_id: c.id,
      });
    }
    if (gate?.gateFailed && !gate.overridden) {
      alerts.push({
        id: `alert-gate-${c.id}`,
        alert_type: "authenticity_blocked",
        severity: "high",
        title: "Authenticity gate blocked",
        message: `Claim ${c.id} failed the vision gate and still needs override or recapture.`,
        created_at: c.updatedAt,
        submission_id: c.id,
      });
    }
  }
  return alerts;
}
