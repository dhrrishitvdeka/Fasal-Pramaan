import axios from "axios";
import { apiFetch } from "./auth-headers";
import { resolveClaimClientPath } from "./claim-routes";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";
import { emptyOverview, type PerilAnalytics, type ReviewActionPayload } from "./web-db";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/backend";

export const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

const ACCESS_KEY = "fp_access_token";
const REFRESH_KEY = "fp_refresh_token";

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshInFlight: Promise<string> | null = null;

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function setAuthToken(token: string | null) {
  accessToken = token;
  writeStored(ACCESS_KEY, token);
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
    refreshToken = null;
    writeStored(REFRESH_KEY, null);
  }
}

export function setSessionTokens(access: string, refresh: string) {
  refreshToken = refresh;
  writeStored(REFRESH_KEY, refresh);
  setAuthToken(access);
}

export function loadStoredToken() {
  if (!accessToken) {
    const stored = readStored(ACCESS_KEY);
    const storedRefresh = readStored(REFRESH_KEY);
    if (stored) {
      accessToken = stored;
      refreshToken = storedRefresh;
      api.defaults.headers.common.Authorization = `Bearer ${stored}`;
    }
  }
  return accessToken;
}

export function hasRealApiSession(): boolean {
  loadStoredToken();
  return Boolean(accessToken);
}

export async function logoutSession() {
  const token = refreshToken || readStored(REFRESH_KEY);
  try {
    if (token && accessToken) {
      await api.post("/auth/logout", { refresh_token: token });
    }
  } catch {
    // ignore network errors on logout
  }
  try {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
  } catch {
    // ignore
  }
  setAuthToken(null);
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    if (
      error.response?.status === 401 &&
      refreshToken &&
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
        setAuthToken(null);
      }
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
  most_affected_peril?: string | null;
  peril_counts?: Record<string, number>;
  authenticity_rejects?: number;
  analytics_by_peril?: PerilAnalytics[];
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
  peril?: string | null;
  intent_id?: string | null;
  gate_result?: unknown;
  context_signals?: unknown;
  contextSignals?: unknown;
  adaptive_result?: unknown;
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

export type AlertItem = {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  created_at?: string;
  submission_id?: string;
};

export async function listClaims(): Promise<Submission[]> {
  const route = resolveClaimClientPath(isSupabaseConfigured(), "list");
  if (route.hosted) {
    const res = await apiFetch(route.path);
    if (!res.ok) throw new Error("Could not load claims");
    const body = (await res.json()) as { items?: Submission[] };
    return Array.isArray(body.items) ? body.items : [];
  }
  if (hasRealApiSession()) {
    const res = await api.get<{ items: Submission[] }>(route.path);
    return res.data.items || [];
  }
  return [];
}

export async function getClaim(id: string): Promise<Submission> {
  const route = resolveClaimClientPath(isSupabaseConfigured(), "get", id);
  if (route.hosted) {
    const res = await apiFetch(route.path);
    if (!res.ok) throw new Error("Claim not found");
    return (await res.json()) as Submission;
  }
  if (hasRealApiSession()) {
    return (await api.get<Submission>(route.path)).data;
  }
  throw new Error("Claim not found");
}

export async function applyReviewAction(id: string, payload: ReviewActionPayload) {
  const route = resolveClaimClientPath(isSupabaseConfigured(), "action", id);
  if (route.hosted) {
    const res = await apiFetch(route.path, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Review action failed");
    }
    return res.json();
  }
  if (hasRealApiSession()) {
    return (await api.post(route.path, payload)).data;
  }
  throw new Error("Sign in required to record a review action");
}

export const listWebClaims = listClaims;
export const getWebClaim = getClaim;
export const applyWebReviewAction = applyReviewAction;

export async function submitWebClaim(input: {
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
  images: Array<{
    angleType: string;
    imageDataUrl: string;
    sha256?: string;
    lat?: number | null;
    lon?: number | null;
    accuracyM?: number | null;
    lightingScore?: number | null;
    qualityPassed?: boolean | null;
  }>;
}): Promise<{ claimId: string; gate?: unknown; context?: unknown }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  const route = resolveClaimClientPath(true, "submit");
  const res = await apiFetch(route.path, {
    method: "POST",
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || "Failed to persist claim");
  }
  return body as { claimId: string };
}

export async function listReviewHistory(id: string) {
  if (isSupabaseConfigured()) {
    const res = await apiFetch(`/api/claims/${id}/actions`);
    if (!res.ok) return [];
    return res.json();
  }
  if (hasRealApiSession()) {
    return (await api.get(`/review/${id}/history`)).data;
  }
  return [];
}

async function reviewerStats(): Promise<{
  overview: Overview;
  markers: MapMarker[];
  alerts: AlertItem[];
  analytics: {
    byCategory: Array<{ category: string; count: number }>;
    bySeverity: Array<{ severity: string; count: number }>;
    byCrop: Array<{ crop_name: string; count: number }>;
    byPeril?: PerilAnalytics[];
  };
  actions: Array<{
    id: string;
    action: string | null;
    claim_id: string;
    actor: string | null;
    created_at: string | null;
    notes: string | null;
    reason: string | null;
  }>;
} | null> {
  const res = await apiFetch("/api/reviewer/stats");
  if (!res.ok) return null;
  return res.json();
}

export async function overviewStats(): Promise<Overview> {
  if (isSupabaseConfigured()) {
    const stats = await reviewerStats();
    if (!stats?.overview) return emptyOverview();
    return { ...stats.overview, analytics_by_peril: stats.analytics?.byPeril };
  }
  if (hasRealApiSession()) {
    return (await api.get<Overview>("/dashboard/overview")).data;
  }
  return emptyOverview();
}

export async function mapMarkers(params?: Record<string, string>): Promise<MapMarker[]> {
  if (isSupabaseConfigured()) {
    const stats = await reviewerStats();
    let markers = stats?.markers || [];
    if (params?.status) markers = markers.filter((m) => m.status === params.status);
    if (params?.severity) markers = markers.filter((m) => m.severity === params.severity);
    if (params?.crop) markers = markers.filter((m) => (m.crop_code || "").toLowerCase().includes(params.crop.toLowerCase()));
    if (params?.damage) {
      markers = markers.filter((m) => (m.primary_damage || "").toLowerCase().includes(params.damage.toLowerCase()));
    }
    if (params?.date_from) markers = markers.filter((m) => (m.created_at || "") >= params.date_from);
    if (params?.date_to) markers = markers.filter((m) => (m.created_at || "") <= params.date_to);
    return markers;
  }
  if (hasRealApiSession()) {
    return (await api.get<MapMarker[]>("/dashboard/map/markers", { params })).data;
  }
  return [];
}

export async function auditLogs() {
  if (isSupabaseConfigured()) {
    const stats = await reviewerStats();
    const rows = stats?.actions || [];
    return rows.map((row) => ({
      id: row.id,
      action: row.action || "review_action",
      entity_type: "claim",
      entity_id: row.claim_id,
      actor_id: row.actor || undefined,
      created_at: row.created_at || undefined,
      notes: row.notes || row.reason || undefined,
    }));
  }
  if (hasRealApiSession()) {
    return (
      await api.get<
        Array<{
          id: string;
          action: string;
          entity_type: string;
          entity_id?: string;
          actor_id?: string;
          created_at?: string;
          notes?: string;
        }>
      >("/admin/audit-logs")
    ).data;
  }
  return [];
}

export async function listAlerts(): Promise<AlertItem[]> {
  if (isSupabaseConfigured()) {
    const stats = await reviewerStats();
    return stats?.alerts || [];
  }
  if (hasRealApiSession()) {
    return (await api.get<AlertItem[]>("/dashboard/alerts")).data;
  }
  return [];
}

export async function analyticsByCategory() {
  if (isSupabaseConfigured()) {
    const stats = await reviewerStats();
    return stats?.analytics.byCategory || [];
  }
  if (hasRealApiSession()) {
    return (await api.get("/dashboard/analytics/damage-by-category")).data;
  }
  return [];
}

export async function analyticsBySeverity() {
  if (isSupabaseConfigured()) {
    const stats = await reviewerStats();
    return stats?.analytics.bySeverity || [];
  }
  if (hasRealApiSession()) {
    return (await api.get("/dashboard/analytics/severity-distribution")).data;
  }
  return [];
}

export async function analyticsByCrop() {
  if (isSupabaseConfigured()) {
    const stats = await reviewerStats();
    return stats?.analytics.byCrop || [];
  }
  if (hasRealApiSession()) {
    return (await api.get("/dashboard/analytics/by-crop")).data;
  }
  return [];
}

export async function currentSessionRoles(): Promise<string[] | null> {
  if (isSupabaseConfigured()) {
    const res = await apiFetch("/api/me");
    if (!res.ok) return null;
    const body = (await res.json()) as { roles?: string[] };
    return Array.isArray(body.roles) ? body.roles : null;
  }
  if (hasRealApiSession()) {
    if (typeof window !== "undefined") {
      const demo = sessionStorage.getItem("fp_demo_user");
      if (demo) {
        try {
          const parsed = JSON.parse(demo);
          if (Array.isArray(parsed.roles)) return parsed.roles;
        } catch {
          // ignore JSON parse error
        }
      }
    }
    const response = await api.get<{ roles: string[] }>("/auth/me").catch(() => null);
    return response?.data?.roles || ["reviewer", "administrator"];
  }
  return null;
}
