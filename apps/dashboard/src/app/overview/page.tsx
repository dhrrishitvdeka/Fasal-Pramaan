"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listWebClaims, overviewStats } from "@/lib/api";
import { useRequireRole } from "@/lib/use-require-role";
import AccessGate from "@/components/AccessGate";
import MetricCard from "@/components/MetricCard";
import clsx from "clsx";
import { resolveEvidenceEvaluation } from "@/components/EvidenceConfidenceSection";
import { useLanguage } from "@/lib/LanguageContext";
import { downloadCsv, toCsv } from "@/lib/csv";
import type { PerilAnalytics } from "@/lib/web-db";
import {
  caseIdsForBucket,
  reviewerCardHref,
  type ReviewerCardBucket,
} from "@/lib/reviewer-card-routes";
import { PERIL_OPTIONS } from "@/lib/claim-routing";
import DashboardLoading from "@/app/loading";
import ErrorMessage from "@/components/ErrorMessage";

const OVERVIEW_SECTION_IDS = ["evidence", "workload", "outcomes", "context", "peril"] as const;
type OverviewSectionId = (typeof OVERVIEW_SECTION_IDS)[number];

function parseOverviewSection(raw: string): OverviewSectionId {
  return (OVERVIEW_SECTION_IDS as readonly string[]).includes(raw) ? (raw as OverviewSectionId) : "evidence";
}

export default function OverviewPage() {
  const { t } = useLanguage();
  const gate = useRequireRole(["reviewer", "administrator"]);
  // Phone-only compact tabs; desktop (lg+) shows every section. Persisted in the URL hash.
  const [section, setSection] = useState<OverviewSectionId>("evidence");

  useEffect(() => {
    const readHash = () => setSection(parseOverviewSection(window.location.hash.replace("#", "")));
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  const switchSection = (id: OverviewSectionId) => {
    window.history.replaceState(null, "", `#${id}`);
    setSection(id);
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["overview"],
    queryFn: overviewStats,
    refetchInterval: 15_000,
    enabled: gate.status === "ok",
  });
  const { data: claims } = useQuery({
    queryKey: ["review-queue"],
    queryFn: listWebClaims,
    refetchInterval: 15_000,
    enabled: gate.status === "ok",
  });

  const bucketIds = useMemo(() => {
    const items = (claims || []).map((submission) => ({
      submission,
      evaluation: resolveEvidenceEvaluation(submission),
    }));
    const buckets: ReviewerCardBucket[] = [
      "low_confidence",
      "integrity",
      "pending_review",
      "needs_recapture",
    ];
    return Object.fromEntries(buckets.map((bucket) => [bucket, caseIdsForBucket(items, bucket)])) as Record<
      ReviewerCardBucket,
      string[]
    >;
  }, [claims]);

  // Peril mix + authenticity rejects from gate_result
  const perilMix = useMemo<PerilAnalytics[]>(() => {
    const remote = data?.analytics_by_peril;
    if (remote && remote.length) return [...remote].sort((a, b) => b.count - a.count);
    const grouped = new Map<string, { count: number; confSum: number; recaptures: number }>();
    for (const s of claims || []) {
      const p = String(s.peril || "normal");
      const entry = grouped.get(p) || { count: 0, confSum: 0, recaptures: 0 };
      const conf = resolveEvidenceEvaluation(s).confidence.final;
      entry.count += 1;
      entry.confSum += conf;
      if (s.status === "needs_recapture") entry.recaptures += 1;
      grouped.set(p, entry);
    }
    return Array.from(grouped.entries())
      .map(([peril, v]): PerilAnalytics => ({
        peril,
        count: v.count,
        avgConfidence: Number((v.confSum / v.count).toFixed(1)),
        recaptureRate: v.count ? v.recaptures / v.count : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [data, claims]);

  const authenticityRejects = useMemo(() => {
    return (claims || []).filter((s) => {
      const g = s.gate_result as { gateFailed?: boolean; perImage?: Array<{ usable?: boolean }> } | null | undefined;
      if (!g) return false;
      if (g.gateFailed) return true;
      if (Array.isArray(g.perImage)) return g.perImage.some((p) => p.usable === false);
      return false;
    }).length;
  }, [claims]);

  const csvTimestamp = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  const handleExportPerilCsv = () => {
    const rows = (claims || []).map((s) => ({
      id: s.id,
      peril: s.peril || "normal",
      overall_confidence: resolveEvidenceEvaluation(s).confidence.final,
      gate_failed:
        (s.gate_result as { gateFailed?: boolean } | null | undefined)?.gateFailed ? "yes" : "no",
      status: s.status,
      created_at: s.latest_evaluation?.created_at ?? "",
    }));
    downloadCsv(`fasal-pramaan-peril-${csvTimestamp()}.csv`, toCsv(rows));
  };

  if (gate.status !== "ok") return <AccessGate status={gate.status} />;
  if (isLoading) {
    return <DashboardLoading />;
  }
  if (error || !data) {
    return (
      <div className="py-8">
        <ErrorMessage
          title="Something went wrong loading overview metrics"
          message={error instanceof Error ? error.message : "Unable to retrieve operational metrics. Please confirm reviewer credentials and API availability."}
          onRetry={() => void refetch()}
          actionHref="/review"
          actionLabel="Go to Review Queue"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h2 className="fp-page-title">{t("executiveOverview")}</h2>
          <p className="fp-page-sub">{t("operationalSnapshot")}</p>
        </div>
        <p className="hidden text-xs text-slate-400 sm:block">{t("autoRefresh")}</p>
      </div>

      {/* Compact section tabs (phone only — lg+ renders all sections stacked) */}
      <div
        className="fp-chip-row border-b border-slate-200 pb-2 text-xs lg:hidden"
        role="tablist"
        aria-label="Overview sections"
      >
        {(
          [
            { id: "evidence", label: "Evidence" },
            { id: "workload", label: "Workload" },
            { id: "outcomes", label: "Outcomes" },
            { id: "context", label: "Context" },
            { id: "peril", label: "Peril" },
          ] as Array<{ id: OverviewSectionId; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={section === tab.id}
            onClick={() => switchSection(tab.id)}
            className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
              section === tab.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        aria-label="Evidence Trust & Integrity"
        className={clsx("space-y-1", section !== "evidence" && "hidden lg:block")}
      >
        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--ink)]" aria-hidden="true" />
            {t("evidenceTrustHeading")}
          </h3>
          <span className="hidden text-[11px] font-medium text-slate-500 sm:inline">{t("independentFromModel")}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <MetricCard
            label={t("avgEvidenceConfidence")}
            value={
              data.average_evidence_confidence != null
                ? `${data.average_evidence_confidence.toFixed(1)}%`
                : "—"
            }
            tone={
              (data.average_evidence_confidence ?? 0) >= 80
                ? "ok"
                : (data.average_evidence_confidence ?? 0) >= 65
                ? "warn"
                : "danger"
            }
          />
          <MetricCard
            label={t("lowConfidenceCases")}
            href={reviewerCardHref("low_confidence", bucketIds.low_confidence)}
            value={claims ? bucketIds.low_confidence.length : (data.low_evidence_confidence_cases ?? 0)}
            hint={
              bucketIds.low_confidence.length === 1 ? t("openCase") : t("openQueue")
            }
            tone={
              (claims ? bucketIds.low_confidence.length : (data.low_evidence_confidence_cases ?? 0)) > 0
                ? "warn"
                : undefined
            }
          />
          <MetricCard
            label={t("recaptureRate")}
            value={
              data.recapture_rate != null
                ? `${(data.recapture_rate * 100).toFixed(1)}%`
                : `${(
                    (data.recapture_requests / Math.max(data.total_submissions, 1)) *
                    100
                  ).toFixed(1)}%`
            }
          />
          <MetricCard
            label={t("integrityFlags")}
            href={reviewerCardHref("integrity", bucketIds.integrity)}
            value={claims ? bucketIds.integrity.length : (data.integrity_flags ?? 0)}
            hint={bucketIds.integrity.length === 1 ? t("openCase") : t("openQueue")}
            tone={(claims ? bucketIds.integrity.length : (data.integrity_flags ?? 0)) > 0 ? "danger" : "ok"}
          />
          <MetricCard
            label={t("resolutionRate")}
            value={
              data.evidence_resolution_rate != null
                ? `${(data.evidence_resolution_rate * 100).toFixed(1)}%`
                : `${(
                    (data.verified_assessments / Math.max(data.total_submissions, 1)) *
                    100
                  ).toFixed(1)}%`
            }
            tone="ok"
          />
        </div>
      </section>

      <section
        aria-label="Workload"
        className={clsx(section !== "workload" && "hidden lg:block")}
      >
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          {t("workload")}
        </h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MetricCard label={t("totalSubmissions")} value={data.total_submissions} />
          <MetricCard label={t("submissionsToday")} value={data.submissions_today} />
          <MetricCard label={t("pendingAi")} value={data.pending_ai_processing} tone="warn" />
          <MetricCard
            label={t("pendingReview")}
            href={reviewerCardHref("pending_review", bucketIds.pending_review)}
            value={claims ? bucketIds.pending_review.length : data.pending_human_review}
            hint={bucketIds.pending_review.length === 1 ? t("openCase") : t("openQueue")}
            tone="warn"
          />
        </div>
      </section>

      <section
        aria-label="Outcomes"
        className={clsx(section !== "outcomes" && "hidden lg:block")}
      >
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          {t("outcomes")}
        </h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MetricCard label={t("verified")} value={data.verified_assessments} tone="ok" />
          <MetricCard
            label={t("recaptureRequests")}
            href={reviewerCardHref("needs_recapture", bucketIds.needs_recapture)}
            value={claims ? bucketIds.needs_recapture.length : data.recapture_requests}
            hint={bucketIds.needs_recapture.length === 1 ? t("openCase") : t("openQueue")}
          />
          <MetricCard label={t("highSeverity")} value={data.high_severity_cases} tone="danger" />
          <MetricCard
            label={t("avgProcessing")}
            value={data.average_processing_seconds.toFixed(1)}
          />
        </div>
      </section>

      <section
        aria-label="Context"
        className={clsx(section !== "context" && "hidden lg:block")}
      >
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          {t("contextSection")}
        </h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MetricCard label={t("mostAffectedCrop")} value={data.most_affected_crop || "—"} />
          <MetricCard label={t("mostAffectedDistrict")} value={data.most_affected_district || "—"} />
          <MetricCard
            label={t("lowConfidenceRate")}
            value={`${(data.low_confidence_rate * 100).toFixed(1)}%`}
          />
          <MetricCard
            label={t("failureRate")}
            value={`${(data.submission_failure_rate * 100).toFixed(1)}%`}
          />
        </div>
      </section>

      {/* Peril mix + authenticity */}
      <section
        aria-label="Peril Mix & Authenticity"
        className={clsx("space-y-2", section !== "peril" && "hidden lg:block")}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Peril Mix &amp; Authenticity
          </h3>
          <button
            type="button"
            onClick={handleExportPerilCsv}
            disabled={!claims || claims.length === 0}
            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Export
          </button>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          <div className="fp-panel p-3 sm:p-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Peril distribution</span>
              <span className="font-mono text-[11px] text-slate-500">{perilMix.length} types</span>
            </div>
            {perilMix.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No claims yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {perilMix.map(({ peril, count, avgConfidence, recaptureRate }) => {
                  const total = perilMix.reduce((a, b) => a + b.count, 0);
                  const pct = total ? Math.round((count / total) * 100) : 0;
                  const label = PERIL_OPTIONS.find((p) => p.value === peril)?.en || peril;
                  const confTone =
                    avgConfidence >= 80
                      ? "text-emerald-600"
                      : avgConfidence >= 65
                        ? "text-amber-600"
                        : "text-rose-600";
                  return (
                    <li key={peril}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold capitalize text-slate-700">{label}</span>
                        <span className="flex items-center gap-3 font-mono text-[11px] text-slate-500">
                          <span className={`font-bold ${confTone}`} title="Avg evidence confidence">
                            {avgConfidence.toFixed(1)}%
                          </span>
                          <span title="Recapture rate">
                            recapture {(recaptureRate * 100).toFixed(0)}%
                          </span>
                          <span>{count} · {pct}%</span>
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {perilMix.length > 0 && (
              <p className="mt-2 border-t border-slate-100 pt-1.5 text-[10px] leading-snug text-slate-400">
                Avg evidence confidence (≥80 ok · ≥65 warn · &lt;65 danger) · recapture % = claims needing
                recapture ÷ total in peril · count · share of queue
              </p>
            )}
          </div>
          <div className="fp-panel p-3 sm:p-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Authenticity gate</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${authenticityRejects > 0 ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                {authenticityRejects > 0 ? `${authenticityRejects} rejected` : "all passed"}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              Claims flagged by the Gemini vision gate (wrong crop, AI-generated, too dark, not a field).
              Gate results are cached per SHA-256 for 10 minutes and stored on the claim.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <MetricCard label="Gate rejects" value={authenticityRejects} tone={authenticityRejects > 0 ? "danger" : "ok"} />
              <MetricCard label="Claims scanned" value={(claims || []).length} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
