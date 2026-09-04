"use client";

import React, { useEffect, useState } from "react";
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
  } else if (!hasCloseup) {
    qualityScore = Math.min(qualityScore, 75);
  }

  // Integrity score calculation
  const anomalies = submission.latest_prediction?.anomaly_flags || [];
  const validHashes = images
    .map((img) => (img.sha256 ? String(img.sha256).toLowerCase().trim() : ""))
    .filter((h) => /^[0-9a-f]{64}$/i.test(h));
  const uniqueHashes = new Set(validHashes);
  const hasDuplicateHash = validHashes.length > uniqueHashes.size;
  let integrityScore = anomalies.length > 0 ? 40 : 100;
  if (hasDuplicateHash || hasDuplicate) {
    integrityScore = Math.min(integrityScore, 35);
  }

  // Final confidence: 0.4*quality + 0.3*coverage + 0.2*context + 0.1*integrity
  const finalConf = Math.round(
    0.4 * qualityScore + 0.3 * coverageScore + 0.2 * contextScore + 0.1 * integrityScore
  );

  // Determine dominant uncertainty
  let uncType: string | null = null;
  let uncSev: string | null = null;
  const uncReasons: string[] = [];
  let recAction: string | null = "none";

  if (integrityScore < 70) {
    uncType = "integrity";
    uncSev = "critical";
    if (hasDuplicateHash || hasDuplicate) {
      uncReasons.push("Integrity issue: duplicate image or exact same angle uploaded across photos");
    }
    uncReasons.push(...anomalies.map((a) => `Integrity issue: ${String(a)}`));
    recAction = "human_review";
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

  const qualityDetails: EvidenceQualityDetails = {
    blur_score: blurScores.length
      ? blurScores.reduce((a, b) => a + b, 0) / blurScores.length / 100
      : undefined,
    brightness_score: lightingScores.length
      ? lightingScores.reduce((a, b) => a + b, 0) / lightingScores.length / 100
      : undefined,
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

  const contextDetails: EvidenceContextDetails = {
    gps_valid: gpsValid,
    gps_accuracy_m: submission.capture_accuracy_m,
    plot_match: undefined,
    capture_time_valid: undefined,
    crop_context_matched: undefined,
    weather_status: undefined,
  };

  const integrityDetails: EvidenceIntegrityDetails = {
    sha256_verified: uploaded.some((img) => Boolean(img.sha256)),
    authenticity_verified: Boolean(submission.latest_prediction) && anomalies.length === 0,
    flags: anomalies.map(String),
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
    if (lat == null || lon == null) return;
    let cancelled = false;
    setSignalsLoading(true);
    apiFetch("/api/context/assemble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon, peril, sowingDate: (submission as any).sowingDate }),
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
  }, [submission.id, peril, (submission as any).context_signals, (submission as any).contextSignals]);
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
  const ctxDetails: EvidenceContextDetails = context?.details || {};
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
    <section className="fp-panel space-y-4 p-5 border-l-4 border-l-emerald-600 shadow-sm" aria-labelledby="evidence-confidence-heading">
      {/* Explicit Section Header with Clear Distinction */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--ink)]" aria-hidden="true" />
            <h3 id="evidence-confidence-heading" className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Evidence Confidence & Trust Layer
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Authoritative evaluation of evidence reliability, authenticity & completeness · Distinct from Model Prediction
          </p>
        </div>
        {evaluation.evaluation_version && (
          <span className="hidden rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 sm:inline">
            {evaluation.evaluation_version}
          </span>
        )}
      </div>

      {/* Prominent Evidence Confidence Display */}
      <div className="fp-panel p-4">
        <div className="grid gap-4 sm:grid-cols-12 items-center">
          {/* Large Final Score */}
          <div className="sm:col-span-4 flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-4 text-center">
            <span className="text-xs font-semibold uppercase text-slate-500">Final Evidence Confidence</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-mono text-4xl font-extrabold tracking-tight text-slate-900 tabular-nums">
                {finalScore}
              </span>
              <span className="text-base font-semibold text-slate-400">/ 100</span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span className="font-medium text-slate-600">Threshold:</span>
              <span className="font-mono font-bold text-slate-800">{threshold}</span>
              <span
                className={`rounded px-1.5 py-0.5 font-bold text-[10px] border ${
                  isAboveThreshold
                    ? "fp-badge-ok"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                {isAboveThreshold ? "SUFFICIENT" : "SUB-THRESHOLD"}
              </span>
            </div>
            {evaluation.confidence_delta != null && (
              <div
                className={`mt-1.5 text-xs font-semibold flex items-center gap-1 ${
                  evaluation.confidence_delta >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                <span>
                  Δ {evaluation.confidence_delta > 0 ? `+${evaluation.confidence_delta}` : evaluation.confidence_delta}
                </span>
                <span className="text-[10px] text-slate-500">(Prev: {evaluation.previous_confidence})</span>
              </div>
            )}
          </div>

          {/* Uncertainty & Action Summary */}
          <div className="sm:col-span-8 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded border border-slate-200 bg-white p-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                  Dominant Uncertainty
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900 capitalize">
                    {uncertainty.type || "None"}
                  </span>
                  {uncertainty.severity && uncertainty.severity !== "low" && (
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700 border border-rose-200">
                      {uncertainty.severity}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-white p-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
                  Recommended Action
                </span>
                <div className="mt-1 font-bold text-sm text-slate-900 capitalize truncate">
                  {uncertainty.recommended_action
                    ? uncertainty.recommended_action.replaceAll("_", " ")
                    : "Normal Review"}
                </div>
              </div>
            </div>

            {/* Uncertainty Reasons Callout */}
            {uncertainty.reasons && uncertainty.reasons.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-900">
                <span className="font-bold">Uncertainty Reason:</span>
                <ul className="mt-1 list-disc list-inside space-y-0.5 text-amber-800">
                  {uncertainty.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Generated Evidence Request Preview */}
            {request && (
              <div className="rounded border border-blue-200 bg-blue-50/80 p-2.5 text-xs text-blue-900">
                <span className="font-bold">Specific Evidence Request:</span>
                <p className="mt-0.5 text-blue-800 font-medium">{request.title || request.instructions}</p>
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

            {/* Multi-signal Context Strip */}
            <div className="rounded border border-slate-200 bg-white p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Multi-signal Context</span>
                {signalsLoading && <span className="text-[11px] text-slate-500">Loading…</span>}
              </div>
              {signals && signals.length > 0 ? (
                <div className="mt-1.5 grid grid-cols-1 gap-1">
                  {signals.map((s) => (
                    <div key={s.source} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold capitalize text-slate-700">{s.labelEn}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${s.status === "available" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : s.status === "pending" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-600"}`}>
                        {s.status}
                      </span>
                    </div>
                  ))}
                  {signals.map((s) => (
                    <p key={`${s.source}-sum`} className="text-[11px] text-slate-600">
                      <span className="font-semibold">{s.labelEn}:</span> {s.summaryEn}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-500">{signalsLoading ? "Fetching IMD / Sentinel / Bhuvan…" : "No GPS — external checks need location."}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Four Component Cards Header & Filter Tabs */}
      <div className="flex items-center justify-between pt-1">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
          Component Breakdown (4 Pillars)
        </h4>
        <div className="flex gap-1 text-[11px]">
          {(["all", "quality", "coverage", "context", "integrity"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded px-2 py-0.5 font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Component Cards Grid */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Card 1: Evidence Quality */}
        {(activeTab === "all" || activeTab === "quality") && (
          <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-sm">
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
          <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-sm">
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
          <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-sm">
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
                {ctxDetails.crop_context_matched === true ? "Matches declared crop" : "See Gemini analysis"}
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
          <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2.5 shadow-sm">
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
              <dt className="text-slate-500">Gemini authenticity:</dt>
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
    </section>
  );
}
