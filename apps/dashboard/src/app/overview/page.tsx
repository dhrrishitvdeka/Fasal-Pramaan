"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listWebClaims, overviewStats } from "@/lib/api";
import MetricCard from "@/components/MetricCard";
import { resolveEvidenceEvaluation } from "@/components/EvidenceConfidenceSection";
import { useLanguage } from "@/lib/LanguageContext";
import {
  caseIdsForBucket,
  reviewerCardHref,
  type ReviewerCardBucket,
} from "@/lib/reviewer-card-routes";

export default function OverviewPage() {
  const { t } = useLanguage();
  const { data, isLoading, error } = useQuery({
    queryKey: ["overview"],
    queryFn: overviewStats,
    refetchInterval: 15_000,
  });
  const { data: claims } = useQuery({
    queryKey: ["review-queue"],
    queryFn: listWebClaims,
    refetchInterval: 15_000,
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

  if (isLoading) {
    return <p className="text-sm text-slate-500">{t("loadingMetrics")}</p>;
  }
  if (error || !data) {
    return (
      <div className="border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800" role="alert">
        Unable to load overview. Confirm reviewer access and that the API is available.
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

      <section aria-label="Evidence Trust & Integrity">
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

      <section aria-label="Workload">
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

      <section aria-label="Outcomes">
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

      <section aria-label="Context">
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
    </div>
  );
}
