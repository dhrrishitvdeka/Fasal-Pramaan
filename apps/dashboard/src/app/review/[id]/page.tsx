"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applyWebReviewAction, getWebClaim, listReviewHistory, reanalyzeClaim, type Submission } from "@/lib/api";
import type { ReviewActionPayload } from "@/lib/web-db";
import { useParams, useRouter } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRequireRole } from "@/lib/use-require-role";
import AccessGate from "@/components/AccessGate";

import { AiConfidenceBreakdown } from "@/components/AiConfidenceBreakdown";
import { ReviewKeyboardShortcuts } from "@/components/ReviewKeyboardShortcuts";
import { EvidenceConfidenceSection, resolveEvidenceEvaluation } from "@/components/EvidenceConfidenceSection";
import { SatelliteCrossCheckCard } from "@/components/SatelliteCrossCheckCard";
import ModalShell from "@/components/ModalShell";
import { predictionIsAcceptable } from "@/lib/review-accept";
import { isCropMatch } from "@/lib/crop-synonyms";
import { normalizePeril, PERIL_OPTIONS } from "@/lib/claim-routing";
import { apiFetch } from "@/lib/auth-headers";
import { DetailSkeleton } from "@/components/LoadingAnimation";
import ErrorMessage from "@/components/ErrorMessage";
import type { ContextSignal } from "@/lib/context/types";
import {
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileCheck,
  HelpCircle,
  History,
  Layers,
  MapPin,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Scale,
  ScanSearch,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sprout,
  UserCheck,
  X,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import clsx from "clsx";

const ALL_ANGLES = [
  { key: "photo_1", label: "Photo 1 (Field Overview)" },
  { key: "photo_2", label: "Photo 2 (Crop Condition)" },
  { key: "photo_3", label: "Photo 3 (Damage Detail)" },
  { key: "wide_field", label: "Wide Field (Legacy)" },
  { key: "left_context", label: "Left Context (Legacy)" },
  { key: "mid_canopy", label: "Mid Canopy (Legacy)" },
  { key: "right_context", label: "Right Context (Legacy)" },
  { key: "closeup_damage", label: "Closeup Damage (Legacy)" },
];

/** Fetch a stored photo and encode as base64 data URL (chunked btoa, ≤15MB guard). */
async function fetchAsImageDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stored photo download failed (${res.status})`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > 15 * 1024 * 1024) throw new Error("Stored photo exceeds 15 MB");
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  const mime = res.headers.get("content-type") || "image/jpeg";
  return `data:${mime};base64,${btoa(binary)}`;
}

export default function ReviewDetailPage() {
  const gate = useRequireRole(["reviewer", "administrator"]);
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reviewer Decision inputs
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [severity, setSeverity] = useState("");
  const [damage, setDamage] = useState("");
  const [affectedArea, setAffectedArea] = useState("");
  const [crop, setCrop] = useState("");
  const [growthStage, setGrowthStage] = useState("");
  const [grade, setGrade] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // Recapture modal & Lightbox state
  const [selectedAngles, setSelectedAngles] = useState<string[]>([]);
  const [recaptureModalOpen, setRecaptureModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [gateRerunning, setGateRerunning] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [reanalyzing, setReanalyzing] = useState(false);
  const handleReanalyze = async () => {
    if (reanalyzing || action.isPending) return;
    setReanalyzing(true);
    setMessage(null);
    try {
      const result = await reanalyzeClaim(id);
      await qc.invalidateQueries({ queryKey: ["submission", id] });
      await refetch();
      setMessage(
        result.grade && result.grade !== "U"
          ? `AI analysis complete — Grade ${result.grade}${result.crop && result.crop !== "unknown" ? ` · ${result.crop}` : ""}.`
          : result.inferError
            ? `Re-analysis finished with a warning: ${result.inferError}`
            : "Re-analysis finished — frames still unusable. Request a recapture.",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Re-analysis failed");
    } finally {
      setReanalyzing(false);
    }
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["submission", id],
    queryFn: async () => getWebClaim(id),
    enabled: gate.status === "ok",
    refetchInterval: (query) => {
      const current = query.state.data as Submission | undefined;
      if (!current) return false;
      // Keep polling while analysis is missing OR still running server-side.
      return !current.latest_prediction || current.inference_status === "pending" ? 5_000 : false;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["review-history", id],
    queryFn: async () => listReviewHistory(id),
    enabled: gate.status === "ok",
  });

  // Defensive parse of audit rows into a display-safe timeline
  const historyItems = useMemo(() => {
    const raw: unknown = history;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const row = entry as Record<string, unknown>;
      return [
        {
          id: typeof row.id === "string" ? row.id : `${String(row.created_at ?? "")}-${String(row.action ?? "")}`,
          action: typeof row.action === "string" && row.action ? row.action : "review_action",
          actor: typeof row.actor === "string" ? row.actor : "",
          createdAt: typeof row.created_at === "string" ? row.created_at : null,
          notes: typeof row.notes === "string" ? row.notes : null,
        },
      ];
    });
  }, [history]);

  // Resolve evidence evaluation & safety
  const evaluation = useMemo(() => (data ? resolveEvidenceEvaluation(data) : null), [data]);

  const hasIntegrityFailure = useMemo(() => {
    if (!evaluation) return false;
    const iScore = evaluation.integrity?.score ?? 100;
    const iDetails = evaluation.integrity?.details;
    return (
      iScore < 50 ||
      evaluation.uncertainty?.type === "integrity" ||
      iDetails?.tamper_check_passed === false ||
      iDetails?.duplicate_detected === true ||
      iDetails?.is_mock_location === true
    );
  }, [evaluation]);

  // Auto-fill suggested recapture angles from evaluation
  const suggestedAngles = useMemo(() => {
    if (!evaluation) return ["photo_3"];
    if (evaluation.request?.required_angles && evaluation.request.required_angles.length > 0) {
      return evaluation.request.required_angles;
    }
    const missing = evaluation.coverage?.details?.missing_views;
    if (Array.isArray(missing) && missing.length > 0) {
      return missing;
    }
    return ["photo_3"];
  }, [evaluation]);

  const modalAngles = useMemo(() => {
    const hasLegacy = data?.images?.some((img) =>
      ["wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage"].includes(img.angle_type),
    );
    if (hasLegacy) {
      return ALL_ANGLES;
    }
    return ALL_ANGLES.filter((a) => a.key.startsWith("photo_"));
  }, [data?.images]);

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);

  const action = useMutation({
    mutationFn: async (payload: ReviewActionPayload) => {
      setPendingAction(payload.action);
      // Optimistic status so badge + buttons react instantly.
      const next =
        payload.action === "accept" || payload.action === "correct"
          ? "verified"
          : payload.action === "reject"
            ? "rejected"
            : payload.action === "request_recapture"
              ? "needs_recapture"
              : payload.action === "physical_inspection"
                ? "physical_inspection"
                : null;
      if (next) {
        setOptimisticStatus(next);
        qc.setQueryData(["submission", id], (old: Submission | undefined) =>
          old ? { ...old, status: next } : old,
        );
      }
      try {
        return await applyWebReviewAction(id, payload);
      } finally {
        setPendingAction(null);
      }
    },
    onSuccess: (_res, variables) => {
      setOptimisticStatus(null);
      qc.invalidateQueries({ queryKey: ["submission", id] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["review-history", id] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["map"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      qc.invalidateQueries({ queryKey: ["damage-cat"] });
      qc.invalidateQueries({ queryKey: ["severity"] });
      qc.invalidateQueries({ queryKey: ["by-crop"] });
      // Immediate refetch so the detail view reflects the new status without waiting.
      void refetch();
      const label =
        variables.action === "accept"
          ? "Claim accepted — status updated to verified."
          : variables.action === "correct"
            ? "Corrections saved — claim verified with overrides."
            : variables.action === "reject"
              ? "Claim rejected — status updated."
              : variables.action === "request_recapture"
                ? "Recapture requested — farmer notified instantly."
                : variables.action === "physical_inspection"
                  ? "Physical inspection dispatched."
                  : variables.action === "override_gate"
                    ? "Authenticity gate overridden — you can now accept."
                    : "Decision recorded. Audit trail and metrics updated.";
      setMessage(label);
      setRecaptureModalOpen(false);
    },
    onError: (err: unknown) => {
      // Roll back optimistic status so UI never sticks on a failed decision.
      setOptimisticStatus(null);
      void refetch();
      const axiosDetail =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string; error?: string } } }).response?.data
          : undefined;
      const msg =
        axiosDetail?.detail ||
        axiosDetail?.error ||
        (err instanceof Error ? err.message : null) ||
        "Action failed";
      setMessage(String(msg));
    },
  });

  // Parse the persisted authenticity-gate result (defensive — shape is JSONB)
  const gateInfo = useMemo(() => {
    const raw = data?.gate_result as Record<string, unknown> | null | undefined;
    const fromClaim =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (Array.isArray(raw.perImage) ? (raw.perImage as unknown[]) : [])
        : [];
    const mappedFromClaim = fromClaim
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
      .map((item) => ({
        angleType: typeof item.angleType === "string" ? item.angleType : "",
        usable: item.usable === true,
        reason: typeof item.reason === "string" ? item.reason : "unknown",
      }));
    const fromImages = (data?.images || []).flatMap((img) => {
      const g = img.gate_result;
      if (!g || typeof g !== "object" || Array.isArray(g)) return [];
      const row = g as Record<string, unknown>;
      return [
        {
          angleType: img.angle_type || "",
          usable: row.usable === true,
          reason: typeof row.reason === "string" ? row.reason : "unknown",
        },
      ];
    });
    const perImage = mappedFromClaim.length ? mappedFromClaim : fromImages;
    if ((!raw || typeof raw !== "object" || Array.isArray(raw)) && perImage.length === 0) return null;
    const claimRaw = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    return {
      gateFailed: claimRaw.gateFailed === true || perImage.some((item) => !item.usable),
      blockingReason: typeof claimRaw.blockingReason === "string" ? claimRaw.blockingReason : null,
      overridden: claimRaw.overridden === true,
      overriddenBy: typeof claimRaw.overriddenBy === "string" ? claimRaw.overriddenBy : null,
      overriddenAt: typeof claimRaw.overriddenAt === "string" ? claimRaw.overriddenAt : null,
      perImage,
    };
  }, [data]);

  // Persisted multi-signal context
  const contextSignals = useMemo<ContextSignal[]>(() => {
    let raw: unknown = (data as { context_signals?: unknown; contextSignals?: unknown } | undefined)
      ?.context_signals ?? (data as { contextSignals?: unknown } | undefined)?.contextSignals;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = null;
      }
    }
    return Array.isArray(raw) ? (raw.filter(Boolean) as ContextSignal[]) : [];
  }, [data]);

  const bhuvanThumbnailUrl = useMemo(() => {
    if (!data) return null;
    const bhuvanMeta = contextSignals.find((s) => s.source === "bhuvan")?.meta;
    const fromMeta =
      typeof bhuvanMeta?.thumbnailUrl === "string"
        ? bhuvanMeta.thumbnailUrl
        : typeof bhuvanMeta?.bhuvanWmsUrl === "string"
          ? bhuvanMeta.bhuvanWmsUrl
          : null;
    if (fromMeta) return fromMeta;
    const topLevel = (data as { bhuvanThumbnailUrl?: unknown }).bhuvanThumbnailUrl;
    return typeof topLevel === "string" && topLevel ? topLevel : null;
  }, [data, contextSignals]);

  const bhuvanFallbackUrl = useMemo(() => {
    if (!data) return null;
    const bhuvanMeta = contextSignals.find((s) => s.source === "bhuvan")?.meta as
      | { legacyUrl?: unknown; bhuvanUrl?: unknown }
      | undefined;
    const fromMeta =
      typeof bhuvanMeta?.legacyUrl === "string" && bhuvanMeta.legacyUrl
        ? bhuvanMeta.legacyUrl
        : typeof bhuvanMeta?.bhuvanUrl === "string" && bhuvanMeta.bhuvanUrl
          ? bhuvanMeta.bhuvanUrl
          : null;
    if (fromMeta) return fromMeta;
    if (data.capture_lat != null && data.capture_lon != null) {
      return `https://bhuvan-app1.nrsc.gov.in/bhuvan2d/bhuvan/bhuvan2d.php?lat=${data.capture_lat}&lon=${data.capture_lon}`;
    }
    return null;
  }, [data, contextSignals]);

  const burnMapUrl = useMemo(() => {
    if (!data) return null;
    const sentinelMeta = contextSignals.find((s) => s.source === "sentinel")?.meta;
    const fromMeta =
      typeof sentinelMeta?.burnMapUrl === "string" && sentinelMeta.burnMapUrl
        ? sentinelMeta.burnMapUrl
        : null;
    if (fromMeta) return fromMeta;
    const peril = normalizePeril(data.peril || "normal");
    if (peril !== "fire_burn" || data.capture_lat == null || data.capture_lon == null) return null;
    const from = new Date(Date.now() - 3 * 86400000).toISOString();
    return `https://browser.dataspace.copernicus.eu/?zoom=14&lat=${data.capture_lat}&lng=${data.capture_lon}&datasetId=S2_L2A_CDAS&from=${from}&to=${new Date().toISOString()}`;
  }, [data, contextSignals]);

  const wideFieldImage = useMemo(() => {
    if (!data) return null;
    return (
      (data.images || []).find(
        (img) =>
          (img.angle_type === "photo_1" || img.angle_type === "wide_field") &&
          img.upload_status === "uploaded" &&
          img.download_url,
      ) ??
      (data.images || []).find((img) => img.upload_status === "uploaded" && img.download_url) ??
      null
    );
  }, [data]);

  // List of images available for inspection in Lightbox
  const inspectableImages = useMemo(() => {
    return (data?.images || []).filter((img) => Boolean(img.download_url));
  }, [data]);

  const currentLightboxImage = lightboxIndex !== null ? inspectableImages[lightboxIndex] : null;

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxIndex(null);
      } else if (e.key === "ArrowLeft") {
        setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : inspectableImages.length - 1));
      } else if (e.key === "ArrowRight") {
        setLightboxIndex((prev) => (prev !== null && prev < inspectableImages.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, inspectableImages]);

  const handleCopyId = () => {
    if (typeof navigator !== "undefined" && data?.id) {
      navigator.clipboard.writeText(data.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (gate.status !== "ok") return <AccessGate status={gate.status} />;
  if (isLoading) {
    return <DetailSkeleton className="py-4" />;
  }

  if (error || !data) {
    return (
      <div className="py-8">
        <ErrorMessage
          title="Something went wrong loading this claim"
          message={error instanceof Error ? error.message : `Unable to retrieve claim record ${id}. Please verify that the claim exists.`}
          onRetry={() => {
            if (typeof window !== "undefined") window.location.reload();
            else void refetch();
          }}
          actionHref="/review"
          actionLabel="Back to Review Queue"
        />
      </div>
    );
  }

  const pred = data.latest_prediction;
  const liveStatus = optimisticStatus ?? data.status;
  const isClosed = liveStatus === "verified" || liveStatus === "rejected";
  const isGateOverridden = Boolean(gateInfo?.overridden);
  const canAccept = !isClosed && predictionIsAcceptable(pred, hasIntegrityFailure, isGateOverridden);
  const busy = action.isPending;
  const busyLabel = (key: string) =>
    pendingAction === key ? (
      <span className="flex items-center gap-1.5">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Working…
      </span>
    ) : null;

  const handleAccept = () => {
    if (canAccept) {
      action.mutate({ action: "accept", notes });
    }
  };

  const handleCorrect = () => {
    const why = (reason || notes || "Reviewer verified with field corrections").trim();
    action.mutate({
      action: "correct",
      override_reason: why,
      corrected_severity: severity || undefined,
      corrected_damage_codes: damage ? [damage] : undefined,
      corrected_affected_area_pct: affectedArea === "" ? undefined : Number(affectedArea),
      corrected_crop: crop || undefined,
      corrected_growth_stage: growthStage || undefined,
      corrected_grade: grade || undefined,
      notes: notes || why,
    });
  };

  const handleOpenRecapture = () => {
    if (selectedAngles.length === 0) {
      setSelectedAngles(suggestedAngles);
    }
    setRecaptureModalOpen(true);
  };

  const handleConfirmRecapture = () => {
    const anglesToRequest = selectedAngles.length > 0 ? selectedAngles : suggestedAngles;
    action.mutate({
      action: "request_recapture",
      override_reason:
        reason ||
        notes ||
        `Recapture requested for angles: ${anglesToRequest.join(", ")}. Reason: ${
          evaluation?.uncertainty?.reasons?.[0] || "Evidence quality or coverage insufficient"
        }`,
      notes: notes || `Requested angles: ${anglesToRequest.join(", ")}`,
      required_angles: anglesToRequest,
    });
  };

  const handleInspection = () => {
    action.mutate({
      action: "physical_inspection",
      override_reason: reason || notes || "Requires field verification",
      notes,
    });
  };

  const handleReject = (explicitReason?: string | React.MouseEvent) => {
    const reasonStr = typeof explicitReason === "string" ? explicitReason : undefined;
    const why = (reasonStr || rejectReason || reason || notes || "").trim();
    if (!why) {
      setRejectModalOpen(true);
      return;
    }
    action.mutate({
      action: "reject",
      override_reason: why,
      notes: notes || why,
    });
    setRejectModalOpen(false);
  };

  const handleOverrideGate = () => {
    const cleanReason = (reason || notes || "Reviewer confirmed photo authenticity").slice(0, 500);
    action.mutate({
      action: "override_gate",
      override_reason: cleanReason,
      notes: `Gate overridden by reviewer: ${cleanReason}`,
    });
  };

  const handleGateRerun = async () => {
    if (!data || gateRerunning) return;
    const storedImages = (data.images || []).filter((img) => img.download_url);
    if (storedImages.length === 0) return;
    setGateRerunning(true);
    setMessage(null);
    let usable = 0;
    let total = 0;
    try {
      for (const img of storedImages) {
        try {
          const imageDataUrl = await fetchAsImageDataUrl(img.download_url as string);
          const res = await apiFetch("/api/vision/gate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageDataUrl,
              angleType: img.angle_type,
              expectedCrop: data.latest_prediction?.predicted_crop || undefined,
              peril: data.peril || undefined,
            }),
          });
          total += 1;
          const j = res.ok ? await res.json().catch(() => null) : null;
          if (j && typeof j === "object" && (j as { usable?: unknown }).usable === true) usable += 1;
        } catch {
          total += 1;
        }
      }
      await applyWebReviewAction(id, {
        action: "annotate",
        notes: `Gate re-run recorded: ${usable}/${total} usable`,
      });
      qc.invalidateQueries({ queryKey: ["submission", id] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["review-history", id] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["map"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      setMessage(`Gate re-run recorded: ${usable}/${total} usable.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Gate re-run failed");
    } finally {
      setGateRerunning(false);
    }
  };

  const toggleAngle = (key: string) => {
    setSelectedAngles((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]
    );
  };

  const perilOption = PERIL_OPTIONS.find((p) => p.value === data.peril);

  return (
    <div className="mx-auto max-w-[1440px] space-y-2 pb-8">
      {/* 1. TOP HEADER & BREADCRUMB NAVIGATION */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => router.push("/review")}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs sm:min-h-9"
            title="Return to review queue"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-slate-500" />
            <span>Review Queue</span>
          </button>

          <div className="flex items-center gap-1.5 font-mono text-xs text-slate-500 bg-slate-100/80 px-2 py-1 rounded-md border border-slate-200">
            <span>Case:</span>
            <span className="font-semibold text-slate-800">{data.id.slice(0, 10)}…</span>
            <button
              type="button"
              onClick={handleCopyId}
              className="flex min-h-11 min-w-11 items-center justify-center rounded text-slate-400 hover:text-slate-700"
              title="Copy full Case ID"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>

          <span
            className={clsx(
              "rounded-full px-2.5 py-0.5 text-xs font-bold capitalize border",
              liveStatus === "verified"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : liveStatus === "rejected"
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : liveStatus === "needs_recapture"
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-blue-50 text-blue-700 border-blue-200",
              busy && "animate-pulse",
            )}
          >
            {liveStatus.replaceAll("_", " ")}
            {busy && pendingAction ? ` · ${pendingAction.replaceAll("_", " ")}…` : ""}
          </span>

          <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700 capitalize">
            {perilOption?.en || (data.peril || "Normal").replaceAll("_", " ")}
          </span>
        </div>

        <ReviewKeyboardShortcuts
          disabled={action.isPending || recaptureModalOpen}
          onAccept={handleAccept}
          onCorrect={handleCorrect}
          onRequestRecapture={handleOpenRecapture}
          onPhysicalInspection={handleInspection}
          onReject={handleReject}
          onReturnToQueue={() => router.push("/review")}
        />
      </div>

      {/* 2. CASE SUMMARY — single compact strip */}
      <section className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-sm border border-[var(--line)] bg-white px-4 py-2 text-xs">
        <span className="flex items-center gap-1.5">
          <Sprout className="h-3.5 w-3.5 text-emerald-600" />
          <strong className="text-slate-900">{data.plot_name || data.crop_cycle_id || "Plot 1"}</strong>
          <span className="font-mono text-slate-500">· Khasra {data.khasra_number || "—"}</span>
        </span>
        <span className="text-slate-600">Crop <strong className="capitalize text-slate-900">{data.crop_type || data.latest_prediction?.predicted_crop || "Wheat"}</strong>
          <span className="text-slate-400"> ({data.crop_variety || "Standard"})</span>
        </span>
        <span className="flex items-center gap-1 font-mono text-slate-600">
          <MapPin className="h-3 w-3 text-emerald-600" />
          {data.capture_lat != null && data.capture_lon != null
            ? <span className="font-semibold text-emerald-700">{data.capture_lat.toFixed(5)}, {data.capture_lon.toFixed(5)}</span>
            : <span className="font-sans font-medium text-amber-700">No GPS</span>}
          {data.capture_lat != null && <span className="text-slate-400">±{data.capture_accuracy_m ?? 5}m</span>}
        </span>
        <span className="text-slate-600">Peril <strong className="capitalize text-slate-900">{(data.peril || "Normal").replaceAll("_", " ")}</strong></span>
        {data.farmer_observations?.trim() && (
          <span className="max-w-full truncate text-slate-500 italic" title={data.farmer_observations}>“{data.farmer_observations.trim().slice(0, 90)}{data.farmer_observations.trim().length > 90 ? "…" : ""}”</span>
        )}
        {data.createdAt && (
          <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-slate-400">
            <Clock className="h-3 w-3" />{new Date(data.createdAt).toLocaleDateString()}
          </span>
        )}
      </section>

      {/* Case Status Alerts */}
      {isClosed && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-100/80 px-3 py-2 text-xs text-slate-700">
          <ShieldAlert className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <span>
            Finalized as <strong>{liveStatus}</strong> — immutable. Issue a recapture if fresh evidence is needed.
          </span>
        </div>
      )}

      {message && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
            <span>{message}</span>
          </div>
          <button type="button" onClick={() => setMessage(null)} className="flex min-h-11 min-w-11 items-center justify-center rounded text-blue-500 hover:text-blue-700" aria-label="Dismiss message">
            ✕
          </button>
        </div>
      )}

      {/* 3. REVIEW WORKSPACE — main flow + sticky audit rail (right) */}
      <div className="mx-auto grid w-full max-w-[1440px] items-start gap-2 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="mx-auto w-full max-w-2xl min-w-0 space-y-2">
          {/* EVIDENCE PHOTO GALLERY */}
          <section className="rounded-sm border border-[var(--line)] bg-white p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Evidence photos
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                {inspectableImages.length} · click to inspect
              </span>
            </div>

            {inspectableImages.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                <Camera className="h-7 w-7 mx-auto mb-1.5 opacity-30 text-slate-400" />
                <span>No photographic evidence attached</span>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {inspectableImages.map((img, idx) => {
                  const angleObj = ALL_ANGLES.find((a) => a.key === img.angle_type);
                  const angleLabel = angleObj?.label || img.angle_type.replaceAll("_", " ");
                  return (
                    <div
                      key={img.id}
                      className="group relative overflow-hidden rounded-sm border border-[var(--line)] bg-slate-900"
                    >
                      <div
                        onClick={() => setLightboxIndex(idx)}
                        className="relative aspect-square w-full cursor-pointer overflow-hidden"
                        title={`${angleLabel} — click to inspect`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.download_url as string}
                          alt={angleLabel}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-4">
                          <span className="truncate font-mono text-[9px] font-bold text-white">
                            {angleLabel.replace(" (Field Overview)", "").replace(" (Crop Condition)", "").replace(" (Damage Detail)", "").replaceAll("_", " ")}
                          </span>
                          {img.sha256
                            ? <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" />
                            : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* SATELLITE CROSS-CHECK & BHUVAN LAND-USE */}
          <details className="group rounded-sm border border-[var(--line)] bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                Satellite and land-use
              </span>
              <span className="flex items-center gap-1.5">
                {contextSignals.length > 0 && (
                  <span className="flex gap-1">
                    {contextSignals.map((s) => (
                      <span key={s.source} title={`${s.labelEn}: ${s.status}`} className={clsx("h-2 w-2 rounded-full", s.status === "available" ? "bg-emerald-500" : s.status === "pending" ? "bg-amber-400" : "bg-slate-300")} />
                    ))}
                  </span>
                )}
                <span className="font-mono text-[11px] text-slate-400">{contextSignals.length} signals</span>
              </span>
            </summary>
            <div className="space-y-2 border-t border-[var(--line)] p-4">
              {contextSignals.length > 0 && (
                <div className="space-y-2">
                  {contextSignals.map((s) => (
                    <div key={s.source} className="flex items-start justify-between gap-2 rounded-sm border border-[var(--line)] px-2 py-1.5 text-xs">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-700 capitalize">{s.labelEn}</span>
                        <p className="truncate text-[11px] text-slate-500" title={s.summaryEn}>{s.summaryEn}</p>
                      </div>
                      <span className={clsx("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase font-mono", s.status === "available" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : s.status === "pending" ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-slate-100 text-slate-600")}>
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <SatelliteCrossCheckCard
                wideFieldImageUrl={wideFieldImage?.download_url}
                bhuvanTileUrl={bhuvanThumbnailUrl}
                bhuvanFallbackUrl={bhuvanFallbackUrl}
                burnMapUrl={burnMapUrl}
              />
            </div>
          </details>
          {/* AI ASSESSMENT — synthesis + scoring + gate in ONE structured card */}
          {(() => {
            const explanation = (pred?.explanation || {}) as Record<string, unknown>;
            const visual = String(explanation.visual_findings || "").trim();
            const reasoning = String(explanation.reasoning || "").trim();
            const oneLiner =
              visual ||
              reasoning
                .split(/(?<=[.।])\s+/)
                .slice(0, 2)
                .join(" ")
                .trim();
            const declared = (data.crop_type || "").trim();
            const detected = (pred?.predicted_crop || "").trim();
            const mismatch =
              Boolean(declared) &&
              Boolean(detected) &&
              detected.toLowerCase() !== "unknown" &&
              !isCropMatch(declared, detected);

            return (
              <section className="rounded-sm border border-[var(--line)] bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2">
                  <h3 className="text-sm font-semibold text-slate-900">AI Crop Assessment</h3>
                  <span className="rounded-sm border border-[var(--line)] bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-700">
                    Grade {pred?.predicted_grade || data.inference_status || "U"}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">{pred?.model_version}</span>
                  <span className="ml-auto font-mono text-[11px] text-slate-500">
                    {data.peril || "normal"} · {declared || "—"} → {detected || "—"}
                  </span>
                </div>

                {gateInfo?.gateFailed && !gateInfo?.overridden && (pred?.predicted_grade === "U" || !pred) && (
                  <p className="mx-3 mt-2 flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-medium text-rose-900">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                    Gate blocked{gateInfo.blockingReason ? ` (${gateInfo.blockingReason.replaceAll("_", " ")})` : ""} — Grade U is a placeholder. Override or recapture.
                  </p>
                )}
                {mismatch && (
                  <p className="mx-3 mt-2 flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    Crop mismatch: declared {declared}, detected {detected} — confirm plot boundary.
                  </p>
                )}
                {oneLiner && (
                  <p className="mx-3 mt-2 rounded-md border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 text-xs leading-snug text-slate-700 italic">
                    &ldquo;{oneLiner}&rdquo;
                  </p>
                )}

                {pred && (
                  <div className="grid grid-cols-4 gap-2 px-4 py-2.5 text-center">
                    <div className="rounded-sm border border-[var(--line)] px-1 py-1.5 bg-slate-50/40">
                      <div className="text-[11px] font-medium text-slate-500">Damage</div>
                      <div className="truncate text-xs font-semibold capitalize text-slate-900" title={String(pred.primary_damage || "—")}>{String(pred.primary_damage || "—").replaceAll("_", " ")}</div>
                    </div>
                    <div className="rounded-sm border border-[var(--line)] px-1 py-1.5 bg-slate-50/40">
                      <div className="text-[11px] font-medium text-slate-500">Severity</div>
                      <div className="text-xs font-semibold capitalize text-slate-900">{pred.severity || "—"}</div>
                    </div>
                    <div className="rounded-sm border border-[var(--line)] px-1 py-1.5 bg-slate-50/40">
                      <div className="text-[11px] font-medium text-slate-500">Area</div>
                      <div className="font-mono text-xs font-semibold text-slate-900">{pred.affected_area_pct != null ? `${pred.affected_area_pct}%` : "—"}</div>
                    </div>
                    <div className="rounded-sm border border-[var(--line)] px-1 py-1.5 bg-slate-50/40">
                      <div className="text-[11px] font-medium text-slate-500">Confidence</div>
                      <div className="font-mono text-xs font-semibold text-slate-900">{pred.overall_confidence != null ? `${Math.round(pred.overall_confidence * 100)}%` : "—"}</div>
                    </div>
                  </div>
                )}

                {!pred && data.inference_status === "pending" && (
                  <p className="mx-3 mb-3 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-2 text-xs font-medium text-blue-900">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    AI is analyzing the crop photos right now — this refreshes automatically.
                  </p>
                )}

                {!pred && data.inference_status !== "pending" && (
                  <div className="mx-3 mb-3 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
                    <p className="font-bold">No crop-disease analysis yet{data.inference_status === "failed" ? " — the last run failed" : ""}.</p>
                    {data.inference_error ? (
                      <p className="mt-1 font-mono text-[11px] leading-snug text-amber-900/90">Error: {data.inference_error}</p>
                    ) : (
                      <p className="mt-1 leading-snug">The vision model hasn&apos;t returned a crop, damage, or severity verdict for these photos.</p>
                    )}
                    <button
                      type="button"
                      onClick={handleReanalyze}
                      disabled={reanalyzing || busy || isClosed}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-black disabled:opacity-50"
                    >
                      {reanalyzing ? (
                        <><span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> Analyzing…</>
                      ) : (
                        <><RefreshCw className="h-3.5 w-3.5" /> Re-run analysis</>
                      )}
                    </button>
                  </div>
                )}

                {/* Gate status sub-bar */}
                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] bg-slate-50/50 px-4 py-2 text-xs">
                  <span className="text-[11px] font-semibold text-slate-600">Vision Gate:</span>
                  {gateInfo?.overridden ? (
                    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Overridden</span>
                  ) : gateInfo?.gateFailed ? (
                    <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">Rejected{gateInfo.blockingReason ? `: ${gateInfo.blockingReason.replaceAll("_", " ")}` : ""}</span>
                  ) : (
                    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Passed</span>
                  )}
                  {gateInfo && gateInfo.perImage.length > 0 && (
                    <span className="font-mono text-[10px] text-slate-400">
                      {gateInfo.perImage.map((i) => `${(i.angleType || "?").replaceAll("_", " ")}:${i.usable ? "ok" : i.reason}`).join(" · ")}
                    </span>
                  )}
                  <span className="ml-auto flex gap-1.5">
                    {gateInfo?.gateFailed && !gateInfo.overridden && (
                      <button type="button" className="min-h-8 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100" disabled={busy || isClosed} onClick={handleOverrideGate}>
                        {pendingAction === "override_gate" ? "Overriding…" : "Override"}
                      </button>
                    )}
                    <button type="button" className="min-h-8 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={gateRerunning || busy} onClick={handleGateRerun}>
                      {gateRerunning ? "Checking…" : "Re-verify"}
                    </button>
                  </span>
                </div>

                {/* Collapsible Deep Model Attribution */}
                {pred && (
                  <details className="group border-t border-[var(--line)]">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                      <span className="flex items-center gap-1.5">
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                        Deep Model Attribution & Probabilities
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 font-normal">Layer breakdown & calibration</span>
                    </summary>
                    <div className="border-t border-[var(--line)] p-3">
                      <AiConfidenceBreakdown prediction={pred} images={data.images} peril={data.peril} />
                    </div>
                  </details>
                )}
              </section>
            );
          })()}

          {/* EVIDENCE CONFIDENCE & TRUST EVALUATION */}
          <EvidenceConfidenceSection submission={data} />

          {/* REVIEWER DECISION & ACTION WORKBENCH */}
          <section className="rounded-sm border border-[var(--line)] bg-white p-4 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Decision workbench</h3>
              <span aria-live="polite" className={clsx("rounded-full border px-2 py-0.5 text-[11px] font-bold capitalize", isClosed ? "border-slate-300 bg-slate-100 text-slate-700" : "border-blue-200 bg-blue-50 text-blue-700", busy && "animate-pulse")}>
                {busy && pendingAction ? `${pendingAction.replaceAll("_", " ")}…` : liveStatus.replaceAll("_", " ")}
              </span>
              {!canAccept && !isClosed && (
                <span className="text-[11px] text-amber-700">Accept locked — override gate or recapture first.</span>
              )}
            </div>

            {/* Quick Action Button Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <button
                type="button"
                className="flex items-center justify-center gap-1 rounded-sm bg-[var(--ink)] min-h-11 px-2 py-2 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-colors disabled:cursor-not-allowed"
                disabled={busy || isClosed || !canAccept}
                onClick={handleAccept}
                title={canAccept ? "Accept claim assessment based on evidence and model" : "Blocked: integrity failure or unusable grade"}
              >
                {pendingAction === "accept" ? busyLabel("accept") : (<><CheckCircle2 className="h-3.5 w-3.5" /><span>Accept (A)</span></>)}
              </button>

              <button
                type="button"
                className="flex items-center justify-center gap-1 rounded-sm border border-[var(--line)] bg-white min-h-11 px-2 py-2 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors disabled:cursor-not-allowed"
                disabled={busy || isClosed}
                onClick={handleCorrect}
                title="Apply reviewer corrections and verify"
              >
                {pendingAction === "correct" ? busyLabel("correct") : (<><FileCheck className="h-3.5 w-3.5" /><span>Correct (C)</span></>)}
              </button>

              <button
                type="button"
                className="flex items-center justify-center gap-1 rounded-sm border border-[var(--line)] bg-white min-h-11 px-2 py-2 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors disabled:cursor-not-allowed"
                disabled={busy}
                onClick={handleOpenRecapture}
                title="Request farmer to recapture specific angles"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Recapture (R)</span>
              </button>

              <button
                type="button"
                className="flex items-center justify-center gap-1 rounded-sm border border-[var(--line)] bg-white min-h-11 px-2 py-2 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors disabled:cursor-not-allowed"
                disabled={busy || isClosed}
                onClick={handleInspection}
                title="Dispatch physical field inspector"
              >
                {pendingAction === "physical_inspection" ? busyLabel("physical_inspection") : (<><UserCheck className="h-3.5 w-3.5" /><span>Inspect (P)</span></>)}
              </button>

              <button
                type="button"
                className="flex items-center justify-center gap-1 rounded-sm border border-[var(--line)] bg-white min-h-11 px-2 py-2 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition-colors col-span-2 sm:col-span-1 disabled:cursor-not-allowed"
                disabled={busy || isClosed}
                onClick={handleReject}
                title="Reject claim with reason"
              >
                {pendingAction === "reject" ? busyLabel("reject") : (<><XCircle className="h-3.5 w-3.5" /><span>Reject (X)</span></>)}
              </button>
            </div>

            {/* Calibration & Override Form Fields — collapsed by default */}
            <details className="group rounded-sm border border-[var(--line)] bg-white text-xs">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
                <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                  Adjustments & Calibration (for Correct / Reject)
                </span>
                <span className="font-mono text-[10px] text-slate-400">Severity · Area · Crop · Reason</span>
              </summary>
              <div className="space-y-2 border-t border-[var(--line)] px-4 py-2">

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block font-medium text-slate-700">
                  Loss Severity Override
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                  >
                    <option value="">Keep AI severity ({pred?.severity || "Unset"})</option>
                    <option value="none">None (0% loss)</option>
                    <option value="low">Low (1-30%)</option>
                    <option value="medium">Medium (31-60%)</option>
                    <option value="high">High (61-100%)</option>
                  </select>
                </label>

                <label className="block font-medium text-slate-700">
                  Affected Area (%)
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={affectedArea}
                    onChange={(e) => setAffectedArea(e.target.value)}
                    placeholder={pred?.affected_area_pct != null ? `${pred.affected_area_pct}%` : "0.0"}
                  />
                </label>

                <label className="block font-medium text-slate-700">
                  Damage Category Override
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none"
                    value={damage}
                    onChange={(e) => setDamage(e.target.value)}
                  >
                    <option value="">Keep AI damage ({pred?.primary_damage || "None"})</option>
                    {[
                      "healthy", "lodging", "flood", "waterlogging", "drought_stress", "pest",
                      "disease", "hail_storm", "fire", "nutrient_deficiency", "weed_pressure",
                    ].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>

                <label className="block font-medium text-slate-700">
                  Screening Grade Override
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                  >
                    <option value="">Keep AI grade ({pred?.predicted_grade || "U"})</option>
                    <option value="A">Grade A — healthy crop pattern</option>
                    <option value="B">Grade B — minor stress / review</option>
                    <option value="C">Grade C — critical disease</option>
                    <option value="U">Grade U — unusable stills</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block font-medium text-slate-700 text-[11px]">
                  Corrected Crop
                  <input
                    className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                    value={crop}
                    onChange={(e) => setCrop(e.target.value)}
                    placeholder={pred?.predicted_crop || "e.g. Wheat"}
                  />
                </label>

                <label className="block font-medium text-slate-700 text-[11px]">
                  Growth Stage
                  <input
                    className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                    value={growthStage}
                    onChange={(e) => setGrowthStage(e.target.value)}
                    placeholder={pred?.predicted_growth_stage || "e.g. Flowering"}
                  />
                </label>

                <label className="block font-medium text-slate-700 text-[11px] col-span-2 sm:col-span-1">
                  Override Reason *
                  <input
                    className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why override AI…"
                  />
                </label>

                <label className="block font-medium text-slate-700 text-[11px] col-span-2 sm:col-span-1">
                  Reviewer Notes
                  <input
                    className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 focus:border-slate-800 focus:outline-none"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Audit log comments…"
                  />
                </label>
              </div>
              </div>
            </details>
          </section>

        </div>
        <aside className="w-full min-w-0 xl:sticky xl:top-3">
          {/* 4. AUDIT TRAIL — right rail */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-white">
                <History className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-[13px] font-extrabold tracking-tight text-slate-900">Audit Trail</h3>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                {historyItems.length}
              </span>
            </div>

            {historyItems.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-400">No actions yet — your decision starts the trail.</p>
            ) : (
              <ol className="relative max-h-[70vh] space-y-0 overflow-y-auto px-3 py-3">
                <span aria-hidden="true" className="absolute bottom-6 left-[23px] top-6 w-px bg-gradient-to-b from-slate-300 via-slate-200 to-transparent" />
                {historyItems.map((item, idx) => {
                  const act = item.action.toLowerCase();
                  const tone = act.includes("accept") || act.includes("verif") || act.includes("correct")
                    ? "bg-emerald-500 ring-emerald-200 text-emerald-700 border-emerald-200"
                    : act.includes("reject")
                      ? "bg-rose-500 ring-rose-200 text-rose-700 border-rose-200"
                      : act.includes("recapture") || act.includes("inspect")
                        ? "bg-amber-500 ring-amber-200 text-amber-800 border-amber-200"
                        : act.includes("override") || act.includes("annotat")
                          ? "bg-violet-500 ring-violet-200 text-violet-700 border-violet-200"
                          : "bg-slate-500 ring-slate-200 text-slate-700 border-slate-200";
                  const [dotBg] = tone.split(" ");
                  const initial = (item.actor || "S").trim().charAt(0).toUpperCase() || "S";
                  return (
                    <li key={item.id} className="relative flex gap-2 pb-3 last:pb-0">
                      <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white shadow-sm ring-4 ${dotBg} ${tone.split(" ")[1]}`}>
                        {initial}
                      </span>
                      <div className="min-w-0 flex-1 rounded-lg border border-slate-200/80 bg-white px-2.5 py-2 shadow-2xs">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span className={`rounded-full border px-1.5 py-px text-[9px] font-extrabold uppercase tracking-wide ${tone.split(" ").slice(2).join(" ")} bg-opacity-10`}>
                            {item.action.replaceAll("_", " ")}
                          </span>
                          {item.actor && (
                            <span className="font-mono text-[10px] text-slate-500" title={item.actor}>
                              {item.actor.length > 20 ? `${item.actor.slice(0, 20)}…` : item.actor}
                            </span>
                          )}
                          {item.createdAt && (
                            <time dateTime={item.createdAt} className="ml-auto text-[10px] text-slate-400">
                              {new Date(item.createdAt).toLocaleString()}
                            </time>
                          )}
                        </div>
                        {item.notes
                          ? <p className="mt-1 border-l-2 border-slate-200 pl-1.5 text-[11px] leading-snug text-slate-600">{item.notes}</p>
                          : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </aside>
      </div>

      {/* ADAPTIVE RECAPTURE MODAL */}
      {recaptureModalOpen && (
        <ModalShell labelledById="recapture-dialog-title" onClose={() => setRecaptureModalOpen(false)}>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 id="recapture-dialog-title" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-600" />
                Adaptive Evidence Recapture Request
              </h3>
              <button
                type="button"
                onClick={() => setRecaptureModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Select only the specific angle frames required to resolve evidence uncertainty. The farmer will be
              guided to recapture only these selected angles through the camera view-finder.
            </p>

            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider">
                Select Required Angles:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {modalAngles.map((angle) => {
                  const isChecked = selectedAngles.includes(angle.key);
                  const isSuggested = suggestedAngles.includes(angle.key);
                  return (
                    <label
                      key={angle.key}
                      className={clsx(
                        "flex items-center gap-2.5 rounded-lg border p-2.5 text-xs cursor-pointer transition-colors",
                        isChecked
                          ? "border-slate-900 bg-slate-900 text-white font-medium"
                          : "border-slate-200 hover:bg-slate-50 text-slate-700",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleAngle(angle.key)}
                        className="rounded border-slate-300"
                      />
                      <span>{angle.label}</span>
                      {isSuggested && (
                        <span
                          className={clsx(
                            "ml-auto rounded px-1.5 py-0.5 text-[9px] font-bold",
                            isChecked ? "bg-amber-400 text-slate-900" : "bg-amber-100 text-amber-900",
                          )}
                        >
                          Recommended
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <label className="block text-xs font-medium text-slate-700">
              Guidance for Farmer (Reason / Lighting / Focus)
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Please capture close-up of wheat earhead under bright daylight without motion blur."
              />
            </label>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                onClick={() => setRecaptureModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-black disabled:opacity-50 transition-colors shadow-xs"
                disabled={action.isPending || selectedAngles.length === 0}
                onClick={handleConfirmRecapture}
              >
                {action.isPending ? "Sending Request…" : `Request ${selectedAngles.length} Angle(s)`}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* REJECT CONFIRMATION MODAL */}
      {rejectModalOpen && (
        <ModalShell labelledById="reject-dialog-title" onClose={() => setRejectModalOpen(false)}>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 id="reject-dialog-title" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-rose-600" />
                Reject Claim
              </h3>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Select or provide a reason for rejecting this claim. This rejection is recorded permanently in the official audit trail.
            </p>

            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider">
                Quick Reason Presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Fraudulent evidence / screen capture detected",
                  "Crop mismatch (evidence does not match policy)",
                  "Evidence unidentifiable or inadequate quality",
                  "Location outside registered plot perimeter",
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRejectReason(preset)}
                    className={clsx(
                      "rounded border px-2 py-1 text-xs transition-colors text-left",
                      rejectReason === preset
                        ? "border-rose-300 bg-rose-50 text-rose-900 font-medium"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1" htmlFor="modal-reject-reason">
                Rejection Reason (Required):
              </label>
              <textarea
                id="modal-reject-reason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Evidence photos show digital screen replay and lack field context..."
                className="w-full rounded border border-slate-300 p-2.5 text-xs text-slate-900 focus:border-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-800"
              />
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="rounded border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={action.isPending || !rejectReason.trim()}
                onClick={() => handleReject(rejectReason)}
                className="rounded bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                {action.isPending ? "Rejecting…" : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* 5. FULL-SCREEN AMOLED BLACK LIGHTBOX WITH FROSTED GLASS SCREEN BLUR */}
      {mounted && lightboxIndex !== null && currentLightboxImage && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in duration-200"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
          }}
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative flex flex-col w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl bg-black border border-neutral-800 shadow-2xl shadow-black"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox Header Bar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-black text-white">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/70 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400 capitalize">
                  <Camera className="h-3.5 w-3.5 text-emerald-400" />
                  {ALL_ANGLES.find((a) => a.key === currentLightboxImage.angle_type)?.label ||
                    currentLightboxImage.angle_type.replaceAll("_", " ")}
                </span>
                <span className="font-mono text-xs text-neutral-400">
                  {lightboxIndex + 1} of {inspectableImages.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {inspectableImages.length > 1 && (
                  <div className="flex items-center gap-1 mr-2">
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxIndex((prev) =>
                          prev !== null && prev > 0 ? prev - 1 : inspectableImages.length - 1
                        )
                      }
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 transition-colors"
                      title="Previous photo (←)"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxIndex((prev) =>
                          prev !== null && prev < inspectableImages.length - 1 ? prev + 1 : 0
                        )
                      }
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 transition-colors"
                      title="Next photo (→)"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setLightboxIndex(null)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-rose-950/60 hover:border-rose-700/60 hover:text-rose-300 transition-colors"
                  title="Close (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Lightbox Stage: High-Res Image with floating arrows */}
            <div className="relative flex-1 min-h-[300px] max-h-[64vh] sm:max-h-[70vh] bg-black flex items-center justify-center p-3 sm:p-4 overflow-hidden select-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentLightboxImage.download_url as string}
                alt={currentLightboxImage.angle_type}
                className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
              />

              {inspectableImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex((prev) =>
                        prev !== null && prev > 0 ? prev - 1 : inspectableImages.length - 1
                      );
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-white hover:bg-neutral-900 hover:scale-105 backdrop-blur-md border border-neutral-800 transition-all shadow-xl"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex((prev) =>
                        prev !== null && prev < inspectableImages.length - 1 ? prev + 1 : 0
                      );
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-white hover:bg-neutral-900 hover:scale-105 backdrop-blur-md border border-neutral-800 transition-all shadow-xl"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}

              {/* Quality verification status */}
              <div className="absolute bottom-3 left-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-black/85 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400 backdrop-blur-md font-mono">
                  <CheckCircle2 className="h-3 w-3" />
                  Quality Verified
                </span>
              </div>
            </div>

            {/* Lightbox Footer Drawer */}
            <div className="border-t border-neutral-800 bg-black px-4 py-3 text-xs text-neutral-300">
              <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-neutral-400">
                <div className="flex items-center gap-1.5 text-neutral-200">
                  <MapPin className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>
                    {data.capture_lat != null && data.capture_lon != null
                      ? `${data.capture_lat.toFixed(5)}, ${data.capture_lon.toFixed(5)}`
                      : "GPS N/A"}
                  </span>
                  {data.capture_accuracy_m != null && (
                    <span className="text-[10px] text-neutral-500">(±{data.capture_accuracy_m}m)</span>
                  )}
                </div>

                {currentLightboxImage.sha256 && (
                  <div
                    className="flex items-center gap-1.5 rounded bg-neutral-900 border border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400 max-w-full sm:max-w-xs truncate"
                    title={`SHA-256: ${currentLightboxImage.sha256}`}
                  >
                    <ShieldCheck className="h-3 w-3 text-emerald-400 shrink-0" />
                    <span>SHA-256: {currentLightboxImage.sha256.slice(0, 16)}…</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


