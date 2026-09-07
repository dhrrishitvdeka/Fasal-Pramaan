"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { FarmerLang } from "./farmerI18n";
import { parseAppLang, persistAppLang } from "./live-indian-languages";
import { getWebClaim, listWebClaims, submitWebClaim } from "./api";
import { apiFetch } from "./auth-headers";
import { buildRecaptureSubmitInput, computeEvidencePreview } from "./claim-pipeline";
import {
  diffNewPayoutApprovals,
  diffNewRecaptures,
  diffNewRejections,
  markPayoutSeen,
  markSeen,
  markRejectionSeen,
  type PayoutNotice,
  type RecaptureNotice,
  type RejectionNotice,
} from "./farmer-notifications";
import { isSupabaseConfigured } from "./supabase";
import { EMPTY_FARMER_PROFILE } from "./web-db";
import { buildDefaultMilestones } from "./growth-stages";
import { sanitizeMojibake } from "./name-sanitizer";
import type { ClaimIntent, Peril } from "./claim-routing";
import { INTENT_STORAGE_KEY } from "./claim-routing";
import { webCaptureBridge } from "./voice/capture-bridge";
import { katthaToHectares, toKattha, type AreaUnit } from "./land-units";
import { saveDraftImagesToDb, clearDraftImagesFromDb } from "./draft-db";

export type PlotRegistrationInput = {
  name: string;
  nameHi?: string;
  cropType: string;
  cropTypeHi?: string;
  cropVariety?: string;
  khasraNumber?: string;
  khataNumber?: string;
  hissaNumber?: string;
  tehsil?: string;
  ownershipType?: "owner" | "tenant" | "sharecropper" | string;
  season?: "Kharif" | "Rabi" | "Zaid" | string;
  areaKattha?: number;
  areaHectares?: number;
  areaValue?: number;
  areaUnit?: AreaUnit;
  soilType?: string;
  soilTypeHi?: string;
  irrigationType?: string;
  irrigationTypeHi?: string;
  sowingDate?: string;
  village?: string;
  district?: string;
  state?: string;
  lat?: number | null;
  lon?: number | null;
};

export interface FarmerPlot {
  id: string;
  name: string;
  nameHi: string;
  khasraNumber: string;
  khataNumber?: string;
  hissaNumber?: string;
  tehsil?: string;
  ownershipType?: "owner" | "tenant" | "sharecropper" | string;
  season?: "Kharif" | "Rabi" | "Zaid" | string;
  areaHectares: number;
  areaKattha?: number;
  cropType: string;
  cropTypeHi: string;
  cropVariety: string;
  currentStage: string;
  currentStageHi: string;
  sowingDate: string;
  soilType: string;
  soilTypeHi: string;
  irrigationType: string;
  irrigationTypeHi: string;
  lat: number;
  lon: number;
  village: string;
  district: string;
  state: string;
}

export interface ClaimImageEvidence {
  id?: string;
  angleType: "photo_1" | "photo_2" | "photo_3" | "wide_field" | "left_context" | "mid_canopy" | "right_context" | "closeup_damage" | string;
  imageUrl: string;
  storagePath?: string;
  timestamp: string;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  sha256: string;
  pHash?: string;
  qualityPassed: boolean;
  blurScore?: number;
  lightingScore?: number;
  luma?: number | null;
  cropScore?: number | null;
  greenPct?: number | null;
  hintCode?: string | null;
  isScreenDetected?: boolean | null;
  isPersonDetected?: boolean | null;
  facing?: string | null;
  dimensions?: { width: number; height: number } | null;
  farmerObservation?: string | null;
}

export interface ClaimEvidenceTrust {
  qualityScore: number;
  coverageScore: number;
  contextScore: number;
  integrityScore: number;
  overallConfidence: number;
  qualityNotes?: string;
  coverageNotes?: string;
  contextNotes?: string;
  integrityNotes?: string;
}

export interface ClaimAiPrediction {
  cropIdentified: string;
  cropConfidence: number;
  diseaseDetected: string;
  diseaseDetectedHi: string;
  severityPercentage: number;
  severityGrade: "Low" | "Medium" | "High" | "Severe" | "A" | "B" | "C" | "U";
  affectedAreaHectares: number;
  estimatedLossInr: number;
  modelConfidence: number;
  growthStage?: string;
}

export type ClaimStatus =
  | "verified"
  | "needs_recapture"
  | "under_review"
  | "draft"
  | "submitted"
  | "physical_inspection"
  | "rejected";

export interface FarmerClaim {
  id: string;
  plotId: string;
  plotName: string;
  plotNameHi: string;
  khasraNumber: string;
  cropType: string;
  cropTypeHi: string;
  cropVariety: string;
  status: ClaimStatus;
  createdAt: string;
  updatedAt: string;
  farmerObservations: string;
  voiceNoteAudioUrl?: string;
  images: ClaimImageEvidence[];
  missingAngles?: string[];
  recaptureReason?: string;
  recaptureReasonHi?: string;
  reviewerNotes?: string;
  evidenceTrust: ClaimEvidenceTrust;
  aiPrediction: ClaimAiPrediction;
  payoutStatus?: "approved" | "pending_review" | "needs_action" | "processing";
  payoutAmountInr?: number;
  plotLat?: number | null;
  plotLon?: number | null;
  captureLat?: number | null;
  captureLon?: number | null;
  peril?: string | null;
  intentId?: string | null;
  gateResult?: unknown;
  contextSignals?: unknown;
  adaptive_result?: unknown;
  growthStage?: string;
  // compat aliases for DB column names
  gate_result?: unknown;
  context_signals?: unknown;
}

export interface GrowthTimelineMilestone {
  id: string;
  plotId: string;
  cropName: string;
  cropNameHi: string;
  stageName: string;
  stageNameHi: string;
  dayNumber: number;
  dueDate: string;
  completed: boolean;
  completedDate?: string;
  evidenceImageUrl?: string;
  notes?: string;
  isOverdue: boolean;
}

interface FarmerContextType {
  lang: FarmerLang;
  setLang: (lang: FarmerLang) => void;
  plots: FarmerPlot[];
  claims: FarmerClaim[];
  milestones: GrowthTimelineMilestone[];
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  persistError: string | null;
  refresh: () => Promise<void>;
  addPlot: (plot: FarmerPlot) => void;
  addMilestones: (milestones: GrowthTimelineMilestone[]) => void;
  registerPlot: (input: PlotRegistrationInput) => Promise<{ plotId: string }>;
  getClaimById: (id: string) => FarmerClaim | undefined;
  hydrateClaim: (id: string) => Promise<FarmerClaim | null>;
  createClaim: (
    claim: Omit<FarmerClaim, "id" | "createdAt" | "updatedAt" | "evidenceTrust" | "aiPrediction"> & {
      evidenceTrust?: ClaimEvidenceTrust;
      aiPrediction?: ClaimAiPrediction;
      peril?: Peril;
      intentId?: string;
      plotLat?: number | null;
      plotLon?: number | null;
      sowingDate?: string | null;
      submissionId?: string;
    }
  ) => Promise<FarmerClaim>;
  updateClaimRecapture: (
    claimId: string,
    recapturedImages: ClaimImageEvidence[],
  ) => Promise<FarmerClaim | undefined>;
  saveClaimDraft: (draft: Partial<FarmerClaim>) => { id: string; saved: boolean };
  loadClaimDraft: (draftId?: string) => Partial<FarmerClaim> | null;
  clearClaimDraft: () => void;
  refreshData: () => Promise<void>;
  snoozeMilestone: (id: string, days: number) => void | Promise<void>;
  completeMilestone: (id: string, imageUrl: string, notes?: string) => void | Promise<void>;
  farmerProfile: {
    name: string;
    nameHi: string;
    kisanId: string;
    phone: string;
    village: string;
    district: string;
    state: string;
  };
  activeIntent: ClaimIntent | null;
  setActiveIntent: (intent: ClaimIntent | null) => void;
  clearActiveIntent: () => void;
  newRecaptureNotices: RecaptureNotice[];
  newPayoutNotices: PayoutNotice[];
  newRejectionNotices: RejectionNotice[];
  dismissNotice: (claimId: string) => void;
  dismissPayoutNotice: (claimId: string) => void;
  dismissRejectionNotice: (claimId: string) => void;
}

const FarmerContext = createContext<FarmerContextType | null>(null);
const STORAGE_KEY_LANG = "fp_farmer_lang_v1";
const STORAGE_KEY_DRAFT = "fp_farmer_active_draft_v1";

const INTENT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function loadStoredIntent(): ClaimIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(INTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClaimIntent;
    if (!parsed?.id || !parsed?.peril) return null;
    const created = Date.parse(parsed.createdAt || "");
    if (Number.isFinite(created) && Date.now() - created > INTENT_MAX_AGE_MS) {
      sessionStorage.removeItem(INTENT_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
function persistIntent(intent: ClaimIntent | null) {
  if (typeof window === "undefined") return;
  try {
    if (!intent) sessionStorage.removeItem(INTENT_STORAGE_KEY);
    else sessionStorage.setItem(INTENT_STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // ignore
  }
}

function workflowGradeFromPrediction(
  prediction: Awaited<ReturnType<typeof listWebClaims>>[number]["latest_prediction"],
): ClaimAiPrediction["severityGrade"] {
  const grade = (prediction?.explanation as { predicted_grade?: string } | undefined)?.predicted_grade;
  if (grade === "A" || grade === "B" || grade === "C" || grade === "U") return grade;
  return "Low";
}

function emptyPrediction(): ClaimAiPrediction {
  return {
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
}

function submissionToClaim(item: Awaited<ReturnType<typeof listWebClaims>>[number]): FarmerClaim {
  return {
    id: item.id,
    plotId: item.crop_cycle_id,
    plotName: item.plot_name || item.crop_cycle_id,
    plotNameHi: item.plot_name_hi || "",
    khasraNumber: item.khasra_number || "",
    cropType: item.crop_type || item.latest_prediction?.predicted_crop || "",
    cropTypeHi: item.crop_type_hi || "",
    cropVariety: item.crop_variety || "",
    status: (item.status as ClaimStatus) || "under_review",
    createdAt: item.latest_evaluation?.created_at || new Date().toISOString(),
    updatedAt: item.latest_evaluation?.created_at || new Date().toISOString(),
    farmerObservations: item.farmer_observations || "",
    images: (item.images || []).map((img) => ({
      angleType: img.angle_type,
      imageUrl: img.download_url || "",
      timestamp: "",
      lat: item.capture_lat ?? null,
      lon: item.capture_lon ?? null,
      accuracyM: item.capture_accuracy_m ?? null,
      sha256: img.sha256 || "",
      qualityPassed: Boolean(img.sha256),
    })),
    missingAngles: item.missing_angles || item.latest_evaluation?.coverage?.details?.missing_views,
    recaptureReason: item.recapture_reason || undefined,
    recaptureReasonHi: item.recapture_reason_hi || undefined,
    reviewerNotes: item.final_assessment_notes || undefined,
    evidenceTrust: {
      qualityScore: item.latest_evaluation?.quality.score ?? 0,
      coverageScore: item.latest_evaluation?.coverage.score ?? 0,
      contextScore: item.latest_evaluation?.context.score ?? 0,
      integrityScore: item.latest_evaluation?.integrity.score ?? 0,
      overallConfidence: item.latest_evaluation?.confidence.final ?? 0,
    },
    aiPrediction: {
      ...emptyPrediction(),
      cropIdentified: item.latest_prediction?.predicted_crop || "",
      cropConfidence: Math.round((item.latest_prediction?.crop_confidence || 0) * 100),
      diseaseDetected: item.latest_prediction?.primary_damage || "",
      severityPercentage: item.latest_prediction?.affected_area_pct ?? 0,
      affectedAreaHectares: item.affected_area_hectares ?? 0,
      estimatedLossInr: item.estimated_loss_inr ?? 0,
      modelConfidence: Math.round((item.latest_prediction?.overall_confidence || 0) * 100),
      severityGrade: workflowGradeFromPrediction(item.latest_prediction),
      growthStage: item.latest_prediction?.predicted_growth_stage || undefined,
    },
    payoutStatus: (item.payout_status as any) || "pending_review",
    payoutAmountInr: item.payout_amount_inr ?? undefined,
    adaptive_result: item.adaptive_result ?? undefined,
    growthStage: item.latest_prediction?.predicted_growth_stage || undefined,
  };
}

function readStoredFarmerLang(): FarmerLang {
  if (typeof window === "undefined") return "hi";
  try {
    const stored = localStorage.getItem("fasal_lang") || localStorage.getItem(STORAGE_KEY_LANG);
    const parsed = persistAppLang(stored, "hi");
    if (parsed && typeof document !== "undefined") {
      document.documentElement.lang = parsed;
    }
    return parsed || "hi";
  } catch {
    return "hi";
  }
}

export function FarmerProvider({ children }: { children: React.ReactNode }) {
  // Lazy init from storage: avoids an en/hi first-paint flip when the user
  // already picked a language in a previous session.
  const [lang, setLangState] = useState<FarmerLang>(readStoredFarmerLang);

  useEffect(() => {
    const handleSync = (e: Event) => {
      const custom = e as CustomEvent<string>;
      let next: FarmerLang | null = null;
      try {
        next = parseAppLang(custom.detail || localStorage.getItem("fasal_lang") || localStorage.getItem(STORAGE_KEY_LANG));
      } catch {
        next = null;
      }
      if (next) {
        if (typeof document !== "undefined") {
          document.documentElement.lang = next;
        }
        setLangState(next);
      }
    };

    window.addEventListener("fasal:lang-change", handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("fasal:lang-change", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, []);
  const [plots, setPlots] = useState<FarmerPlot[]>([]);
  const [claims, setClaims] = useState<FarmerClaim[]>([]);
  const [milestones, setMilestones] = useState<GrowthTimelineMilestone[]>([]);
  const [farmerProfile, setFarmerProfile] = useState(EMPTY_FARMER_PROFILE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIntent, setActiveIntentState] = useState<ClaimIntent | null>(null);

  useEffect(() => {
    const storedIntent = loadStoredIntent();
    if (storedIntent) {
      setActiveIntentState(storedIntent);
    }
  }, []);
  const [newRecaptureNotices, setNewRecaptureNotices] = useState<RecaptureNotice[]>([]);
  const [newPayoutNotices, setNewPayoutNotices] = useState<PayoutNotice[]>([]);
  const [newRejectionNotices, setNewRejectionNotices] = useState<RejectionNotice[]>([]);

  // Serialize refreshes: concurrent polls/mutations interleaving caused
  // last-writer-wins stale overwrites of just-snoozed milestones and claims.
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const refresh = async () => {
    if (refreshInFlight.current) {
      await refreshInFlight.current.catch(() => {});
      return;
    }
    const run = (async () => {
      try {
        if (isSupabaseConfigured()) {
          const res = await apiFetch("/api/farmer/state");
          if (!res.ok) {
            throw new Error(res.status === 401 ? "Sign in required" : "Failed to load farmer data");
          }
          const body = (await res.json()) as {
            plots?: FarmerPlot[];
            claims?: FarmerClaim[];
            milestones?: GrowthTimelineMilestone[];
            profile?: typeof EMPTY_FARMER_PROFILE;
          };
          setPlots(body.plots || []);
          setClaims(body.claims || []);
          setMilestones(body.milestones || []);
          const rawProf = body.profile || { ...EMPTY_FARMER_PROFILE };
          setFarmerProfile({
            ...EMPTY_FARMER_PROFILE,
            ...rawProf,
            name: sanitizeMojibake(rawProf.name, "Farmer"),
            nameHi: sanitizeMojibake(rawProf.nameHi, ""),
          });
        } else {
          // Local-only mode has no server truth: merge, don't replace, or a
          // background poll wipes locally created claims within seconds.
          const items = await listWebClaims().catch(() => []);
          const incoming = items.map(submissionToClaim);
          setClaims((prev) => {
            const ids = new Set(incoming.map((c) => c.id));
            return [...prev.filter((c) => !ids.has(c.id)), ...incoming];
          });
        }
        setError(null);
      } catch (err) {
        if (!isSupabaseConfigured()) {
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load claims");
        }
      } finally {
        setLoading(false);
      }
    })();
    refreshInFlight.current = run;
    try {
      await run;
    } finally {
      if (refreshInFlight.current === run) refreshInFlight.current = null;
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Recompute unseen recapture, payout, and rejection notices whenever the claims list changes (refresh flow).
  useEffect(() => {
    setNewRecaptureNotices(diffNewRecaptures(claims));
    setNewPayoutNotices(diffNewPayoutApprovals(claims));
    setNewRejectionNotices(diffNewRejections(claims));
  }, [claims]);

  const dismissNotice = (claimId: string) => {
    markSeen(claimId);
    setNewRecaptureNotices((prev) => prev.filter((notice) => notice.claimId !== claimId));
  };

  const dismissPayoutNotice = (claimId: string) => {
    markPayoutSeen(claimId);
    setNewPayoutNotices((prev) => prev.filter((notice) => notice.claimId !== claimId));
  };

  const dismissRejectionNotice = (claimId: string) => {
    markRejectionSeen(claimId);
    setNewRejectionNotices((prev) => prev.filter((notice) => notice.claimId !== claimId));
  };

  const setLang = (newLang: FarmerLang) => {
    const next = parseAppLang(newLang);
    if (!next) return;
    setLangState(next);
    try {
      if (typeof document !== "undefined") {
        document.documentElement.lang = next;
      }
      localStorage.setItem(STORAGE_KEY_LANG, next);
      localStorage.setItem("fasal_lang", next);
      window.dispatchEvent(new CustomEvent("fasal:lang-change", { detail: next }));
    } catch {
      // ignore
    }
  };

  const addPlot = (plot: FarmerPlot) => {
    setPlots((prev) => [plot, ...prev.filter((p) => p.id !== plot.id)]);
    setMilestones((prev) => {
      if (prev.some((m) => m.plotId === plot.id)) return prev;
      const defaults = buildDefaultMilestones({
        plotId: plot.id,
        cropName: plot.cropType,
        cropNameHi: plot.cropTypeHi || plot.cropType,
        sowingDate: plot.sowingDate,
        createdBy: "local",
      }).map((m) => ({
        id: m.id,
        plotId: m.plot_id,
        cropName: m.crop_name,
        cropNameHi: m.crop_name_hi,
        stageName: m.stage_name,
        stageNameHi: m.stage_name_hi,
        dayNumber: m.day_number,
        dueDate: m.due_date,
        completed: m.completed,
        isOverdue: m.is_overdue,
      }));
      return [...prev, ...defaults];
    });
  };

  const addMilestones = (newMilestones: GrowthTimelineMilestone[]) => {
    setMilestones((prev) => [...prev, ...newMilestones]);
  };

  const registerPlot = async (input: PlotRegistrationInput): Promise<{ plotId: string }> => {
    const name = String(input.name || "").trim() || "Farm Plot";
    const nameHi = String(input.nameHi || name).trim();
    const cropType = String(input.cropType || "wheat").trim() || "wheat";
    const cropTypeHi = String(input.cropTypeHi || cropType).trim();
    const cropVariety = String(input.cropVariety || "").trim();
    const khasraNumber = String(input.khasraNumber || "").trim();
    const khataNumber = String(input.khataNumber || "").trim();
    const hissaNumber = String(input.hissaNumber || "").trim();
    const tehsil = String(input.tehsil || "").trim();
    const ownershipType = String(input.ownershipType || "owner").trim();
    const season = String(input.season || "").trim();
    const soilType = String(input.soilType || "").trim();
    const soilTypeHi = String(input.soilTypeHi || soilType).trim();
    const irrigationType = String(input.irrigationType || "").trim();
    const irrigationTypeHi = String(input.irrigationTypeHi || irrigationType).trim();
    const village = input.village?.trim() || farmerProfile.village || "";
    const district = input.district?.trim() || farmerProfile.district || "";
    const state = input.state?.trim() || farmerProfile.state || "";

    let areaHectares = 1;
    let areaKattha = input.areaKattha;
    if (input.areaKattha !== undefined && Number.isFinite(Number(input.areaKattha))) {
      areaHectares = katthaToHectares(Number(input.areaKattha));
      areaKattha = Number(input.areaKattha);
    } else if (input.areaHectares !== undefined && Number.isFinite(Number(input.areaHectares))) {
      areaHectares = Number(input.areaHectares);
    } else if (input.areaValue !== undefined && input.areaUnit) {
      const k = toKattha(Number(input.areaValue), input.areaUnit);
      areaHectares = katthaToHectares(k);
      areaKattha = k;
    }

    const lat = typeof input.lat === "number" && Number.isFinite(input.lat) ? input.lat : undefined;
    const lon = typeof input.lon === "number" && Number.isFinite(input.lon) ? input.lon : undefined;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const sowingDate = input.sowingDate?.trim() || today;

    if (isSupabaseConfigured()) {
      const res = await apiFetch("/api/farmer/plots", {
        method: "POST",
        body: JSON.stringify({
          name,
          nameHi,
          cropType,
          cropTypeHi,
          cropVariety,
          khasraNumber,
          khataNumber,
          hissaNumber,
          tehsil,
          ownershipType,
          season,
          areaKattha,
          areaHectares,
          areaValue: input.areaValue,
          areaUnit: input.areaUnit,
          soilType,
          irrigationType,
          village,
          district,
          state,
          sowingDate,
          lat,
          lon,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; plotId?: string };
      if (!res.ok) {
        throw new Error(body.error || "Could not register plot");
      }
      await refresh();
      return { plotId: body.plotId || "" };
    }

    const plotId = `plot_${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    addPlot({
      id: plotId,
      name,
      nameHi,
      khasraNumber,
      khataNumber,
      hissaNumber,
      tehsil,
      ownershipType,
      season,
      areaHectares,
      areaKattha,
      cropType,
      cropTypeHi,
      cropVariety,
      currentStage: "Sowing",
      currentStageHi: "बुवाई",
      sowingDate,
      soilType,
      soilTypeHi,
      irrigationType,
      irrigationTypeHi,
      lat: lat ?? 0,
      lon: lon ?? 0,
      village,
      district,
      state,
    });
    return { plotId };
  };

  const setActiveIntent = (intent: ClaimIntent | null) => {
    setActiveIntentState(intent);
    persistIntent(intent);
    webCaptureBridge.setIntent(intent);
  };
  const clearActiveIntent = () => {
    setActiveIntentState(null);
    persistIntent(null);
    webCaptureBridge.setIntent(null);
  };

  const getClaimById = (id: string) => claims.find((c) => c.id.toLowerCase() === id.toLowerCase());

  /**
   * Direct-link fallback: when the store is empty (refresh, new device,
   * logged-out session) fetch the single claim from the server and merge it
   * in. Returns null when the claim doesn't exist or isn't visible to the user.
   */
  const hydrateClaim = async (id: string): Promise<FarmerClaim | null> => {
    if (!isSupabaseConfigured()) return null;
    try {
      const persisted = await getWebClaim(id);
      const claim = submissionToClaim(persisted);
      setClaims((prev) => {
        const next = prev.map((item) => (item.id === claim.id ? claim : item));
        return next.some((item) => item.id === claim.id) ? next : [claim, ...prev];
      });
      return claim;
    } catch {
      return null;
    }
  };

  const createClaim = async (
    claimData: Omit<FarmerClaim, "id" | "createdAt" | "updatedAt" | "evidenceTrust" | "aiPrediction"> & {
      evidenceTrust?: ClaimEvidenceTrust;
      aiPrediction?: ClaimAiPrediction;
      peril?: Peril;
      intentId?: string;
      plotLat?: number | null;
      plotLon?: number | null;
      sowingDate?: string | null;
      // Stable client-generated idempotency key: retries of the same logical
      // claim reuse it so double-taps can't create twin rows.
      submissionId?: string;
    },
  ): Promise<FarmerClaim> => {
    const peril = claimData.peril || activeIntent?.peril || "normal";
    const intentId = claimData.intentId || activeIntent?.id;
    let claim: FarmerClaim;

    if (isSupabaseConfigured()) {
      const result = await submitWebClaim({
        id: claimData.submissionId || undefined,
        plotId: claimData.plotId,
        plotName: claimData.plotName,
        plotNameHi: claimData.plotNameHi,
        khasraNumber: claimData.khasraNumber,
        cropType: claimData.cropType,
        cropTypeHi: claimData.cropTypeHi,
        cropVariety: claimData.cropVariety,
        farmerObservations: claimData.farmerObservations,
        captureLat: claimData.images[0]?.lat ?? undefined,
        captureLon: claimData.images[0]?.lon ?? undefined,
        captureAccuracyM: claimData.images[0]?.accuracyM ?? undefined,
        peril,
        intentId: intentId || undefined,
        plotLat: claimData.plotLat ?? undefined,
        plotLon: claimData.plotLon ?? undefined,
        sowingDate: claimData.sowingDate || undefined,
        growthStage: claimData.growthStage || undefined,
        images: claimData.images.map((img) => ({
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
          hintCode: img.hintCode ?? undefined,
          isScreenDetected: img.isScreenDetected ?? undefined,
          isPersonDetected: img.isPersonDetected ?? undefined,
          facing: img.facing,
          dimensions: img.dimensions,
          capturedAt: img.timestamp || undefined,
        })),
      });
      if (result.plotUnlinked) {
        // Plot reference was dropped server-side (missing plot or transient
        // lookup failure): surface it so the farmer can re-link the plot.
        setError(
          "Claim saved, but the plot link was lost. Please re-link your plot from Reminders.",
        );
      }
      try {
        const persisted = await getWebClaim(result.claimId);
        claim = submissionToClaim(persisted);
      } catch {
        // Submit succeeded but hydration failed: never invent trust scores.
        // Mark pending hydration and re-sync in the background instead.
        claim = {
          ...claimData,
          id: result.claimId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "under_review",
          evidenceTrust: claimData.evidenceTrust || {
            qualityScore: 0,
            coverageScore: 0,
            contextScore: 0,
            integrityScore: 0,
            overallConfidence: 0,
          },
          aiPrediction: claimData.aiPrediction || emptyPrediction(),
        };
        void refresh().catch(() => {});
      }
    } else {
      // Local-only mode (no Supabase): no AI ran, so report zeroed scores and
      // an explicit "not analyzed" prediction instead of fabricated 90+ values.
      const claimId = `claim-${Date.now()}`;
      claim = {
        ...claimData,
        id: claimId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "under_review",
        evidenceTrust: claimData.evidenceTrust || {
          qualityScore: 0,
          coverageScore: 0,
          contextScore: 0,
          integrityScore: 0,
          overallConfidence: 0,
        },
        aiPrediction: claimData.aiPrediction || {
          ...emptyPrediction(),
          cropIdentified: claimData.cropType || "",
          diseaseDetected: "Not analyzed (offline mode)",
        },
      };
    }
    setClaims((prev) => [claim, ...prev.filter((item) => item.id !== claim.id)]);
    try {
      sessionStorage.removeItem(STORAGE_KEY_DRAFT);
    } catch {
      // ignore
    }
    clearActiveIntent();
    return claim;
  };

  const updateClaimRecapture = async (
    claimId: string,
    recapturedImages: ClaimImageEvidence[],
  ): Promise<FarmerClaim | undefined> => {
    if (isSupabaseConfigured()) {
      const existing = getClaimById(claimId);
      const payload = buildRecaptureSubmitInput(claimId, existing || {}, recapturedImages);
      const result = await submitWebClaim(payload);
      const persisted = await getWebClaim(result.claimId);
      const claim = submissionToClaim(persisted);
      setClaims((prev) => {
        const next = prev.map((item) => (item.id === claim.id ? claim : item));
        return next.some((item) => item.id === claim.id) ? next : [claim, ...prev];
      });
      return claim;
    }
    const existing = getClaimById(claimId);
    const claim: FarmerClaim = {
      ...(existing || ({} as any)),
      id: claimId,
      images: recapturedImages,
      status: "under_review",
      updatedAt: new Date().toISOString(),
      // Local-only mode: keep existing scores if present, else honest zeroes.
      evidenceTrust: existing?.evidenceTrust || {
        qualityScore: 0,
        coverageScore: 0,
        contextScore: 0,
        integrityScore: 0,
        overallConfidence: 0,
      },
      aiPrediction: existing?.aiPrediction || {
        ...emptyPrediction(),
        diseaseDetected: "Not analyzed (offline mode)",
      },
    };
    setClaims((prev) => {
      const next = prev.map((item) => (item.id === claim.id ? claim : item));
      return next.some((item) => item.id === claim.id) ? next : [claim, ...prev];
    });
    return claim;
  };

  const saveClaimDraft = (draft: Partial<FarmerClaim>): { id: string; saved: boolean } => {
    const draftId = draft.id || `DRAFT-${Date.now()}`;
    const images = (draft.images || []).map((img) => ({
      ...img,
      // data URLs blow the sessionStorage quota; keep metadata only in sessionStorage
      imageUrl: typeof img.imageUrl === "string" && img.imageUrl.startsWith("data:") ? "" : img.imageUrl,
    }));
    // Persist full images with data URLs to IndexedDB asynchronously so large blobs survive tab reload
    if (draft.images && draft.images.length > 0) {
      void saveDraftImagesToDb(draft.images as any);
    }
    try {
      sessionStorage.setItem(
        STORAGE_KEY_DRAFT,
        JSON.stringify({
          ...draft,
          images,
          id: draftId,
          status: "draft",
          updatedAt: new Date().toISOString(),
        }),
      );
      return { id: draftId, saved: true };
    } catch {
      return { id: draftId, saved: false };
    }
  };

  const loadClaimDraft = (): Partial<FarmerClaim> | null => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY_DRAFT);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const clearClaimDraft = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY_DRAFT);
      void clearDraftImagesFromDb();
    } catch {
      // ignore
    }
  };

  const snoozeMilestone = async (id: string, days: number) => {
    const previous = milestones;
    const updated = milestones.map((m) => {
      if (m.id !== id) return m;
      const d = new Date(m.dueDate);
      d.setDate(d.getDate() + days);
      return { ...m, dueDate: d.toISOString().split("T")[0], isOverdue: false };
    });
    setMilestones(updated);
    const next = updated.find((m) => m.id === id);
    if (next && isSupabaseConfigured()) {
      try {
        const res = await apiFetch(`/api/milestones/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            dueDate: next.dueDate,
            completed: next.completed,
            isOverdue: next.isOverdue,
          }),
        });
        if (!res.ok) throw new Error("Failed to update reminder");
      } catch (err) {
        // Roll back the optimistic update so the UI never sits ahead of the server.
        setMilestones(previous);
        setError(err instanceof Error ? err.message : "Failed to update reminder");
      }
    }
  };

  const completeMilestone = async (id: string, imageUrl: string, notes?: string) => {
    const previous = milestones;
    const updated = milestones.map((m) => {
      if (m.id !== id) return m;
      return {
        ...m,
        completed: true,
        completedDate: new Date().toISOString().split("T")[0],
        evidenceImageUrl: imageUrl,
        notes: notes || m.notes,
        isOverdue: false,
      };
    });
    setMilestones(updated);
    const next = updated.find((m) => m.id === id);
    if (next && isSupabaseConfigured()) {
      try {
        const res = await apiFetch(`/api/milestones/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            completed: next.completed,
            completedDate: next.completedDate,
            evidenceImageUrl: next.evidenceImageUrl,
            notes: next.notes,
            isOverdue: next.isOverdue,
          }),
        });
        if (!res.ok) throw new Error("Failed to complete reminder");
      } catch (err) {
        // Roll back the optimistic update so the UI never sits ahead of the server.
        setMilestones(previous);
        setError(err instanceof Error ? err.message : "Failed to complete reminder");
      }
    }
  };

  return (
    <FarmerContext.Provider
      value={{
        lang,
        setLang,
        plots,
        claims,
        milestones,
        loading,
        isLoading: loading,
        error,
        persistError: error,
        refresh,
        refreshData: refresh,
        addPlot,
        addMilestones,
        registerPlot,
        getClaimById,
        hydrateClaim,
        createClaim,
        updateClaimRecapture,
        saveClaimDraft,
        loadClaimDraft,
        clearClaimDraft,
        snoozeMilestone,
        completeMilestone,
        farmerProfile,
        activeIntent,
        setActiveIntent,
        clearActiveIntent,
        newRecaptureNotices,
        newPayoutNotices,
        newRejectionNotices,
        dismissNotice,
        dismissPayoutNotice,
        dismissRejectionNotice,
      }}
    >
      {children}
    </FarmerContext.Provider>
  );
}

export function useFarmerData() {
  const ctx = useContext(FarmerContext);
  if (!ctx) throw new Error("useFarmerData must be used within FarmerProvider");
  return ctx;
}

export function previewFromImages(images: ClaimImageEvidence[], peril?: string | null) {
  return computeEvidencePreview(
    images.map((img) => ({
      angleType: img.angleType,
      bytes: new Uint8Array(img.imageUrl ? 1 : 0),
      sha256: img.sha256,
      blurScore: img.blurScore,
      lightingScore: img.lightingScore,
      qualityPassed: img.qualityPassed,
      lat: img.lat,
      lon: img.lon,
      accuracyM: img.accuracyM,
    })),
    peril,
  );
}
