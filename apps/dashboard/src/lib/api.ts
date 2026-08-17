import axios from "axios";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";
import {
  alertsFromClaims,
  analyticsFromClaims,
  emptyOverview,
  fetchAllReviewActions,
  fetchReviewActions,
  fetchWebClaimById,
  fetchWebClaims,
  markersFromClaims,
  overviewFromClaims,
  persistReviewAction,
  submissionFromClaim,
  type ReviewActionPayload,
} from "./web-db";

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
  if (isSupabaseConfigured()) {
    try {
      const res = await fetch("/api/claims");
      if (res.ok) {
        const body = (await res.json()) as { items?: Submission[] };
        if (Array.isArray(body.items)) return body.items;
      }
    } catch {
      // fall through to browser client
    }
    const claims = await fetchWebClaims();
    return claims.map(submissionFromClaim);
  }
  if (hasRealApiSession()) {
    const res = await api.get<{ items: Submission[] }>("/review/queue");
    return res.data.items || [];
  }
  return [];
}

export async function getClaim(id: string): Promise<Submission> {
  if (isSupabaseConfigured()) {
    try {
      const res = await fetch(`/api/claims/${id}`);
      if (res.ok) return (await res.json()) as Submission;
    } catch {
      // fall through
    }
    const claim = await fetchWebClaimById(id);
    if (!claim) throw new Error("Claim not found");
    return submissionFromClaim(claim);
  }
  if (hasRealApiSession()) {
    return (await api.get<Submission>(`/review/${id}`)).data;
  }
  throw new Error("Claim not found");
}

export async function applyReviewAction(id: string, payload: ReviewActionPayload) {
  if (isSupabaseConfigured()) {
    try {
      const res = await fetch(`/api/claims/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return res.json();
    } catch {
      // fall through
    }
    return persistReviewAction(id, payload);
  }
  if (hasRealApiSession()) {
    return (await api.post(`/review/${id}/action`, payload)).data;
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
  images: Array<{
    angleType: string;
    imageDataUrl: string;
    sha256?: string;
    lat?: number | null;
    lon?: number | null;
    accuracyM?: number | null;
  }>;
}): Promise<{ claimId: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  const res = await fetch("/api/claims", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    return fetchReviewActions(id);
  }
  if (hasRealApiSession()) {
    return (await api.get(`/review/${id}/history`)).data;
  }
  return [];
}

export async function overviewStats(): Promise<Overview> {
  if (isSupabaseConfigured()) {
    const claims = await fetchWebClaims();
    return overviewFromClaims(claims);
  }
  if (hasRealApiSession()) {
    return (await api.get<Overview>("/dashboard/overview")).data;
  }
  return emptyOverview();
}

export async function mapMarkers(params?: Record<string, string>): Promise<MapMarker[]> {
  if (isSupabaseConfigured()) {
    const claims = await fetchWebClaims();
    let markers = markersFromClaims(claims);
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
    const rows = await fetchAllReviewActions();
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
    const claims = await fetchWebClaims();
    return alertsFromClaims(claims);
  }
  if (hasRealApiSession()) {
    return (await api.get<AlertItem[]>("/dashboard/alerts")).data;
  }
  return [];
}

export async function analyticsByCategory() {
  if (isSupabaseConfigured()) {
    return analyticsFromClaims(await fetchWebClaims()).byCategory;
  }
  if (hasRealApiSession()) {
    return (await api.get("/dashboard/analytics/damage-by-category")).data;
  }
  return [];
}

export async function analyticsBySeverity() {
  if (isSupabaseConfigured()) {
    return analyticsFromClaims(await fetchWebClaims()).bySeverity;
  }
  if (hasRealApiSession()) {
    return (await api.get("/dashboard/analytics/severity-distribution")).data;
  }
  return [];
}

export async function analyticsByCrop() {
  if (isSupabaseConfigured()) {
    return analyticsFromClaims(await fetchWebClaims()).byCrop;
  }
  if (hasRealApiSession()) {
    return (await api.get("/dashboard/analytics/by-crop")).data;
  }
  return [];
}

export async function currentSessionRoles(): Promise<string[] | null> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const meta = data.session.user.app_metadata?.roles || data.session.user.user_metadata?.roles;
      if (Array.isArray(meta) && meta.length) return meta.map(String);
      return ["reviewer"];
    }
  }
  if (hasRealApiSession()) {
    const response = await api.get<{ roles: string[] }>("/auth/me");
    return response.data?.roles || [];
  }
  return null;
}
