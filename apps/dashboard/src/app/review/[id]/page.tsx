"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applyWebReviewAction, getWebClaim, listReviewHistory, Submission } from "@/lib/api";
import type { ReviewActionPayload } from "@/lib/web-db";
import { useParams, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { useRequireRole } from "@/lib/use-require-role";
import AccessGate from "@/components/AccessGate";

import { AiConfidenceBreakdown } from "@/components/AiConfidenceBreakdown";
import { ReviewKeyboardShortcuts } from "@/components/ReviewKeyboardShortcuts";
import { EvidenceConfidenceSection, resolveEvidenceEvaluation } from "@/components/EvidenceConfidenceSection";
import { SatelliteCrossCheckCard } from "@/components/SatelliteCrossCheckCard";
import ModalShell from "@/components/ModalShell";
import { predictionIsAcceptable } from "@/lib/review-accept";
import { normalizePeril } from "@/lib/claim-routing";
import { apiFetch } from "@/lib/auth-headers";
import { DetailSkeleton } from "@/components/LoadingAnimation";
import ErrorMessage from "@/components/ErrorMessage";
import type { ContextSignal } from "@/lib/context/types";

const ALL_ANGLES = [
  { key: "wide_field", label: "Wide Field" },
  { key: "left_context", label: "Left Context" },
  { key: "mid_canopy", label: "Mid Canopy" },
  { key: "right_context", label: "Right Context" },
  { key: "closeup_damage", label: "Closeup Damage" },
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
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [severity, setSeverity] = useState("");
  const [damage, setDamage] = useState("");
  const [affectedArea, setAffectedArea] = useState("");
  const [crop, setCrop] = useState("");
  const [growthStage, setGrowthStage] = useState("");
  const [grade, setGrade] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // Specific adaptive recapture angle selection
  const [selectedAngles, setSelectedAngles] = useState<string[]>([]);
  const [recaptureModalOpen, setRecaptureModalOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["submission", id],
    queryFn: async () => getWebClaim(id),
    enabled: gate.status === "ok",
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
    if (!evaluation) return ["closeup_damage"];
    if (evaluation.request?.required_angles && evaluation.request.required_angles.length > 0) {
      return evaluation.request.required_angles;
    }
    const missing = evaluation.coverage?.details?.missing_views;
    if (Array.isArray(missing) && missing.length > 0) {
      return missing;
    }
    return ["closeup_damage"];
  }, [evaluation]);

  const action = useMutation({
    mutationFn: async (payload: ReviewActionPayload) => applyWebReviewAction(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["submission", id] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["review-history", id] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["map-markers"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
      qc.invalidateQueries({ queryKey: ["reviewer-stats"] });
      qc.invalidateQueries({ queryKey: ["claims"] });
      setMessage("Decision recorded. Audit trail and metrics updated.");
      setRecaptureModalOpen(false);
    },
    onError: (err: unknown) => {
      const msg =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.detail || "Action failed";
      setMessage(String(msg));
    },
  });

  // Parse the persisted authenticity-gate result (defensive — shape is JSONB)
  const gateInfo = useMemo(() => {
    const raw = data?.gate_result as Record<string, unknown> | null | undefined;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const perImageRaw = Array.isArray(raw.perImage) ? (raw.perImage as unknown[]) : [];
    const perImage = perImageRaw
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
      .map((item) => ({
        angleType: typeof item.angleType === "string" ? item.angleType : "",
        usable: item.usable === true,
        reason: typeof item.reason === "string" ? item.reason : "unknown",
      }));
    return {
      gateFailed: raw.gateFailed === true,
      blockingReason: typeof raw.blockingReason === "string" ? raw.blockingReason : null,
      overridden: raw.overridden === true,
      overriddenBy: typeof raw.overriddenBy === "string" ? raw.overriddenBy : null,
      overriddenAt: typeof raw.overriddenAt === "string" ? raw.overriddenAt : null,
      perImage,
    };
  }, [data]);

  // Gate re-run spinner state
  const [gateRerunning, setGateRerunning] = useState(false);

  // Persisted multi-signal context (context_signals JSONB — array of ContextSignal, possibly stringified)
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

  // Free Copernicus Browser deep-link for real Sentinel-2 imagery (fire peril cross-check)
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
        (img) => img.angle_type === "wide_field" && img.upload_status === "uploaded" && img.download_url,
      ) ?? null
    );
  }, [data]);

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
          onRetry={() => void refetch()}
          actionHref="/review"
          actionLabel="Back to Review Queue"
        />
      </div>
    );
  }
  const pred = data.latest_prediction;

  const canAccept = predictionIsAcceptable(pred, hasIntegrityFailure);

  const handleAccept = () => {
    if (canAccept) {
      action.mutate({ action: "accept", notes });
    }
  };

  const handleCorrect = () => {
    action.mutate({
      action: "correct",
      override_reason: reason || notes || "Human recorded screening decision",
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

  const handleOverrideGate = () => {
    const cleanReason = (reason || notes || "Reviewer confirmed photo authenticity").slice(0, 500);
    action.mutate({
      action: "override_gate",
      override_reason: cleanReason,
      notes: `Gate overridden by reviewer: ${cleanReason}`,
    });
  };

  // Re-run the vision authenticity gate on the already-stored photos (client-side
  // download → base64 → sequential POST /api/vision/gate with Bearer auth), then
  // record an audited "correct" action summarizing usable/total.
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
        action: "correct",
        notes: `Gate re-run recorded: ${usable}/${total} usable`,
      });
      qc.invalidateQueries({ queryKey: ["submission", id] });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["review-history", id] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["map-markers"] });
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
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

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900"
          onClick={() => router.push("/review")}
        >
          ← Queue
        </button>
        <ReviewKeyboardShortcuts
          disabled={action.isPending || recaptureModalOpen}
          onAccept={handleAccept}
          onCorrect={handleCorrect}
          onRequestRecapture={handleOpenRecapture}
          onPhysicalInspection={handleInspection}
          onReturnToQueue={() => router.push("/review")}
        />
      </div>

      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">Case Review & Evidence Assessment</h2>
        <p className="mt-1 font-mono text-xs text-slate-500">Case ID: {data.id}</p>
      </div>

      <section className="fp-panel space-y-2 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Farmer & plot
        </h3>
        <dl className="grid grid-cols-1 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="text-slate-500">Plot / cycle</dt>
          <dd className="font-mono text-xs">{data.crop_cycle_id || "—"}</dd>
          <dt className="text-slate-500">Farmer notes</dt>
          <dd className="break-words text-slate-700">{data.farmer_observations || "—"}</dd>
          <dt className="text-slate-500">GPS / location</dt>
          <dd className="break-all font-mono text-xs tabular-nums">
            {data.capture_lat != null && data.capture_lon != null
              ? `${data.capture_lat.toFixed(5)}, ${data.capture_lon.toFixed(5)} (±${data.capture_accuracy_m ?? "?"} m)`
              : "No GPS on this case"}
          </dd>
        </dl>
      </section>

      {message && (
        <div
          className="border border-slate-400 bg-slate-50 px-3 py-2 text-sm text-slate-800"
          role="status"
        >
          {message}
        </div>
      )}

      {/* Two-column review workspace: sticky evidence rail + decision flow */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        {/* LEFT RAIL — physical evidence + satellite cross-check (sticky on desktop) */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
      {/* 2. Physical Evidence & Geolocation */}
      <section className="fp-panel space-y-2 p-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Physical Evidence & Geotags
          </h3>
          <span className="fp-badge-neutral">{data.status}</span>
        </div>
        <dl className="grid grid-cols-1 gap-y-1.5 pt-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="text-slate-500">GPS Coordinates</dt>
          <dd className="break-all font-mono text-xs tabular-nums">
            {data.capture_lat?.toFixed(5)}, {data.capture_lon?.toFixed(5)} (±
            {data.capture_accuracy_m ?? "?"} m)
          </dd>
          <dt className="text-slate-500">Farmer Notes</dt>
          <dd className="break-words text-slate-700">{data.farmer_observations || "—"}</dd>
        </dl>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2">
          {(data.images || []).map((img) => (
            <div key={img.id} className="border border-slate-200 p-2 text-xs rounded bg-white">
              <div className="font-semibold text-slate-800 truncate capitalize">{img.angle_type.replaceAll("_", " ")}</div>
              <div className="text-[11px] text-slate-500">{img.upload_status}</div>
              {img.download_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.download_url}
                  alt={img.angle_type}
                  className="mt-1.5 h-24 w-full object-cover rounded border border-slate-100"
                />
              ) : (
                <div className="mt-1.5 flex h-24 items-center justify-center bg-slate-100 text-slate-400 rounded text-[11px]">
                  No preview
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Multi-Signal Context & Satellite Cross-Check */}
      <section className="fp-panel space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Multi-Signal Context &amp; Satellite Cross-Check
          </h3>
          {contextSignals.length > 0 && (
            <span className="fp-badge-neutral">{contextSignals.length} signals</span>
          )}
        </div>

        {contextSignals.length > 0 ? (
          <div className="grid grid-cols-1 gap-1 pt-1">
            {contextSignals.map((s) => (
              <div key={s.source} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold capitalize text-slate-700">{s.labelEn}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      s.status === "available"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : s.status === "pending"
                          ? "border border-amber-200 bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-600">{s.summaryEn}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="pt-1 text-xs text-slate-500">No persisted context signals for this case.</p>
        )}

        <SatelliteCrossCheckCard
          wideFieldImageUrl={wideFieldImage?.download_url}
          bhuvanTileUrl={bhuvanThumbnailUrl}
          burnMapUrl={burnMapUrl}
        />
      </section>
        </div>

        {/* RIGHT MAIN — confidence → gate → AI → decision flow */}
        <div className="min-w-0 space-y-4">
          {/* 1. Evidence Confidence & Trust Assessment Section */}
          <EvidenceConfidenceSection submission={data} />

      {/* Authenticity Gate (vision gate verdict + reviewer override) */}
      <section className="fp-panel space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Authenticity Gate
          </h3>
          {gateInfo?.overridden ? (
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
              Overridden
            </span>
          ) : gateInfo?.gateFailed ? (
            <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
              Blocked{gateInfo.blockingReason ? `: ${gateInfo.blockingReason.replaceAll("_", " ")}` : ""}
            </span>
          ) : (
            <span className="fp-badge-neutral">{gateInfo ? "Passed" : "Not run"}</span>
          )}
        </div>

        {gateInfo && gateInfo.perImage.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {gateInfo.perImage.map((item, idx) => (
              <span
                key={`${item.angleType}-${idx}`}
                title={item.reason}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  item.usable
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-300 bg-amber-50 text-amber-800"
                }`}
              >
                {(item.angleType || "image").replaceAll("_", " ")}: {item.usable ? "ok" : item.reason}
              </span>
            ))}
          </div>
        )}

        {gateInfo?.overridden && (
          <p className="pt-1 text-[11px] text-emerald-700">
            Overridden by {gateInfo.overriddenBy || "reviewer"}
            {gateInfo.overriddenAt ? ` · ${new Date(gateInfo.overriddenAt).toLocaleString()}` : ""}
          </p>
        )}

        {gateInfo?.gateFailed && !gateInfo.overridden && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              className="fp-btn-secondary text-xs"
              disabled={action.isPending}
              onClick={handleOverrideGate}
              title="Mark the gate-blocked evidence as usable and record the override in the audit trail"
            >
              Override gate — mark usable
            </button>
            <span className="text-[11px] text-slate-500">
              Uses the Override Reason field when provided (max 500 chars).
            </span>
          </div>
        )}

        {(data.images || []).length > 0 && (!gateInfo || gateInfo.overridden) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              className="fp-btn-secondary text-xs"
              disabled={gateRerunning || action.isPending}
              onClick={handleGateRerun}
            >
              {gateRerunning ? (
                <>
                  <span
                    aria-hidden="true"
                    className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent align-middle"
                  />
                  Re-running…
                </>
              ) : (
                "Re-run authenticity check on stored photos"
              )}
            </button>
            <span className="text-[11px] text-slate-500">
              Re-scores every stored photo through the vision gate and records a summary in the audit trail.
            </span>
          </div>
        )}
      </section>

      {/* SECTION 3: AI Model Prediction & Screening (Explicitly Distinct from Evidence Confidence) */}
      <section className="fp-panel space-y-3 p-4 border-l-4 border-l-blue-500">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
              AI Model Prediction & Screening (Assistive Only)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Model inference findings · Does not equal evidence confidence
            </p>
          </div>
          {pred && (
            <span className="font-mono text-[11px] text-slate-500">
              Model: {pred.adapter_type} ({pred.model_version})
            </span>
          )}
        </div>

        {pred ? (
          <>
            <AiConfidenceBreakdown prediction={pred} images={data.images} />
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 text-xs pt-2 border-t border-slate-100">
              <div>
                <dt className="text-slate-500">Predicted Crop</dt>
                <dd className="font-semibold text-slate-800">
                  {pred.predicted_grade === "U"
                    ? "Not determined (unusable evidence)"
                    : `${pred.predicted_crop || "—"} (${((pred.crop_confidence || 0) * 100).toFixed(0)}%)`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Growth Stage</dt>
                <dd className="font-semibold text-slate-800">{pred.predicted_growth_stage || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Primary Damage</dt>
                <dd className="font-semibold text-slate-800 capitalize">{pred.primary_damage?.replaceAll("_", " ") || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Damage Severity</dt>
                <dd className="font-semibold text-slate-800 capitalize">{pred.severity || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Affected Area</dt>
                <dd className="font-semibold text-slate-800">{pred.affected_area_pct == null ? "—" : `${pred.affected_area_pct}%`}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Screening Grade</dt>
                <dd className="font-semibold text-slate-800">{pred.predicted_grade || "—"} ({pred.grade_label || "Grade"})</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500">AI Recommendation</dt>
                <dd className="font-semibold text-slate-800">{pred.human_review_recommendation || "Manual review"}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="text-sm text-slate-500">No AI prediction available yet.</p>
        )}
      </section>

      {/* SECTION 4: Reviewer Decision & Action Controls */}
      <section className="fp-panel space-y-3 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
          Reviewer Decision & Verification
        </h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            Damage Category Override
            <select className="fp-input mt-1" value={damage} onChange={(e) => setDamage(e.target.value)}>
              <option value="">Keep AI category ({pred?.primary_damage || "None"})</option>
              {[
                "healthy", "lodging", "flood", "waterlogging", "drought_stress", "pest",
                "disease", "hail_storm", "fire", "nutrient_deficiency", "weed_pressure",
              ].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>

          <label className="block text-xs font-medium text-slate-700">
            Corrected Health Screening Grade
            <select className="fp-input mt-1" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Keep AI screening grade ({pred?.predicted_grade || "U"})</option>
              <option value="A">A — healthy leaf signal</option>
              <option value="B">B — uncertain; manual review</option>
              <option value="C">C — disease pattern signal</option>
              <option value="U">U — unusable or unsupported</option>
            </select>
          </label>
        </div>

        <p className="text-[11px] text-slate-500">
          Screening grade is an assistive leaf health indicator, distinct from insurance crop-loss severity or claim eligibility.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            Corrected Loss Severity
            <select
              className="fp-input mt-1"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">Keep AI severity ({pred?.severity || "Unset"})</option>
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>

          <label className="block text-xs font-medium text-slate-700">
            Affected Area (%)
            <input
              className="fp-input mt-1"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={affectedArea}
              onChange={(e) => setAffectedArea(e.target.value)}
              placeholder={pred?.affected_area_pct != null ? `${pred.affected_area_pct}%` : "0.0"}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            Corrected Crop (Optional)
            <input className="fp-input mt-1" value={crop} onChange={(e) => setCrop(e.target.value)} placeholder={pred?.predicted_crop || ""} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Corrected Growth Stage (Optional)
            <input className="fp-input mt-1" value={growthStage} onChange={(e) => setGrowthStage(e.target.value)} placeholder={pred?.predicted_growth_stage || ""} />
          </label>
        </div>

        <label className="block text-xs font-medium text-slate-700">
          Override Reason (Required when correcting or requesting recapture)
          <textarea
            className="fp-input mt-1"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why the AI assessment or evidence was overridden or flagged..."
          />
        </label>

        <label className="block text-xs font-medium text-slate-700">
          Reviewer Notes
          <textarea
            className="fp-input mt-1"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes for audit trail..."
          />
        </label>

        <div className="grid grid-cols-1 gap-2 pt-2 sm:flex sm:flex-wrap sm:items-center">
          <button
            type="button"
            className="fp-btn-primary flex min-h-12 w-full flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-6 py-3 text-base font-semibold sm:w-auto"
            disabled={action.isPending || !canAccept}
            onClick={handleAccept}
            title={hasIntegrityFailure ? "Acceptance disabled due to failed integrity checks" : "Accept AI result (A)"}
          >
            <span>Accept AI result</span>
            <kbd className="hidden rounded bg-[var(--ink)] px-1 font-mono text-[10px] text-[var(--surface)] sm:inline">A</kbd>
          </button>

          <button
            type="button"
            className="fp-btn-secondary flex w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 sm:w-auto"
            disabled={action.isPending}
            onClick={handleCorrect}
          >
            <span>Correct & verify</span>
            <kbd className="hidden rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[10px] text-slate-600 sm:inline">C</kbd>
          </button>

          <button
            type="button"
            className="fp-btn-secondary flex w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 sm:w-auto"
            disabled={action.isPending}
            onClick={handleOpenRecapture}
          >
            <span>Request recapture</span>
            <kbd className="hidden rounded border border-slate-300 bg-slate-100 px-1 font-mono text-[10px] text-slate-600 sm:inline">R</kbd>
          </button>

          <button
            type="button"
            className="fp-btn-danger flex w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 sm:w-auto"
            disabled={action.isPending}
            onClick={handleInspection}
          >
            <span>Physical inspection</span>
            <kbd className="hidden rounded bg-rose-700 px-1 font-mono text-[10px] text-white sm:inline">P</kbd>
          </button>
        </div>
      </section>

      {/* SECTION 5: Audit & Review History */}
      <section className="fp-panel p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Audit &amp; Review History
        </h3>
        {historyItems.length === 0 ? (
          <p className="text-sm text-slate-500">No recorded actions yet for this case.</p>
        ) : (
          <ol className="space-y-3 border-l border-slate-200 pl-4 pt-1 text-xs">
            {historyItems.map((item) => (
              <li key={item.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[1.31rem] top-1 h-2 w-2 rounded-full border border-[var(--ink)] bg-white"
                />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-semibold capitalize text-slate-800">
                    {item.action.replaceAll("_", " ")}
                  </span>
                  {item.actor && (
                    <span className="font-mono text-[10px] text-slate-500">{item.actor.slice(0, 8)}</span>
                  )}
                  {item.createdAt && (
                    <time dateTime={item.createdAt} className="text-[10px] text-slate-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </time>
                  )}
                </div>
                {item.notes && <p className="mt-0.5 break-words text-slate-600">{item.notes}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
        </div>
      </div>

      {/* Adaptive Recapture Dialog / Modal */}
      {recaptureModalOpen && (
        <ModalShell labelledById="recapture-dialog-title" onClose={() => setRecaptureModalOpen(false)}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 id="recapture-dialog-title" className="text-sm font-bold text-slate-900">
                Adaptive Evidence Recapture Request
              </h3>
              <button
                type="button"
                onClick={() => setRecaptureModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Select only the specific angles needed to resolve evidence uncertainty. The farmer will be guided to capture only these selected frames instead of re-doing all 5.
            </p>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-700 block">Required Angles to Request:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_ANGLES.map((angle) => {
                  const isChecked = selectedAngles.includes(angle.key);
                  const isSuggested = suggestedAngles.includes(angle.key);
                  return (
                    <label
                      key={angle.key}
                      className={`flex items-center gap-2 rounded border p-2 text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? "border-[var(--ink)] bg-[var(--accent-soft)] font-medium text-[var(--ink)]"
                          : "border-slate-200 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleAngle(angle.key)}
                        className="rounded border-[var(--line)]"
                      />
                      <span>{angle.label}</span>
                      {isSuggested && (
                        <span className="ml-auto rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-800">
                          Recommended
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            <label className="block text-xs font-medium text-slate-700">
              Farmer Instruction / Reason:
              <input
                className="fp-input mt-1"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Please capture a clear close-up damage photo with good lighting."
              />
            </label>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="fp-btn-secondary w-full sm:w-auto"
                onClick={() => setRecaptureModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="fp-btn-primary w-full sm:w-auto"
                disabled={action.isPending || selectedAngles.length === 0}
                onClick={handleConfirmRecapture}
              >
                {action.isPending ? "Sending…" : `Request ${selectedAngles.length} Angle(s)`}
              </button>
            </div>
        </ModalShell>
      )}
    </div>
  );
}

