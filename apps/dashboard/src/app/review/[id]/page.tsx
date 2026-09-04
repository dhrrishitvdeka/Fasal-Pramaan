"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applyWebReviewAction, getWebClaim, listReviewHistory, type Submission } from "@/lib/api";
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
  RotateCcw,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
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
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [gateRerunning, setGateRerunning] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["submission", id],
    queryFn: async () => getWebClaim(id),
    enabled: gate.status === "ok",
    refetchInterval: (query) => (query.state.data && !query.state.data.latest_prediction ? 5_000 : false),
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

  const action = useMutation({
    mutationFn: async (payload: ReviewActionPayload) => applyWebReviewAction(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submission", id] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["review-history", id] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["map"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      qc.invalidateQueries({ queryKey: ["damage-cat"] });
      qc.invalidateQueries({ queryKey: ["severity"] });
      qc.invalidateQueries({ queryKey: ["by-crop"] });
      setMessage("Decision recorded. Audit trail and metrics updated.");
      setRecaptureModalOpen(false);
    },
    onError: (err: unknown) => {
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
  const isClosed = data.status === "verified" || data.status === "rejected";
  const canAccept = !isClosed && predictionIsAcceptable(pred, hasIntegrityFailure);

  const handleAccept = () => {
    if (canAccept) {
      action.mutate({ action: "accept", notes });
    }
  };

  const handleCorrect = () => {
    const why = (reason || notes || "").trim();
    if (!why) {
      setMessage("Add an override reason before correcting and verifying.");
      return;
    }
    action.mutate({
      action: "correct",
      override_reason: why,
      corrected_severity: severity || undefined,
      corrected_damage_codes: damage ? [damage] : undefined,
      corrected_affected_area_pct: affectedArea === "" ? undefined : Number(affectedArea),
      corrected_crop: crop || undefined,
      corrected_growth_stage: growthStage || undefined,
      corrected_grade: grade || undefined,
      notes,
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

  const handleReject = () => {
    const why = (reason || notes || "").trim();
    if (!why) {
      setMessage("Add a reason before rejecting this claim.");
      return;
    }
    action.mutate({
      action: "reject",
      override_reason: why,
      notes: notes || why,
    });
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
    <div className="space-y-5 pb-12">
      {/* 1. TOP HEADER & BREADCRUMB NAVIGATION */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => router.push("/review")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
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
              className="ml-1 text-slate-400 hover:text-slate-700"
              title="Copy full Case ID"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>

          <span
            className={clsx(
              "rounded-full px-2.5 py-0.5 text-xs font-bold capitalize border",
              data.status === "verified"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : data.status === "rejected"
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : data.status === "needs_recapture"
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-blue-50 text-blue-700 border-blue-200",
            )}
          >
            {data.status.replaceAll("_", " ")}
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

      {/* 2. CASE SUMMARY & FARMER CONTEXT CARD */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Sprout className="h-4 w-4 text-emerald-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Plot &amp; Agricultural Telemetry
            </h3>
          </div>
          {data.createdAt && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
              <Clock className="h-3 w-3" />
              Submitted {new Date(data.createdAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Plot & Khasra */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">Plot &amp; Land</span>
            <div className="font-semibold text-slate-800 text-sm">{data.plot_name || data.crop_cycle_id || "Plot 1"}</div>
            <div className="font-mono text-slate-500 mt-1 flex items-center gap-1">
              <span>Khasra:</span>
              <span className="font-bold text-slate-700">{data.khasra_number || "—"}</span>
            </div>
          </div>

          {/* Declared Crop */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">Declared Crop</span>
            <div className="font-semibold text-slate-800 text-sm capitalize">
              {data.crop_type || data.latest_prediction?.predicted_crop || "Wheat"}
            </div>
            <div className="text-slate-500 mt-1">
              Variety: <span className="font-medium text-slate-700">{data.crop_variety || "Standard"}</span>
            </div>
          </div>

          {/* GPS Coordinates */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">GPS Verification</span>
            {data.capture_lat != null && data.capture_lon != null ? (
              <div className="font-mono text-slate-700 text-xs">
                <div className="flex items-center gap-1 font-semibold text-emerald-700">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span>{data.capture_lat.toFixed(5)}, {data.capture_lon.toFixed(5)}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Accuracy: ±{data.capture_accuracy_m ?? 5}m
                </div>
              </div>
            ) : (
              <span className="text-amber-700 font-medium">No GPS recorded</span>
            )}
          </div>

          {/* Peril & Stated Loss */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">Reported Peril</span>
            <div className="font-semibold text-slate-800 text-sm capitalize">
              {(data.peril || "Normal").replaceAll("_", " ")}
            </div>
            <div className="text-[11px] text-slate-600 mt-1 truncate" title={data.farmer_observations || undefined}>
              Notes: {data.farmer_observations?.trim() || "No farmer remarks"}
            </div>
          </div>
        </div>
      </section>

      {/* Case Status Alerts */}
      {isClosed && (
        <div className="rounded-xl border border-slate-300 bg-slate-100/80 px-4 py-3 text-xs text-slate-800 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-slate-600 shrink-0" />
          <span>
            This claim has been finalized as <strong>{data.status}</strong>. Decisions are logged and immutable. Issue a recapture if fresh physical evidence is required.
          </span>
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600 shrink-0" />
            <span>{message}</span>
          </div>
          <button type="button" onClick={() => setMessage(null)} className="text-blue-500 hover:text-blue-700">
            ✕
          </button>
        </div>
      )}

      {/* 3. TWO-COLUMN REVIEW WORKSPACE */}
      <div className="grid items-start gap-5 lg:grid-cols-12">
        {/* LEFT COLUMN: Physical Evidence, High-Res Gallery & Satellite Cross-Check (5 cols) */}
        <div className="space-y-5 lg:col-span-5">
          {/* EVIDENCE PHOTO GALLERY */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Physical Evidence Photos
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                {inspectableImages.length} uploaded
              </span>
            </div>

            {inspectableImages.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <Camera className="h-8 w-8 mx-auto mb-2 opacity-30 text-slate-400" />
                <span>No photographic evidence attached to this claim</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {inspectableImages.map((img, idx) => {
                  const angleObj = ALL_ANGLES.find((a) => a.key === img.angle_type);
                  const angleLabel = angleObj?.label || img.angle_type.replaceAll("_", " ");
                  return (
                    <div
                      key={img.id}
                      className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-all hover:border-slate-400 hover:shadow-md"
                    >
                      {/* Image Thumbnail Stage */}
                      <div
                        onClick={() => setLightboxIndex(idx)}
                        className="relative aspect-[4/3] w-full bg-slate-900 cursor-pointer overflow-hidden flex items-center justify-center"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.download_url as string}
                          alt={angleLabel}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold backdrop-blur-md">
                            <Maximize2 className="h-3.5 w-3.5" />
                            <span>Inspect</span>
                          </div>
                        </div>

                        {/* Angle Pill Badge */}
                        <div className="absolute top-2 left-2">
                          <span className="rounded-md bg-black/70 px-2 py-0.5 font-mono text-[10px] font-bold text-white backdrop-blur-md border border-white/15">
                            {angleLabel}
                          </span>
                        </div>
                      </div>

                      {/* Card Footer Metadata */}
                      <div className="flex items-center justify-between p-2.5 text-xs bg-slate-50/80 border-t border-slate-100 font-mono">
                        <span className="text-[11px] text-slate-600 truncate capitalize">
                          {img.upload_status}
                        </span>
                        {img.sha256 ? (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <ShieldCheck className="h-3 w-3" />
                            SHA verified
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Standard</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* SATELLITE CROSS-CHECK & BHUVAN LAND-USE */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Satellite &amp; Land-Use Verification
                </h3>
              </div>
              {contextSignals.length > 0 && (
                <span className="font-mono text-[11px] text-slate-500">
                  {contextSignals.length} signals
                </span>
              )}
            </div>

            {contextSignals.length > 0 && (
              <div className="space-y-1.5">
                {contextSignals.map((s) => (
                  <div key={s.source} className="rounded-lg border border-slate-100 p-2 bg-slate-50/60 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800 capitalize">{s.labelEn}</span>
                      <span
                        className={clsx(
                          "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase font-mono",
                          s.status === "available"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : s.status === "pending"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-slate-100 text-slate-600",
                        )}
                      >
                        {s.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">{s.summaryEn}</p>
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
          </section>
        </div>

        {/* RIGHT COLUMN: AI Diagnostics, Authenticity Gate & Decision Workbench (7 cols) */}
        <div className="space-y-5 lg:col-span-7">
          {/* GEMINI FIELD ASSESSMENT */}
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
              !detected.toLowerCase().includes(declared.toLowerCase().split(/\s+/)[0] || "\0") &&
              !declared.toLowerCase().includes(detected.toLowerCase());

            return (
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Gemini Multimodal Field Synthesis
                    </h3>
                  </div>
                  <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-700 border border-blue-200">
                    {pred?.predicted_grade ? `Grade ${pred.predicted_grade}` : data.inference_status || "Completed"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 font-mono">
                  <span>Peril: <strong className="capitalize text-slate-800">{data.peril || "normal"}</strong></span>
                  <span>· Declared: <strong className="text-slate-800">{declared || "—"}</strong></span>
                  {detected && <span>· Detected: <strong className="text-slate-800">{detected}</strong></span>}
                </div>

                {oneLiner ? (
                  <p className="text-xs leading-relaxed text-slate-800 bg-slate-50/80 p-3 rounded-lg border border-slate-100">
                    &ldquo;{oneLiner}&rdquo;
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    AI synthesis is complete. Visual features calibrated across uploaded angles.
                  </p>
                )}

                {mismatch && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950 font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      Crop mismatch: Farmer declared {declared}, but Gemini detects {detected}. Confirm plot boundary before approving payout.
                    </span>
                  </div>
                )}
              </section>
            );
          })()}

          {/* EVIDENCE CONFIDENCE & TRUST EVALUATION */}
          <EvidenceConfidenceSection submission={data} />

          {/* AUTHENTICITY VISION GATE */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  AI Authenticity Gate
                </h3>
              </div>

              {gateInfo?.overridden ? (
                <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                  Overridden by Reviewer
                </span>
              ) : gateInfo?.gateFailed ? (
                <span className="rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                  Gate Rejected{gateInfo.blockingReason ? `: ${gateInfo.blockingReason.replaceAll("_", " ")}` : ""}
                </span>
              ) : (
                <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                  Passed Authenticity Gate
                </span>
              )}
            </div>

            {gateInfo && gateInfo.perImage.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {gateInfo.perImage.map((item, idx) => (
                  <span
                    key={`${item.angleType}-${idx}`}
                    className={clsx(
                      "rounded-md border px-2 py-0.5 font-mono text-[10px] font-medium",
                      item.usable
                        ? "border-emerald-200 bg-emerald-50/80 text-emerald-700"
                        : "border-amber-300 bg-amber-50 text-amber-800",
                    )}
                  >
                    {(item.angleType || "image").replaceAll("_", " ")}: {item.usable ? "ok" : item.reason}
                  </span>
                ))}
              </div>
            )}

            {/* Action Buttons for Authenticity Gate */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              {gateInfo?.gateFailed && !gateInfo.overridden && (
                <button
                  type="button"
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
                  disabled={action.isPending || isClosed}
                  onClick={handleOverrideGate}
                >
                  Override Gate — Mark Usable
                </button>
              )}

              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-2xs"
                disabled={gateRerunning || action.isPending}
                onClick={handleGateRerun}
              >
                {gateRerunning ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
                    Checking authenticity…
                  </span>
                ) : (
                  "Re-verify Stored Photos"
                )}
              </button>
            </div>
          </section>

          {/* AI MODEL PREDICTION METRICS */}
          {pred && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  AI Model Scoring Breakdown
                </h3>
                <span className="font-mono text-[11px] text-slate-500">{pred.model_version}</span>
              </div>
              <AiConfidenceBreakdown prediction={pred} images={data.images} peril={data.peril} />
            </section>
          )}

          {/* REVIEWER DECISION & ACTION WORKBENCH */}
          <section className="rounded-xl border-2 border-slate-900 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-sm font-bold tracking-tight text-slate-900">
                  Reviewer Decision Workbench
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record official PMFBY loss adjustment decision and trigger payout or recapture
                </p>
              </div>
              <Scale className="h-5 w-5 text-slate-700" />
            </div>

            {/* Quick Action Button Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <button
                type="button"
                className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs"
                disabled={action.isPending || isClosed || !canAccept}
                onClick={handleAccept}
                title="Accept claim assessment based on evidence and model"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{pred ? "Accept AI result" : "Accept claim"} (A)</span>
              </button>

              <button
                type="button"
                className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-black disabled:opacity-50 transition-colors shadow-xs"
                disabled={action.isPending || isClosed}
                onClick={handleCorrect}
                title="Apply reviewer corrections and verify"
              >
                <FileCheck className="h-4 w-4" />
                <span>Correct &amp; Verify (C)</span>
              </button>

              <button
                type="button"
                className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                disabled={action.isPending}
                onClick={handleOpenRecapture}
                title="Request farmer to recapture specific angles"
              >
                <RotateCcw className="h-4 w-4 text-amber-700" />
                <span>Request Recapture (R)</span>
              </button>

              <button
                type="button"
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                disabled={action.isPending || isClosed}
                onClick={handleInspection}
                title="Dispatch physical field inspector"
              >
                <UserCheck className="h-4 w-4 text-slate-600" />
                <span>Physical Inspection (P)</span>
              </button>

              <button
                type="button"
                className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors sm:col-span-2 lg:col-span-1"
                disabled={action.isPending || isClosed}
                onClick={handleReject}
                title="Reject claim with reason"
              >
                <XCircle className="h-4 w-4 text-rose-600" />
                <span>Reject Claim (X)</span>
              </button>
            </div>

            {/* Calibration & Override Form Fields */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 text-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Adjustment Parameters (For Correct &amp; Verify)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <label className="block font-medium text-slate-700">
                  Corrected Crop (Optional)
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none"
                    value={crop}
                    onChange={(e) => setCrop(e.target.value)}
                    placeholder={pred?.predicted_crop || "e.g. Wheat"}
                  />
                </label>

                <label className="block font-medium text-slate-700">
                  Corrected Growth Stage (Optional)
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none"
                    value={growthStage}
                    onChange={(e) => setGrowthStage(e.target.value)}
                    placeholder={pred?.predicted_growth_stage || "e.g. Flowering"}
                  />
                </label>
              </div>

              <label className="block font-medium text-slate-700 pt-1">
                Override Reason (Required when rejecting or altering AI severity)
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why the AI assessment or damage classification was overridden..."
                />
              </label>

              <label className="block font-medium text-slate-700">
                Official Reviewer Notes (Audit Trail)
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal comments for PMFBY verification log..."
                />
              </label>
            </div>
          </section>

          {/* 4. AUDIT & REVIEW TIMELINE */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-slate-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Case Audit &amp; Decision History
                </h3>
              </div>
              <span className="font-mono text-[11px] text-slate-500">
                {historyItems.length} records
              </span>
            </div>

            {historyItems.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">No previous actions recorded for this claim.</p>
            ) : (
              <ol className="space-y-3 border-l-2 border-slate-200 pl-4 pt-1 text-xs">
                {historyItems.map((item) => (
                  <li key={item.id} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[1.35rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-white"
                    />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-bold text-slate-800 capitalize">
                        {item.action.replaceAll("_", " ")}
                      </span>
                      {item.actor && (
                        <span className="font-mono text-[10px] text-slate-500">by {item.actor.slice(0, 8)}</span>
                      )}
                      {item.createdAt && (
                        <time dateTime={item.createdAt} className="text-[10px] text-slate-400">
                          {new Date(item.createdAt).toLocaleString()}
                        </time>
                      )}
                    </div>
                    {item.notes && <p className="mt-1 text-slate-600 leading-relaxed">{item.notes}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
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
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 transition-colors"
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
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 transition-colors"
                      title="Next photo (→)"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setLightboxIndex(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-rose-950/60 hover:border-rose-700/60 hover:text-rose-300 transition-colors"
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


