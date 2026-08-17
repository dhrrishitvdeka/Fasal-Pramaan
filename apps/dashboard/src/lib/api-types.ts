export type Overview = {
  total_submissions: number;
  submissions_today: number;
  pending_ai_processing: number;
  pending_human_review: number;
  verified_assessments: number;
  recapture_requests: number;
  high_severity_cases: number;
  average_processing_seconds: number;
  most_affected_crop: string | null;
  most_affected_district: string | null;
  low_confidence_rate: number;
  submission_failure_rate: number;
  average_evidence_confidence?: number;
  low_evidence_confidence_cases?: number;
  visual_uncertainty_cases?: number;
  coverage_uncertainty_cases?: number;
  context_uncertainty_cases?: number;
  integrity_flags?: number;
  recapture_rate?: number;
  evidence_resolution_rate?: number;
  avg_confidence_improvement?: number;
};

export type MapMarker = {
  id: string;
  lat: number;
  lon: number;
  status: string;
  severity?: string | null;
  crop_code?: string | null;
  primary_damage?: string | null;
  confidence?: number | null;
  created_at?: string | null;
};

export interface EvidenceQualityDetails {
  blur_score?: number | null;
  brightness_score?: number | null;
  resolution_score?: number | null;
  framing_score?: number | null;
  crop_visibility?: number | boolean | string | null;
  damage_visibility?: number | boolean | string | null;
  consistency_score?: number | null;
  issues?: string[];
  [key: string]: unknown;
}

export interface EvidenceCoverageDetails {
  required_views?: string[] | number;
  usable_views?: string[] | number;
  missing_views?: string[];
  wide_context?: boolean | number | null;
  closeup_damage?: boolean | number | null;
  views_present?: number;
  views_required?: number;
  [key: string]: unknown;
}

export interface EvidenceContextDetails {
  gps_valid?: boolean | null;
  gps_accuracy_m?: number | null;
  plot_match?: boolean | null;
  capture_time_valid?: boolean | null;
  crop_context_matched?: boolean | null;
  weather_status?: "available" | "unavailable" | "pending" | "normal" | "abnormal" | string | null;
  distance_to_plot_m?: number | null;
  [key: string]: unknown;
}

export interface EvidenceIntegrityDetails {
  metadata_valid?: boolean | null;
  sha256_verified?: boolean | null;
  duplicate_detected?: boolean | null;
  perceptual_duplicate?: boolean | null;
  authenticity_verified?: boolean | null;
  tamper_check_passed?: boolean | null;
  server_check_passed?: boolean | null;
  is_mock_location?: boolean | null;
  flags?: string[];
  [key: string]: unknown;
}

export interface EvidenceComponentScore<T = unknown> {
  score: number;
  available: boolean;
  details?: T | null;
}

export interface EvidenceComponentDetails {
  quality: EvidenceComponentScore<EvidenceQualityDetails>;
  coverage: EvidenceComponentScore<EvidenceCoverageDetails>;
  context: EvidenceComponentScore<EvidenceContextDetails>;
  integrity: EvidenceComponentScore<EvidenceIntegrityDetails>;
}

export type UncertaintyType = "integrity" | "coverage" | "visual" | "context" | "none" | string;
export type UncertaintySeverity = "low" | "medium" | "high" | "critical" | string;
export type RecommendedAction =
  | "retake_image"
  | "request_specific_evidence"
  | "request_context"
  | "human_review"
  | "none"
  | string;

export interface UncertaintyInfo {
  present: boolean;
  type: UncertaintyType | null;
  severity: UncertaintySeverity | null;
  reasons: string[];
  recommended_action: RecommendedAction | null;
}

export interface EvidenceRequest {
  type?: string | null;
  reason_code?: string | null;
  required_angles?: string[] | null;
  title?: string | null;
  instructions?: string | null;
}

export interface EvidenceConfidence {
  final: number;
  threshold: number;
  quality?: number;
  coverage?: number;
  context?: number;
  integrity?: number;
}

export interface EvidenceEvaluation {
  id?: string | null;
  submission_id?: string | null;
  evaluation_version?: string | null;
  quality: EvidenceComponentScore<EvidenceQualityDetails>;
  coverage: EvidenceComponentScore<EvidenceCoverageDetails>;
  context: EvidenceComponentScore<EvidenceContextDetails>;
  integrity: EvidenceComponentScore<EvidenceIntegrityDetails>;
  confidence: EvidenceConfidence;
  uncertainty: UncertaintyInfo;
  request?: EvidenceRequest | null;
  created_at?: string | null;
  model_version?: string | null;
  confidence_delta?: number | null;
  previous_confidence?: number | null;
  previous_uncertainty?: string | null;
  actor?: string | null;
}

export type Submission = {
  id: string;
  crop_cycle_id: string;
  status: string;
  capture_lat?: number | null;
  capture_lon?: number | null;
  capture_accuracy_m?: number | null;
  farmer_observations?: string | null;
  severity?: string | null;
  final_severity?: string | null;
  final_assessment_notes?: string | null;
  images: Array<{
    id: string;
    angle_type: string;
    upload_status: string;
    download_url?: string | null;
    sha256?: string | null;
    quality_flags?: Record<string, unknown> | null;
  }>;
  latest_prediction?: {
    model_version: string;
    adapter_type: string;
    is_production_validated: boolean;
    promotion_status?: string | null;
    predicted_crop?: string | null;
    crop_confidence?: number | null;
    predicted_growth_stage?: string | null;
    predicted_grade?: "A" | "B" | "C" | "U" | null;
    grade_label?: string | null;
    grade_confidence?: number | null;
    grade_scores?: Record<string, number> | null;
    primary_damage?: string | null;
    severity?: string | null;
    overall_confidence?: number | null;
    affected_area_pct?: number | null;
    damage_scores?: Record<string, number> | null;
    quality_warnings?: string[] | null;
    anomaly_flags?: string[] | null;
    human_review_recommendation?: string | null;
    explanation?: Record<string, unknown> | null;
  } | null;
  latest_evaluation?: EvidenceEvaluation | null;
  evidence_evaluation?: EvidenceEvaluation | null;
};
