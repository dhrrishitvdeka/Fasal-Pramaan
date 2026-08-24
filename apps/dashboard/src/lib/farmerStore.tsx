"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { FarmerLang } from "./farmerI18n";
import { parseAppLang, persistAppLang } from "./live-indian-languages";
import { getWebClaim, listWebClaims, submitWebClaim } from "./api";
import { apiFetch } from "./auth-headers";
import { buildRecaptureSubmitInput, computeEvidencePreview } from "./claim-pipeline";
import { diffNewRecaptures, markSeen, type RecaptureNotice } from "./farmer-notifications";
import { isSupabaseConfigured } from "./supabase";
import { EMPTY_FARMER_PROFILE } from "./web-db";
import { buildDefaultMilestones } from "./growth-stages";
import { sanitizeMojibake } from "./name-sanitizer";
import type { ClaimIntent, Peril } from "./claim-routing";
import { INTENT_STORAGE_KEY } from "./claim-routing";

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
  angleType: "wide_field" | "left_context" | "mid_canopy" | "right_context" | "closeup_damage" | string;
  imageUrl: string;
  storagePath?: string;
  timestamp: string;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  sha256: string;
  qualityPassed: boolean;
  blurScore?: number;
  lightingScore?: number;
  greenPct?: number | null;
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
  peril?: string | null;
  intentId?: string | null;
  gateResult?: unknown;
  contextSignals?: unknown;
  adaptive_result?: unknown;
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
  getClaimById: (id: string) => FarmerClaim | undefined;
  createClaim: (
    claim: Omit<FarmerClaim, "id" | "createdAt" | "updatedAt" | "evidenceTrust" | "aiPrediction"> & {
      evidenceTrust?: ClaimEvidenceTrust;
      aiPrediction?: ClaimAiPrediction;
      peril?: Peril;
      intentId?: string;
      plotLat?: number | null;
      plotLon?: number | null;
      sowingDate?: string | null;
    }
  ) => Promise<FarmerClaim>;
  updateClaimRecapture: (
    claimId: string,
    recapturedImages: ClaimImageEvidence[],
  ) => Promise<FarmerClaim | undefined>;
  saveClaimDraft: (draft: Partial<FarmerClaim>) => string;
  loadClaimDraft: (draftId?: string) => Partial<FarmerClaim> | null;
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
  dismissNotice: (claimId: string) => void;
}

const FarmerContext = createContext<FarmerContextType | null>(null);
const STORAGE_KEY_LANG = "fp_farmer_lang_v1";
const STORAGE_KEY_DRAFT = "fp_farmer_active_draft_v1";

function loadStoredIntent(): ClaimIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(INTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClaimIntent;
    if (!parsed?.id || !parsed?.peril) return null;
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
    missingAngles: item.latest_evaluation?.coverage?.details?.missing_views,
    recaptureReason: item.final_assessment_notes || undefined,
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
      modelConfidence: Math.round((item.latest_prediction?.overall_confidence || 0) * 100),
      severityGrade: workflowGradeFromPrediction(item.latest_prediction),
    },
    payoutStatus: "pending_review",
    adaptive_result: item.adaptive_result ?? undefined,
  };
}

export function FarmerProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<FarmerLang>(() => {
    if (typeof window === "undefined") return "hi";
    try {
      const stored = localStorage.getItem("fasal_lang") || localStorage.getItem(STORAGE_KEY_LANG);
      return persistAppLang(stored, "hi");
    } catch {
      // ignore
    }
    return "hi";
  });

  useEffect(() => {
    const handleSync = (e: Event) => {
      const custom = e as CustomEvent<string>;
      const next = parseAppLang(custom.detail || localStorage.getItem("fasal_lang") || localStorage.getItem(STORAGE_KEY_LANG));
      if (next && next !== lang) {
        setLangState(next);
      }
    };

    window.addEventListener("fasal:lang-change", handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("fasal:lang-change", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [lang]);
  const [plots, setPlots] = useState<FarmerPlot[]>([]);
  const [claims, setClaims] = useState<FarmerClaim[]>([]);
  const [milestones, setMilestones] = useState<GrowthTimelineMilestone[]>([]);
  const [farmerProfile, setFarmerProfile] = useState(EMPTY_FARMER_PROFILE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIntent, setActiveIntentState] = useState<ClaimIntent | null>(() => loadStoredIntent());
  const [newRecaptureNotices, setNewRecaptureNotices] = useState<RecaptureNotice[]>([]);

  const refresh = async () => {
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
        const items = await listWebClaims().catch(() => []);
        setClaims(items.map(submissionToClaim));
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
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Recompute unseen recapture notices whenever the claims list changes (refresh flow).
  useEffect(() => {
    setNewRecaptureNotices(diffNewRecaptures(claims));
  }, [claims]);

  const dismissNotice = (claimId: string) => {
    markSeen(claimId);
    setNewRecaptureNotices((prev) => prev.filter((notice) => notice.claimId !== claimId));
  };

  const setLang = (newLang: FarmerLang) => {
    const next = parseAppLang(newLang);
    if (!next) return;
    setLangState(next);
    try {
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

  const setActiveIntent = (intent: ClaimIntent | null) => {
    setActiveIntentState(intent);
    persistIntent(intent);
  };
  const clearActiveIntent = () => {
    setActiveIntentState(null);
    persistIntent(null);
  };

  const getClaimById = (id: string) => claims.find((c) => c.id.toLowerCase() === id.toLowerCase());

  const createClaim = async (
    claimData: Omit<FarmerClaim, "id" | "createdAt" | "updatedAt" | "evidenceTrust" | "aiPrediction"> & {
      evidenceTrust?: ClaimEvidenceTrust;
      aiPrediction?: ClaimAiPrediction;
      peril?: Peril;
      intentId?: string;
      plotLat?: number | null;
      plotLon?: number | null;
      sowingDate?: string | null;
    },
  ): Promise<FarmerClaim> => {
    if (!isSupabaseConfigured()) {
      throw new Error("Supabase is not configured — claim was not stored");
    }
    const peril = claimData.peril || activeIntent?.peril || "normal";
    const intentId = claimData.intentId || activeIntent?.id;
    const result = await submitWebClaim({
      plotId: claimData.plotId,
      plotName: claimData.plotName,
      plotNameHi: claimData.plotNameHi,
      khasraNumber: claimData.khasraNumber,
      cropType: claimData.cropType,
      cropTypeHi: claimData.cropTypeHi,
      cropVariety: claimData.cropVariety,
      farmerObservations: claimData.farmerObservations,
      captureLat: claimData.images[0]?.lat,
      captureLon: claimData.images[0]?.lon,
      captureAccuracyM: claimData.images[0]?.accuracyM,
      peril,
      intentId,
      plotLat: claimData.plotLat,
      plotLon: claimData.plotLon,
      sowingDate: claimData.sowingDate ?? null,
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
        facing: img.facing,
        dimensions: img.dimensions,
        capturedAt: img.timestamp || undefined,
      })),
    });
    const persisted = await getWebClaim(result.claimId);
    const claim = submissionToClaim(persisted);
    setClaims((prev) => [claim, ...prev.filter((item) => item.id !== claim.id)]);
    try {
      sessionStorage.removeItem(STORAGE_KEY_DRAFT);
    } catch {
      // ignore
    }
    // keep intent until navigation leaves — caller clears after success
    return claim;
  };

  const updateClaimRecapture = async (
    claimId: string,
    recapturedImages: ClaimImageEvidence[],
  ): Promise<FarmerClaim | undefined> => {
    const existing = getClaimById(claimId);
    if (!existing) return undefined;
    if (!isSupabaseConfigured()) {
      throw new Error("Supabase is not configured — claim was not stored");
    }
    const payload = buildRecaptureSubmitInput(claimId, existing, recapturedImages);
    const result = await submitWebClaim(payload);
    const persisted = await getWebClaim(result.claimId);
    const claim = submissionToClaim(persisted);
    setClaims((prev) => prev.map((item) => (item.id === claim.id ? claim : item)));
    return claim;
  };

  const saveClaimDraft = (draft: Partial<FarmerClaim>): string => {
    const draftId = draft.id || `DRAFT-${Date.now()}`;
    try {
      sessionStorage.setItem(
        STORAGE_KEY_DRAFT,
        JSON.stringify({ ...draft, id: draftId, status: "draft", updatedAt: new Date().toISOString() }),
      );
    } catch {
      // ignore
    }
    return draftId;
  };

  const loadClaimDraft = (): Partial<FarmerClaim> | null => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY_DRAFT);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const snoozeMilestone = async (id: string, days: number) => {
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
        setError(err instanceof Error ? err.message : "Failed to update reminder");
      }
    }
  };

  const completeMilestone = async (id: string, imageUrl: string, notes?: string) => {
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
        getClaimById,
        createClaim,
        updateClaimRecapture,
        saveClaimDraft,
        loadClaimDraft,
        snoozeMilestone,
        completeMilestone,
        farmerProfile,
        activeIntent,
        setActiveIntent,
        clearActiveIntent,
        newRecaptureNotices,
        dismissNotice,
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
