import axios from "axios";
import {
  SHOWCASE_OVERVIEW,
  SHOWCASE_MAP_MARKERS,
  SHOWCASE_ALERTS,
  SHOWCASE_ANALYTICS,
  SHOWCASE_AUDIT_LOGS,
  SHOWCASE_SUBMISSIONS,
  getLocalShowcaseSubmissions,
  updateLocalSubmission,
} from "./showcase-data";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "/backend";

export const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

let accessToken: string | null = "mock-demo-access-token";
let refreshToken: string | null = "mock-demo-refresh-token";
let refreshInFlight: Promise<string> | null = null;

export function setAuthToken(token: string | null) {
  accessToken = token;
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
    refreshToken = null;
  }
}

export function setSessionTokens(access: string, refresh: string) {
  refreshToken = refresh;
  setAuthToken(access);
}

export function loadStoredToken() {
  if (!accessToken) {
    accessToken = "mock-demo-access-token";
    refreshToken = "mock-demo-refresh-token";
    api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
  }
  return accessToken;
}

export async function logoutSession() {
  const token = refreshToken;
  try {
    if (token && accessToken && !token.startsWith("mock-demo")) {
      await api.post("/auth/logout", { refresh_token: token });
    }
  } catch {}
  setAuthToken("mock-demo-access-token");
  refreshToken = "mock-demo-refresh-token";
}

// Intercept errors and provide fallback mock data for showcase demo mode and offline Vercel previews
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    const url = original?.url || "";
    const method = (original?.method || "get").toLowerCase();

    // 1. Check if token refresh is genuinely needed on live backend
    if (
      error.response?.status === 401 &&
      refreshToken &&
      !refreshToken.startsWith("mock-demo") &&
      original &&
      !original._retried
    ) {
      original._retried = true;
      try {
        refreshInFlight ??= axios
          .post(`${API_BASE}/api/v1/auth/refresh`, { refresh_token: refreshToken })
          .then((response) => {
            setSessionTokens(response.data.access_token, response.data.refresh_token);
            return response.data.access_token as string;
          })
          .finally(() => {
            refreshInFlight = null;
          });
        const token = await refreshInFlight;
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api.request(original);
      } catch {
        setAuthToken("mock-demo-access-token");
      }
    }

    // 2. Mock Fallback Router for Showcase Demo Mode
    try {
      if (url.includes("/auth/me")) {
        return {
          data: {
            id: "usr-demo-reviewer",
            email: "reviewer@fasalpramaan.local",
            full_name: "Senior Agricultural Review Officer",
            roles: ["reviewer", "administrator"],
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/auth/login")) {
        setSessionTokens("mock-demo-access-token", "mock-demo-refresh-token");
        return {
          data: {
            access_token: "mock-demo-access-token",
            refresh_token: "mock-demo-refresh-token",
          },
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/dashboard/overview")) {
        return {
          data: SHOWCASE_OVERVIEW,
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/dashboard/map/markers")) {
        return {
          data: SHOWCASE_MAP_MARKERS,
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/dashboard/alerts")) {
        return {
          data: SHOWCASE_ALERTS,
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/dashboard/analytics/damage-by-category")) {
        return {
          data: SHOWCASE_ANALYTICS.byCategory,
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/dashboard/analytics/severity-distribution")) {
        return {
          data: SHOWCASE_ANALYTICS.bySeverity,
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/dashboard/analytics/by-crop")) {
        return {
          data: SHOWCASE_ANALYTICS.byCrop,
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/admin/audit-logs")) {
        return {
          data: SHOWCASE_AUDIT_LOGS,
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/admin/users")) {
        return {
          data: [
            {
              id: "usr-1",
              email: "reviewer@fasalpramaan.local",
              full_name: "Senior Agricultural Reviewer",
              roles: ["reviewer", "administrator"],
            },
          ],
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/admin/jurisdictions")) {
        return {
          data: [
            { code: "MH-JAL", name: "Jalgaon Division", level: "district" },
            { code: "MH-WAR", name: "Wardha Division", level: "district" },
            { code: "RJ-ALW", name: "Alwar Division", level: "district" },
            { code: "HR-KAR", name: "Karnal Division", level: "district" },
            { code: "MP-IND", name: "Indore Division", level: "district" },
            { code: "GJ-RAJ", name: "Rajkot Division", level: "district" },
          ],
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/admin/model-versions")) {
        return {
          data: [
            {
              name: "CropViT-Multimodal",
              version: "v2.4-pmfby-prod",
              adapter_type: "crop_vit_multimodal",
              is_production_validated: true,
            },
            {
              name: "YOLOv8-CropDamage",
              version: "v1.9-edge",
              adapter_type: "yolo_damage_detector",
              is_production_validated: true,
            },
          ],
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/admin/damage-categories")) {
        return {
          data: [
            { code: "BACTERIAL", name: "Bacterial & Fungal Blight" },
            { code: "PEST", name: "Pest Infestation / Stem Borer" },
            { code: "LODGING", name: "Weather Lodging & Wind Damage" },
            { code: "NUTRIENT", name: "Soil Deficiency / Chlorosis" },
          ],
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/review/queue")) {
        const subs = getLocalShowcaseSubmissions();
        return {
          data: { items: subs },
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      // Review Action submission handler
      const actionMatch = url.match(/\/review\/([^/]+)\/action/);
      if (actionMatch && method === "post") {
        const id = actionMatch[1];
        let payload: Record<string, unknown> = {};
        try {
          payload = typeof original?.data === "string" ? JSON.parse(original.data) : original?.data || {};
        } catch {}

        let newStatus = "verified";
        if (payload.action === "request_recapture") newStatus = "needs_recapture";
        if (payload.action === "request_physical_inspection") newStatus = "physical_inspection";
        if (payload.action === "override_correct") newStatus = "verified";

        const updated = updateLocalSubmission(id, {
          status: newStatus,
          final_severity: (payload.severity as string) || undefined,
          final_assessment_notes: (payload.notes as string) || (payload.reason as string) || "Decision recorded.",
        });

        return {
          data: { success: true, submission: updated, message: "Action recorded successfully." },
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      // Review detail endpoint
      const detailMatch = url.match(/\/review\/([^/]+)$/);
      if (detailMatch) {
        const id = detailMatch[1];
        const subs = getLocalShowcaseSubmissions();
        const found = subs.find((s) => s.id === id) || SHOWCASE_SUBMISSIONS[id] || subs[0];
        return {
          data: found,
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }

      if (url.includes("/history")) {
        return {
          data: [],
          status: 200,
          statusText: "OK",
          headers: {},
          config: original || {},
        };
      }
    } catch (fallbackError) {
      console.warn("Showcase fallback router encountered an issue:", fallbackError);
    }

    return Promise.reject(error);
  }
);

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

export type UncertaintyType =
  | "integrity"
  | "coverage"
  | "visual"
  | "context"
  | "none"
  | string;

export type UncertaintySeverity =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | string;

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
