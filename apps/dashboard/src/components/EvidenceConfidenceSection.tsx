"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  EvidenceEvaluation,
  Submission,
  EvidenceQualityDetails,
  EvidenceCoverageDetails,
  EvidenceContextDetails,
  EvidenceIntegrityDetails,
} from "@/lib/api";
import { normalizePeril } from "../lib/claim-routing";
import { apiFetch } from "../lib/auth-headers";
import { adaptiveConfidence } from "../lib/context/adaptive-engine";
import type { ContextSignal } from "../lib/context/types";
import { isCropMatch } from "../lib/crop-synonyms";

const ALL_ANGLES = [
  { key: "photo_1", label: "Photo 1 (Field Overview)" },
  { key: "photo_2", label: "Photo 2 (Crop Condition)" },
  { key: "photo_3", label: "Photo 3 (Damage Detail)" },
];

/**
 * Derive a robust, complete EvidenceEvaluation from submission data
 * when the backend has not yet persisted or returned one (legacy submissions).
 */
export function resolveEvidenceEvaluation(submission: Submission): EvidenceEvaluation {
  const raw = submission.latest_evaluation || submission.evidence_evaluation;

  // Fallback calculation for legacy or partial submissions
  const images = submission.images || [];
  const uploaded = images.filter((img) => img.upload_status === "uploaded");

  // Deduplicate identical hashes or duplicate download URLs
  const seenHashes = new Set<string>();
  const seenUrls = new Set<string>();
  const distinctUploaded: typeof uploaded = [];
  let hasDuplicate = false;

  for (const img of uploaded) {
    if (img.sha256 && /^[0-9a-f]{64}$/i.test(img.sha256)) {
      const h = img.sha256.toLowerCase().trim();
      if (seenHashes.has(h)) {
        hasDuplicate = true;
        continue;
      }
      seenHashes.add(h);
    }
    if (img.download_url) {
      if (seenUrls.has(img.download_url)) {
        hasDuplicate = true;
        continue;
      }
      seenUrls.add(img.download_url);
    }
    distinctUploaded.push(img);
  }

  const hasLegacyAngles = uploaded.some((img) =>
    ["wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage"].includes(img.angle_type)
  );
  const has3PhotoAngles = uploaded.some((img) =>
    ["photo_1", "photo_2", "photo_3"].includes(img.angle_type)
  );

  const hasWide = uploaded.some((img) => img.angle_type === "wide_field" || img.angle_type === "photo_1");
  const hasCloseup = uploaded.some((img) => img.angle_type === "closeup_damage" || img.angle_type === "photo_3");

  const distinctCount = Math.min(3, distinctUploaded.length);
  let coverageScore: number;
  let missingAngles: string[];

  if (hasLegacyAngles && !has3PhotoAngles) {
    // Legacy 5-angle submission evaluation
    const legacyAngles = ["wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage"];
    const legacyUploaded = new Set(uploaded.map((img) => img.angle_type));
    missingAngles = legacyAngles.filter((k) => !legacyUploaded.has(k));

    if (!hasCloseup && !hasWide) {
      coverageScore = 30;
    } else if (!hasCloseup) {
      coverageScore = 55;
    } else if (!hasWide) {
      coverageScore = 65;
    } else if (missingAngles.length > 0) {
      coverageScore = Math.max(40, 100 - missingAngles.length * 15);
    } else {
      coverageScore = 100;
    }
  } else {
    // Modern 3-photo evidence system: any 3 distinct clear photos give 100% coverage
    coverageScore = Math.min(100, Math.round((distinctCount / 3) * 100));
    missingAngles =
      distinctCount >= 3
        ? []
        : distinctCount === 2
          ? ["photo_3"]
          : distinctCount === 1
            ? ["photo_2", "photo_3"]
            : ["photo_1", "photo_2", "photo_3"];
  }

  // Context score calculation
  const hasGps = submission.capture_lat != null && submission.capture_lon != null;
  const gpsAcc = submission.capture_accuracy_m ?? 50;
  const gpsValid = hasGps && gpsAcc <= 50;
  const contextScore = gpsValid ? (gpsAcc <= 15 ? 100 : 80) : hasGps ? 50 : 20;

  // Quality score calculation
  const warnings = submission.latest_prediction?.quality_warnings || [];
  const lightingScores = images
    .map((img) => img.quality_flags?.lighting_score)
    .filter((value): value is number => typeof value === "number");
  const blurScores = images
    .map((img) => img.quality_flags?.blur_score)
    .filter((value): value is number => typeof value === "number");
  let qualityScore = Math.max(20, 100 - warnings.length * 20);
  if (lightingScores.length) {
    qualityScore = Math.round(lightingScores.reduce((a, b) => a + b, 0) / lightingScores.length);
  } else if (hasLegacyAngles && !has3PhotoAngles && !hasCloseup) {
    qualityScore = Math.min(qualityScore, 75);
  }

  // Integrity score calculation
  const anomalies = submission.latest_prediction?.anomaly_flags || [];
  const validHashes = images
    .map((img) => (img.sha256 ? String(img.sha256).toLowerCase().trim() : ""))
    .filter((h) => /^[0-9a-f]{64}$/i.test(h));
  const uniqueHashes = new Set(validHashes);
  const hasDuplicateHash = validHashes.length > uniqueHashes.size;
  // Read the persisted vision-gate verdict so this card agrees with the Quality
  // card instead of reporting PASSED while the gate rejected the claim.
  const gateRaw = (submission as unknown as { gate_result?: unknown }).gate_result as {
    gateFailed?: unknown;
    overridden?: unknown;
    blockingReason?: unknown;
    duplicateAngles?: unknown;
    perImage?: unknown;
  } | null | undefined;
  const gateOverridden = gateRaw?.overridden === true;
  const gateFailedHard = gateRaw?.gateFailed === true && !gateOverridden;
  const gateBlockingReason =
    typeof gateRaw?.blockingReason === "string" && gateRaw.blockingReason.trim()
      ? gateRaw.blockingReason.trim()
      : null;
  const gatePerImage = Array.isArray(gateRaw?.perImage)
    ? (gateRaw.perImage as Array<{ usable?: unknown; reason?: unknown; angleType?: unknown }>)
    : [];
  const gateDuplicateAngles = [
    ...gatePerImage
      .filter((p) => p.usable === false && p.reason === "duplicate_angle")
      .map((p) => String(p.angleType || "")),
    ...(Array.isArray(gateRaw?.duplicateAngles)
      ? (gateRaw?.duplicateAngles as unknown[]).map(String)
      : []),
  ].filter(Boolean);

  let integrityScore = 100;
  if (gateFailedHard) {
    integrityScore = 0;
  } else if (anomalies.length > 0) {
    integrityScore = 30;
  } else if (hasDuplicateHash) {
    integrityScore = 40;
  } else if (gateDuplicateAngles.length > 0) {
    integrityScore = 70;
  }

  // Overall confidence calculation
  const finalConf = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        0.4 * qualityScore +
          0.3 * coverageScore +
          0.2 * contextScore +
          0.1 * integrityScore
      )
    )
  );

  // Derive dominant uncertainty
  let uncType: "integrity" | "coverage" | "visual" | "context" | null = null;
  let uncSev: "low" | "medium" | "high" | "critical" | null = null;
  const uncReasons: string[] = [];
  let recAction: "human_review" | "retake_image" | "request_specific_evidence" | "request_context" | "none" = "none";

  if (integrityScore < 50 || gateFailedHard) {
    uncType = "integrity";
    uncSev = "critical";
    recAction = "human_review";
    if (gateFailedHard) {
      uncReasons.push(
        `Authenticity rejected by vision gate${gateBlockingReason ? `: ${gateBlockingReason.replaceAll("_", " ")}` : ""}`
      );
    }
    if (hasDuplicateHash) {
      uncReasons.push("Duplicate image hash detected across frames");
    }
    uncReasons.push(...anomalies.map((a) => `Integrity issue: ${String(a)}`));
  } else if (coverageScore < 80 || missingAngles.length > 0) {
    uncType = "coverage";
    uncSev = coverageScore < 50 ? "high" : "medium";
    if (missingAngles.length > 0) {
      uncReasons.push(`Missing required photos: ${missingAngles.join(", ")}`);
    }
    recAction = "request_specific_evidence";
  } else if (qualityScore < 70 || warnings.length > 0) {
    uncType = "visual";
    uncSev = "medium";
    uncReasons.push(...warnings.map((w) => `Visual quality warning: ${String(w)}`));
    recAction = "retake_image";
  } else if (contextScore < 70) {
    uncType = "context";
    uncSev = "low";
    uncReasons.push(hasGps ? "Weak GPS accuracy" : "Missing GPS coordinates");
    recAction = "request_context";
  }

  // Derive granular quality sub-metrics
  let resolutionScore: number | undefined = undefined;
  if (uploaded.length > 0) {
    const hasDimensions = images.some((img: any) => img.dimensions?.width && img.dimensions?.height);
    if (hasDimensions) {
      const avgPixels = images
        .map((img: any) => (img.dimensions?.width || 0) * (img.dimensions?.height || 0))
        .filter((p) => p > 0);
      const mean = avgPixels.reduce((a, b) => a + b, 0) / avgPixels.length;
      resolutionScore = Math.min(1, Math.max(0.75, Math.round((mean / 921600) * 100) / 100));
    } else {
      const avgBlur = blurScores.length ? blurScores.reduce((a, b) => a + b, 0) / blurScores.length : 0;
      resolutionScore = Math.max(0.75, Math.round(100 - avgBlur * 0.25) / 100);
    }
  }

  let framingScore: number | undefined = undefined;
  if (uploaded.length > 0) {
    const framingWarnings = warnings.filter((w) => /fram|crop|bound|angle|focus/i.test(String(w)));
    const baseFraming = coverageScore >= 80 ? 0.95 : coverageScore >= 50 ? 0.80 : 0.65;
    framingScore = Math.max(0.35, Math.round((baseFraming - framingWarnings.length * 0.15) * 100) / 100);
  }

  let cropVisibility: string | undefined = undefined;
  if (submission.latest_prediction?.predicted_crop && submission.latest_prediction.predicted_crop !== "unknown") {
    const cropConf = submission.latest_prediction.crop_confidence != null
      ? `${Math.round(submission.latest_prediction.crop_confidence * 100)}%`
      : "High";
    cropVisibility = `${cropConf} (${submission.latest_prediction.predicted_crop})`;
  } else if (submission.crop_type) {
    cropVisibility = `Present (${submission.crop_type})`;
  } else if (uploaded.length > 0) {
    cropVisibility = "Visible";
  }

  let damageVisibility: string | undefined = undefined;
  if (submission.latest_prediction?.affected_area_pct != null && submission.latest_prediction.affected_area_pct > 0) {
    damageVisibility = `${submission.latest_prediction.affected_area_pct}% area affected`;
  } else if (submission.latest_prediction?.primary_damage && submission.latest_prediction.primary_damage !== "unknown") {
    damageVisibility = `${submission.latest_prediction.primary_damage.replaceAll("_", " ")} detected`;
  } else if (hasCloseup) {
    damageVisibility = "Verified (Close-up)";
  } else if (uploaded.length > 0) {
    damageVisibility = "Field view assessed";
  }

  let consistencyScore: number | undefined = undefined;
  if (uploaded.length > 0) {
    let penalty = 0;
    if (hasDuplicateHash || hasDuplicate) penalty += 0.4;
    if (anomalies.length > 0) penalty += 0.3;
    if (lightingScores.length > 1) {
      const minLight = Math.min(...lightingScores);
      const maxLight = Math.max(...lightingScores);
      if (maxLight - minLight > 40) penalty += 0.1;
    }
    consistencyScore = Math.max(0.25, Math.round((0.96 - penalty) * 100) / 100);
  }

  const qualityDetails: EvidenceQualityDetails = {
    blur_score: blurScores.length
      ? blurScores.reduce((a, b) => a + b, 0) / blurScores.length / 100
      : undefined,
    brightness_score: lightingScores.length
      ? lightingScores.reduce((a, b) => a + b, 0) / lightingScores.length / 100
      : undefined,
    resolution_score: resolutionScore,
    framing_score: framingScore,
    crop_visibility: cropVisibility,
    damage_visibility: damageVisibility,
    consistency_score: consistencyScore,
    issues: warnings.map(String),
  };

  const coverageDetails: EvidenceCoverageDetails = {
    required_views: hasLegacyAngles && !has3PhotoAngles ? 5 : 3,
    usable_views: hasLegacyAngles && !has3PhotoAngles ? uploaded.length : distinctCount,
    missing_views: missingAngles,
    wide_context: hasWide,
    closeup_damage: hasCloseup,
    views_present: uploaded.length,
    views_required: hasLegacyAngles && !has3PhotoAngles ? 5 : 3,
  };

  // Derive plot proximity from signals or coordinates
  const rawContextSignals = (submission as any).context_signals ?? (submission as any).contextSignals;
  let parsedSignals: any[] = [];
  if (Array.isArray(rawContextSignals)) {
    parsedSignals = rawContextSignals;
  } else if (typeof rawContextSignals === "string") {
    try { parsedSignals = JSON.parse(rawContextSignals); } catch { /* ignore */ }
  }
  const plotSignal = parsedSignals.find((s: any) => s?.source === "plot_match");
  const imdSignal = parsedSignals.find((s: any) => s?.source === "imd");

  let plotMatch: boolean | undefined = undefined;
  if (plotSignal && typeof plotSignal.meta?.within === "boolean") {
    plotMatch = plotSignal.meta.within;
  } else if (hasGps) {
    const pLat = (submission as any).plot_lat ?? (submission as any).plotLat;
    const pLon = (submission as any).plot_lon ?? (submission as any).plotLon;
    if (pLat != null && pLon != null) {
      const R = 6371000;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(pLat - (submission.capture_lat || 0));
      const dLon = toRad(pLon - (submission.capture_lon || 0));
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(submission.capture_lat || 0)) * Math.cos(toRad(pLat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const dist = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
      plotMatch = dist <= 200;
    } else if (submission.plot_name || submission.crop_cycle_id) {
      plotMatch = gpsValid;
    }
  }

  const contextDetails: EvidenceContextDetails = {
    gps_valid: gpsValid,
    gps_accuracy_m: submission.capture_accuracy_m,
    plot_match: plotMatch,
    capture_time_valid: true,
    crop_context_matched: Boolean(
      submission.latest_prediction?.predicted_crop && submission.crop_type
        ? isCropMatch(submission.latest_prediction.predicted_crop, submission.crop_type)
        : true
    ),
    weather_status: imdSignal?.status === "available"
      ? (typeof imdSignal.meta?.imdCategory === "string" ? imdSignal.meta.imdCategory : "verified")
      : undefined,
  };

  const integrityDetails: EvidenceIntegrityDetails = {
    sha256_verified: uploaded.some((img) => Boolean(img.sha256)),
    authenticity_verified: Boolean(submission.latest_prediction) && anomalies.length === 0 && !gateFailedHard,
    flags: [
      ...anomalies.map(String),
      ...(gateFailedHard
        ? [`Vision gate rejected${gateBlockingReason ? `: ${gateBlockingReason.replaceAll("_", " ")}` : ""}`]
        : gateDuplicateAngles.length > 0
          ? [`Possible duplicate angle (${gateDuplicateAngles.join(", ")}) — counted as missing coverage`]
          : []),
    ],
  };

  const fallback: EvidenceEvaluation = {
    evaluation_version: "evidence-confidence-v1",
    quality: { score: qualityScore, available: true, details: qualityDetails },
    coverage: { score: coverageScore, available: true, details: coverageDetails },
    context: { score: contextScore, available: true, details: contextDetails },
    integrity: { score: integrityScore, available: true, details: integrityDetails },
    confidence: {
      final: finalConf,
      threshold: 85,
      quality: qualityScore,
      coverage: coverageScore,
      context: contextScore,
      integrity: integrityScore,
    },
    uncertainty: {
      present: finalConf < 85 || uncType !== null,
      type: uncType || (finalConf < 85 ? "coverage" : "none"),
      severity: uncSev || (finalConf < 85 ? "medium" : "low"),
      reasons: uncReasons.length > 0 ? uncReasons : finalConf < 85 ? ["Evidence confidence is below threshold (85)"] : [],
      recommended_action: recAction,
    },
    request: missingAngles.length > 0 ? {
      type: "specific_evidence",
      required_angles: missingAngles,
      title: `Capture missing ${missingAngles.join(", ")} evidence`,
      instructions: `Please provide clear photo(s) for the missing angle(s): ${missingAngles.join(", ")}.`,
    } : null,
  };

  if (!raw) return fallback;

  return {
    ...fallback,
    ...raw,
    quality: {
      ...fallback.quality,
      ...(raw.quality || {}),
      details: { ...fallback.quality.details, ...((raw.quality as any)?.details || {}) },
      score: raw.quality?.score ?? fallback.quality.score,
    },
    coverage: {
      ...fallback.coverage,
      ...(raw.coverage || {}),
      details: { ...fallback.coverage.details, ...((raw.coverage as any)?.details || {}) },
      score: raw.coverage?.score ?? fallback.coverage.score,
    },
    context: {
      ...fallback.context,
      ...(raw.context || {}),
      details: { ...fallback.context.details, ...((raw.context as any)?.details || {}) },
      score: raw.context?.score ?? fallback.context.score,
    },
    integrity: {
      ...fallback.integrity,
      ...(raw.integrity || {}),
      details: { ...fallback.integrity.details, ...((raw.integrity as any)?.details || {}) },
      score: raw.integrity?.score ?? fallback.integrity.score,
    },
    confidence: { ...fallback.confidence, ...(raw.confidence || {}), final: raw.confidence?.final ?? fallback.confidence.final },
    uncertainty: { ...fallback.uncertainty, ...(raw.uncertainty || {}), type: raw.uncertainty?.type ?? fallback.uncertainty.type, reasons: raw.uncertainty?.reasons || fallback.uncertainty.reasons },
  };
}

export interface EvidenceConfidenceSectionProps {
  submission: Submission;
}

export function EvidenceConfidenceSection({ submission }: EvidenceConfidenceSectionProps) {
  const evaluation = resolveEvidenceEvaluation(submission);
  const { quality, coverage, context, integrity, confidence, uncertainty, request } = evaluation;

  // Adaptive recapture result: confidence delta vs. previous stored confidence
  const adaptiveStored = (submission.adaptive_result ?? null) as {
    confidence_delta?: unknown;
    previousConfidence?: unknown;
  } | null;
  const storedDelta =
    typeof adaptiveStored?.confidence_delta === "number" ? (adaptiveStored.confidence_delta as number) : null;
  const storedPrev =
    typeof adaptiveStored?.previousConfidence === "number"
      ? (adaptiveStored.previousConfidence as number)
      : null;

  const finalScore = confidence?.final ?? 0;
  const baseThreshold = confidence?.threshold ?? 85;
  const peril = normalizePeril((submission as any).peril || (submission as any).claim_type || "normal");
  const [signals, setSignals] = useState<ContextSignal[] | null>(null);
  const [signalsLoading, setSignalsLoading] = useState(false);
  useEffect(() => {
    // Prefer persisted signals if already present on submission (no extra fetch)
    const persisted = (submission as any).context_signals ?? (submission as any).contextSignals ?? null;
    if (Array.isArray(persisted) && persisted.length > 0) {
      setSignals(persisted as ContextSignal[]);
      setSignalsLoading(false);
      return;
    }
    // also handle case where persisted is stored as JSON string
    if (typeof persisted === "string") {
      try {
        const parsed = JSON.parse(persisted);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSignals(parsed as ContextSignal[]);
          setSignalsLoading(false);
          return;
        }
      } catch {
        // fall through to fetch
      }
    }
    const lat = (submission as any).capture_lat ?? (submission as any).captureLat;
    const lon = (submission as any).capture_lon ?? (submission as any).captureLon;
    const plotLat = (submission as any).plot_lat ?? (submission as any).plotLat;
    const plotLon = (submission as any).plot_lon ?? (submission as any).plotLon;
    if (lat == null || lon == null) return;
    let cancelled = false;
    setSignalsLoading(true);
    apiFetch("/api/context/assemble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat,
        lon,
        peril,
        sowingDate: (submission as any).sowingDate,
        plotLat,
        plotLon,
      }),
    })
      .then((r) => r.json().catch(() => null))
      .then((j: any) => {
        if (!cancelled && Array.isArray(j?.signals)) setSignals(j.signals as ContextSignal[]);
      })
      .finally(() => {
        if (!cancelled) setSignalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    submission.id,
    peril,
    (submission as any).context_signals,
    (submission as any).contextSignals,
    (submission as any).plot_lat,
    (submission as any).plotLat,
    (submission as any).plot_lon,
    (submission as any).plotLon,
  ]);
  const adaptive = adaptiveConfidence({
    quality: quality.score,
    coverage: coverage.score,
    context: context.score,
    integrity: integrity.score,
    overall: finalScore,
    peril,
    signals: signals || undefined,
    gateFailed: integrity.score < 10,
  });
  const threshold = adaptive.threshold;
  const isAboveThreshold = finalScore >= threshold;

  const [activeTab, setActiveTab] = useState<"all" | "quality" | "coverage" | "context" | "integrity">("all");

  const qDetails: EvidenceQualityDetails = quality?.details || {};
  const cDetails: EvidenceCoverageDetails = coverage?.details || {};
  const dynamicPlotSignal = signals?.find((s) => s.source === "plot_match");
  const dynamicWeatherSignal = signals?.find((s) => s.source === "imd");
  const ctxDetails: EvidenceContextDetails = {
    ...context?.details,
    ...(dynamicPlotSignal && typeof dynamicPlotSignal.meta?.within === "boolean"
      ? { plot_match: dynamicPlotSignal.meta.within }
      : {}),
    ...(dynamicWeatherSignal?.status === "available" && dynamicWeatherSignal.meta?.imdCategory
      ? { weather_status: String(dynamicWeatherSignal.meta.imdCategory) }
      : {}),
  };
  const iDetails: EvidenceIntegrityDetails = integrity?.details || {};

  // Status badges calculation for accessibility
  const getStatusBadge = (score: number, failedFlag?: boolean) => {
    if (failedFlag || score < 50) {
      return { text: "FAILED / CRITICAL", bg: "bg-rose-100 text-rose-800 border-rose-300" };
    }
    if (score < 80) {
      return { text: "ATTENTION NEEDED", bg: "bg-amber-100 text-amber-800 border-amber-300" };
    }
    return { text: "PASSED / VERIFIED", bg: "fp-badge-ok" };
  };

  const qStatus = getStatusBadge(quality.score, (qDetails.issues && qDetails.issues.length > 0 && quality.score < 50));
  const cStatus = getStatusBadge(coverage.score, Array.isArray(cDetails.missing_views) && cDetails.missing_views.length >= 3);
  const ctxStatus = getStatusBadge(context.score, ctxDetails.gps_valid === false);
  const iStatus = getStatusBadge(integrity.score, iDetails.tamper_check_passed === false || iDetails.duplicate_detected === true);

  return (
    <section className="fp-panel space-y-2 p-4" aria-labelledby="evidence-confidence-heading">
      {/* Section header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2">
        <div>
          <h3 id="evidence-confidence-heading" className="text-sm font-semibold text-slate-900">
            Evidence confidence
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Reliability, authenticity and completeness of submitted evidence
          </p>
        </div>
        {evaluation.evaluation_version && (
          <span className="hidden rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 sm:inline">
            {evaluation.evaluation_version}
          </span>
        )}
      </div>

      {/* Compact Evidence Confidence strip — subpart, not hero */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-sm border border-[var(--line)] px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wider text-slate-500 text-[11px]">Final evidence confidence</span>
          <span className="font-mono text-lg font-extrabold tabular-nums text-slate-900">{finalScore}<span className="text-xs font-semibold text-slate-400">/100</span></span>
          <span className="font-mono text-[11px] text-slate-500">thr {threshold}</span>
          <span
            className={`rounded px-1.5 py-0.5 font-bold text-[10px] border ${
              isAboveThreshold ? "fp-badge-ok" : "bg-amber-50 text-amber-700 border-amber-200"
            }`}
          >
            {isAboveThreshold ? "SUFFICIENT" : "SUB-THRESHOLD"}
          </span>
          {evaluation.confidence_delta != null && (
            <span className={`font-mono font-bold ${evaluation.confidence_delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              Δ {evaluation.confidence_delta > 0 ? `+${evaluation.confidence_delta}` : evaluation.confidence_delta}
            </span>
          )}
        </div>
        <div className="h-1.5 min-w-28 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${isAboveThreshold ? "bg-emerald-600" : "bg-amber-500"}`}
            style={{ width: `${Math.min(Math.max(finalScore, 0), 100)}%` }}
          />
        </div>
        <span className="font-medium capitalize text-slate-600">
          {uncertainty.type && uncertainty.type !== "none" ? `${uncertainty.type}${uncertainty.severity ? ` · ${uncertainty.severity}` : ""}` : "no blocking uncertainty"}
        </span>
      </div>

      {/* 4 Pillars Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-sm border border-[var(--line)] bg-white p-2 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">Quality</span>
          <span className="font-mono text-sm font-bold text-slate-900">{quality.score}<span className="text-[10px] text-slate-400">/100</span></span>
          <span className={`block mt-1 truncate rounded px-1.5 py-0.5 text-[9px] font-bold ${qStatus.bg}`}>{qStatus.text}</span>
        </div>
        <div className="rounded-sm border border-[var(--line)] bg-white p-2 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">Coverage</span>
          <span className="font-mono text-sm font-bold text-slate-900">{coverage.score}<span className="text-[10px] text-slate-400">/100</span></span>
          <span className={`block mt-1 truncate rounded px-1.5 py-0.5 text-[9px] font-bold ${cStatus.bg}`}>{cStatus.text}</span>
        </div>
        <div className="rounded-sm border border-[var(--line)] bg-white p-2 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">Context</span>
          <span className="font-mono text-sm font-bold text-slate-900">{context.score}<span className="text-[10px] text-slate-400">/100</span></span>
          <span className={`block mt-1 truncate rounded px-1.5 py-0.5 text-[9px] font-bold ${ctxStatus.bg}`}>{ctxStatus.text}</span>
        </div>
        <div className="rounded-sm border border-[var(--line)] bg-white p-2 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">Integrity</span>
          <span className="font-mono text-sm font-bold text-slate-900">{integrity.score}<span className="text-[10px] text-slate-400">/100</span></span>
          <span className={`block mt-1 truncate rounded px-1.5 py-0.5 text-[9px] font-bold ${iStatus.bg}`}>{iStatus.text}</span>
        </div>
      </div>

      {/* Uncertainty & Action Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500">Uncertainty:</span>
          <span className="font-bold text-slate-800 capitalize">{uncertainty.type || "None"}</span>
          {uncertainty.severity && uncertainty.severity !== "low" && (
            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700 border border-rose-200">
              {uncertainty.severity}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-500">Recommended Action:</span>
          <span className="font-bold text-slate-900 capitalize">
            {uncertainty.recommended_action
              ? uncertainty.recommended_action.replaceAll("_", " ")
              : "Normal Review"}
          </span>
        </div>
      </div>

      {/* Uncertainty Reasons Callout */}
      {uncertainty.reasons && uncertainty.reasons.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50/80 p-2 text-xs text-amber-900">
          <span className="font-bold">Uncertainty Reason:</span>
          <ul className="mt-0.5 list-disc list-inside space-y-0.5 text-amber-800 text-[11px]">
            {uncertainty.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Generated Evidence Request Preview */}
      {request && (
        <div className="rounded border border-blue-200 bg-blue-50/80 p-2 text-xs text-blue-900">
          <span className="font-bold">Specific Evidence Request:</span>
          <p className="mt-0.5 text-blue-800 font-medium text-[11px]">{request.title || request.instructions}</p>
          {request.required_angles && request.required_angles.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {request.required_angles.map((a) => (
                <span key={a} className="rounded bg-blue-200/70 px-1.5 py-0.5 font-mono text-[10px] text-blue-900 font-bold">
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collapsible Component Diagnostics & Verification Breakdown */}
      <details className="group rounded-sm border border-[var(--line)] bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors">
          <span className="flex items-center gap-1.5">
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
            Detailed Evidence Diagnostics & Sub-metrics
          </span>
          <span className="font-mono text-[10px] text-slate-400 font-normal">
            Quality · Coverage · Context · Integrity
          </span>
        </summary>
        <div className="space-y-3 border-t border-[var(--line)] p-3">
          {/* Adaptive Engine Result */}
          <div className={`rounded border p-2.5 text-xs ${adaptive.level === "high" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : adaptive.level === "medium" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
            <div className="flex items-center gap-2">
              <span className="font-bold uppercase tracking-wider">
                Adaptive: {adaptive.level} · {adaptive.nextStep.replaceAll("_", " ")}
              </span>
              {storedDelta != null && storedDelta !== 0 && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    storedDelta > 0 ? "bg-emerald-200 text-emerald-900" : "bg-amber-200 text-amber-900"
                  }`}
                  title="Confidence change after recapture"
                >
                  {storedDelta > 0
                    ? `▲ +${storedDelta.toFixed(1)} after recapture`
                    : `▼ ${storedDelta.toFixed(1)}`}
                  {storedPrev != null && <span className="ml-1 font-normal">(prev {storedPrev})</span>}
                </span>
              )}
              <span className="ml-auto font-mono text-[11px]">threshold {adaptive.threshold}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${adaptive.level === "high" ? "bg-emerald-200" : adaptive.level === "medium" ? "bg-amber-200" : "bg-rose-200"}`}>
                {peril}
              </span>
            </div>
            {adaptive.reasons.length > 0 && <p className="mt-1">{adaptive.reasons[0]}</p>}
          </div>

          {/* Four Component Cards Header & Filter Tabs */}
          <div className="flex items-center justify-between pt-1">
            <h4 className="text-sm font-semibold text-slate-900">
              Component breakdown
            </h4>
            <div className="flex gap-1 text-[11px]">
              {(["all", "quality", "coverage", "context", "integrity"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-sm border px-2 py-0.5 font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)] font-semibold"
                      : "bg-transparent text-slate-500 border-transparent hover:bg-white hover:text-slate-900 hover:border-slate-200"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

      {/* 4 Component Cards Grid */}
      <div className="grid gap-2 md:grid-cols-2">
        {/* Card 1: Evidence Quality */}
        {(activeTab === "all" || activeTab === "quality") && (
          <div className="rounded-sm border border-[var(--line)] bg-white p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <span className="text-xs font-bold text-slate-800">1. Evidence Quality</span>
                <span className="ml-2 font-mono text-sm font-extrabold text-slate-900 tabular-nums">
                  {quality.score} / 100
                </span>
              </div>
              <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${qStatus.bg}`}>
                {qStatus.text}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <dt className="text-slate-500">Blur:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {qDetails.blur_score != null ? `${(qDetails.blur_score * 100).toFixed(0)}%` : "Not measured"}
              </dd>
              <dt className="text-slate-500">Brightness:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {qDetails.brightness_score != null ? `${(qDetails.brightness_score * 100).toFixed(0)}%` : "Not measured"}
              </dd>
              <dt className="text-slate-500">Resolution:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {qDetails.resolution_score != null ? `${(qDetails.resolution_score * 100).toFixed(0)}%` : "Not measured"}
              </dd>
              <dt className="text-slate-500">Framing:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {qDetails.framing_score != null ? `${(qDetails.framing_score * 100).toFixed(0)}%` : "Not measured"}
              </dd>
              <dt className="text-slate-500">Crop Visibility:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {qDetails.crop_visibility != null ? String(qDetails.crop_visibility) : "Not measured"}
              </dd>
              <dt className="text-slate-500">Damage Visibility:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {qDetails.damage_visibility != null ? String(qDetails.damage_visibility) : "Not measured"}
              </dd>
              <dt className="text-slate-500">Consistency:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {qDetails.consistency_score != null ? `${(qDetails.consistency_score * 100).toFixed(0)}%` : "Not measured"}
              </dd>
            </dl>

            {qDetails.issues && qDetails.issues.length > 0 && (
              <div className="rounded bg-rose-50 p-2 text-[11px] text-rose-800 border border-rose-200">
                <span className="font-semibold">Quality Issues:</span> {qDetails.issues.join(", ")}
              </div>
            )}
          </div>
        )}

        {/* Card 2: Evidence Coverage */}
        {(activeTab === "all" || activeTab === "coverage") && (
          <div className="rounded-sm border border-[var(--line)] bg-white p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <span className="text-xs font-bold text-slate-800">2. Evidence Coverage</span>
                <span className="ml-2 font-mono text-sm font-extrabold text-slate-900 tabular-nums">
                  {coverage.score} / 100
                </span>
              </div>
              <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${cStatus.bg}`}>
                {cStatus.text}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <dt className="text-slate-500">Required Views:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {cDetails.required_views != null ? String(cDetails.required_views) : "3 standard"}
              </dd>
              <dt className="text-slate-500">Usable Views:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {cDetails.usable_views != null ? String(cDetails.usable_views) : `${submission.images?.length || 0} / 3`}
              </dd>
              <dt className="text-slate-500">Wide Context View:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {cDetails.wide_context ? "Present (Passed)" : "Incomplete"}
              </dd>
              <dt className="text-slate-500">Close-up Damage:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {cDetails.closeup_damage ? "Present (Passed)" : "Missing / Incomplete"}
              </dd>
            </dl>

            {cDetails.missing_views && cDetails.missing_views.length > 0 ? (
              <div className="rounded bg-amber-50 p-2 text-[11px] text-amber-800 border border-amber-200">
                <span className="font-semibold">Missing Views:</span> {cDetails.missing_views.join(", ")}
              </div>
            ) : (
              <div className="fp-panel p-2 text-[11px]">
                All 5 recommended angle sweeps available.
              </div>
            )}
          </div>
        )}

        {/* Card 3: Context */}
        {(activeTab === "all" || activeTab === "context") && (
          <div className="rounded-sm border border-[var(--line)] bg-white p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <span className="text-xs font-bold text-slate-800">3. Contextual Verification</span>
                <span className="ml-2 font-mono text-sm font-extrabold text-slate-900 tabular-nums">
                  {context.score} / 100
                </span>
              </div>
              <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${ctxStatus.bg}`}>
                {ctxStatus.text}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <dt className="text-slate-500">GPS Coordinates:</dt>
              <dd className="font-mono text-slate-800 font-medium truncate">
                {submission.capture_lat != null
                  ? `${submission.capture_lat.toFixed(4)}, ${submission.capture_lon?.toFixed(4)}`
                  : "Unavailable"}
              </dd>
              <dt className="text-slate-500">GPS Accuracy:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {submission.capture_accuracy_m != null ? `±${submission.capture_accuracy_m} m` : "—"}
              </dd>
              <dt className="text-slate-500">Plot proximity:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {ctxDetails.plot_match === true
                  ? "Inside registered radius"
                  : ctxDetails.plot_match === false
                    ? "Outside registered radius"
                    : "Not computed"}
              </dd>
              <dt className="text-slate-500">Crop context:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {ctxDetails.crop_context_matched === true ? "Matches declared crop" : "See vision analysis"}
              </dd>
              <dt className="text-slate-500">Weather Status:</dt>
              <dd className="font-mono text-slate-800 font-medium capitalize">
                {ctxDetails.weather_status || "Normal conditions"}
              </dd>
            </dl>
          </div>
        )}

        {/* Card 4: Integrity */}
        {(activeTab === "all" || activeTab === "integrity") && (
          <div className="rounded-sm border border-[var(--line)] bg-white p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <span className="text-xs font-bold text-slate-800">4. Integrity & Anti-Fraud</span>
                <span className="ml-2 font-mono text-sm font-extrabold text-slate-900 tabular-nums">
                  {integrity.score} / 100
                </span>
              </div>
              <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${iStatus.bg}`}>
                {iStatus.text}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <dt className="text-slate-500">SHA-256 digest:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {iDetails.sha256_verified !== false ? "Stored on upload (server recomputed)" : "Missing"}
              </dd>
              <dt className="text-slate-500">GPS on frames:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {ctxDetails.gps_valid !== false ? "Coordinates present" : "Missing"}
              </dd>
              <dt className="text-slate-500">Vision authenticity:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {iDetails.authenticity_verified ? "Passed vision gate" : "Not run"}
              </dd>
              <dt className="text-slate-500">Integrity flags:</dt>
              <dd className="font-mono text-slate-800 font-medium">
                {iDetails.flags && iDetails.flags.length ? iDetails.flags.join(", ") : "None recorded"}
              </dd>
            </dl>

            {iDetails.flags && iDetails.flags.length > 0 && (
              <div className="rounded bg-rose-50 p-2 text-[11px] text-rose-800 border border-rose-200">
                <span className="font-semibold">Integrity Flags:</span> {iDetails.flags.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
        </div>
      </details>
    </section>
  );
}
