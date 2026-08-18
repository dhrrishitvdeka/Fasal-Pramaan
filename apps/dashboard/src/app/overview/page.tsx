"use client";

import { useQuery } from "@tanstack/react-query";
import { overviewStats, Overview } from "@/lib/api";
import MetricCard from "@/components/MetricCard";

export default function OverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["overview"],
    queryFn: overviewStats,
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading operational metrics…</p>;
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
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="fp-page-title">Executive overview</h2>
          <p className="fp-page-sub">Crop evidence assessment · operational snapshot</p>
        </div>
        <p className="text-xs text-slate-400">Auto-refreshes every 15 seconds</p>
      </div>

      <section aria-label="Evidence Trust & Integrity">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--ink)]" aria-hidden="true" />
            Evidence Trust & Integrity
          </h3>
          <span className="text-[11px] text-slate-500 font-medium">Independent from AI model probability</span>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <MetricCard
            label="Avg Evidence Confidence"
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
            label="Low Confidence Cases"
            value={
              data.low_evidence_confidence_cases != null
                ? data.low_evidence_confidence_cases
                : Math.round(data.total_submissions * data.low_confidence_rate)
            }
            tone={
              (data.low_evidence_confidence_cases ?? 0) > 0 ? "warn" : undefined
            }
          />
          <MetricCard
            label="Recapture Rate"
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
            label="Integrity Flags"
            value={data.integrity_flags ?? 0}
            tone={(data.integrity_flags ?? 0) > 0 ? "danger" : "ok"}
          />
          <MetricCard
            label="Resolution Rate"
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
          Workload
        </h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MetricCard label="Total submissions" value={data.total_submissions} />
          <MetricCard label="Submissions today" value={data.submissions_today} />
          <MetricCard label="Pending AI" value={data.pending_ai_processing} tone="warn" />
          <MetricCard label="Pending review" value={data.pending_human_review} tone="warn" />
        </div>
      </section>

      <section aria-label="Outcomes">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Outcomes
        </h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MetricCard label="Verified" value={data.verified_assessments} tone="ok" />
          <MetricCard label="Recapture requests" value={data.recapture_requests} />
          <MetricCard label="High severity" value={data.high_severity_cases} tone="danger" />
          <MetricCard
            label="Avg processing (s)"
            value={data.average_processing_seconds.toFixed(1)}
          />
        </div>
      </section>

      <section aria-label="Context">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Context
        </h3>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <MetricCard label="Most affected crop" value={data.most_affected_crop || "—"} />
          <MetricCard label="Most affected district" value={data.most_affected_district || "—"} />
          <MetricCard
            label="Low confidence rate"
            value={`${(data.low_confidence_rate * 100).toFixed(1)}%`}
          />
          <MetricCard
            label="Failure rate"
            value={`${(data.submission_failure_rate * 100).toFixed(1)}%`}
          />
        </div>
      </section>
    </div>
  );
}
