"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listWebClaims, overviewStats, type Submission } from "@/lib/api";
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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  ShieldCheck,
  Download,
  Activity,
  Layers,
  Sparkles,
  PieChart as PieIcon,
  Sprout,
  AlertCircle,
} from "lucide-react";

const OVERVIEW_SECTION_IDS = ["all", "kpis", "analytics", "evidence", "peril"] as const;
type OverviewSectionId = (typeof OVERVIEW_SECTION_IDS)[number];

function parseOverviewSection(raw: string): OverviewSectionId {
  return (OVERVIEW_SECTION_IDS as readonly string[]).includes(raw as OverviewSectionId)
    ? (raw as OverviewSectionId)
    : "all";
}

const CROP_COLOR_PALETTE: Record<string, string> = {
  Wheat: "#0f766e",
  Paddy: "#059669",
  Mustard: "#d97706",
  Maize: "#ca8a04",
  Potato: "#92400e",
  Cotton: "#475569",
  Sugarcane: "#15803d",
  Other: "#334155",
};

export default function OverviewPage() {
  const { t } = useLanguage();
  const gate = useRequireRole(["reviewer", "administrator"]);
  const [section, setSection] = useState<OverviewSectionId>("all");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const readHash = () => setSection(parseOverviewSection(window.location.hash.replace("#", "")));
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  const switchSection = (id: OverviewSectionId) => {
    window.history.replaceState(null, "", id === "all" ? " " : `#${id}`);
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
    const items = (claims || []).map((submission: Submission) => ({
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

  // Peril mix analysis
  const perilMix = useMemo<PerilAnalytics[]>(() => {
    const remote = data?.analytics_by_peril;
    if (remote && remote.length) return [...remote].sort((a, b) => b.count - a.count);
    const grouped = new Map<string, { count: number; confSum: number; recaptures: number }>();
    for (const s of claims || []) {
      const p = String(s.peril || "normal");
      const entry = grouped.get(p) || { count: 0, confSum: 0, recaptures: 0 };
      const conf = resolveEvidenceEvaluation(s)?.confidence?.final ?? 0;
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

  // Submissions by Crop analytics
  const cropAnalytics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of claims || []) {
      const crop = c.crop_type || "Unknown";
      const formatted = crop.charAt(0).toUpperCase() + crop.slice(1);
      counts.set(formatted, (counts.get(formatted) || 0) + 1);
    }
    const list = Array.from(counts.entries())
      .map(([crop_name, count]) => ({
        crop_name,
        count,
        color: CROP_COLOR_PALETTE[crop_name] || CROP_COLOR_PALETTE.Other,
      }))
      .sort((a, b) => b.count - a.count);
    return list;
  }, [claims]);

  // Severity distribution analytics
  const severityAnalytics = useMemo(() => {
    const counts = {
      Low: 0,
      Medium: 0,
      High: 0,
      Critical: 0,
    };
    let unassessed = 0;
    for (const c of claims || []) {
      const sev = String(c.severity || c.final_severity || "").toLowerCase();
      if (sev.includes("low")) counts.Low += 1;
      else if (sev.includes("med")) counts.Medium += 1;
      else if (sev.includes("crit")) counts.Critical += 1;
      else if (sev.includes("high")) counts.High += 1;
      else unassessed += 1;
    }
    const totalCount = (claims || []).length;
    const list = [
      { severity: "Low", count: counts.Low, color: "#10b981", pct: totalCount ? Math.round((counts.Low / totalCount) * 100) : 0 },
      { severity: "Medium", count: counts.Medium, color: "#f59e0b", pct: totalCount ? Math.round((counts.Medium / totalCount) * 100) : 0 },
      { severity: "High", count: counts.High, color: "#f97316", pct: totalCount ? Math.round((counts.High / totalCount) * 100) : 0 },
      { severity: "Critical", count: counts.Critical, color: "#ef4444", pct: totalCount ? Math.round((counts.Critical / totalCount) * 100) : 0 },
    ];
    if (unassessed > 0) {
      list.push({ severity: "Unassessed", count: unassessed, color: "#94a3b8", pct: totalCount ? Math.round((unassessed / totalCount) * 100) : 0 });
    }
    return list;
  }, [claims]);

  // Evidence confidence tier distribution (3-tier health)
  const confidenceTiers = useMemo(() => {
    let high = 0; // >= 80%
    let medium = 0; // 65 - 79%
    let low = 0; // < 65%
    for (const c of claims || []) {
      const conf = resolveEvidenceEvaluation(c)?.confidence?.final ?? 0;
      if (conf >= 80) high += 1;
      else if (conf >= 65) medium += 1;
      else low += 1;
    }
    const total = (claims || []).length || 1;
    return {
      high: { count: high, pct: (claims || []).length ? Math.round((high / total) * 100) : 0 },
      medium: { count: medium, pct: (claims || []).length ? Math.round((medium / total) * 100) : 0 },
      low: { count: low, pct: (claims || []).length ? Math.round((low / total) * 100) : 0 },
      total: (claims || []).length,
    };
  }, [claims]);

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
      crop: s.crop_type || "unspecified",
      overall_confidence: resolveEvidenceEvaluation(s)?.confidence?.final ?? 0,
      gate_failed:
        (s.gate_result as { gateFailed?: boolean } | null | undefined)?.gateFailed ? "yes" : "no",
      status: s.status,
      created_at: s.createdAt || s.latest_evaluation?.created_at || "",
    }));
    downloadCsv(`fasal-pramaan-analytics-${csvTimestamp()}.csv`, toCsv(rows));
  };

  if (gate.status !== "ok") return <AccessGate status={gate.status} />;
  if (isLoading) return <DashboardLoading />;

  if (error || !data) {
    return (
      <div className="py-8">
        <ErrorMessage
          title="Something went wrong loading overview metrics"
          message={error instanceof Error ? error.message : "Unable to retrieve operational metrics. Please confirm reviewer credentials and API availability."}
          onRetry={() => {
            if (typeof window !== "undefined") {
              window.location.reload();
            } else {
              void refetch();
            }
          }}
          actionHref="/review"
          actionLabel="Go to Review Queue"
        />
      </div>
    );
  }

  const showKpis = section === "all" || section === "kpis";
  const showAnalytics = section === "all" || section === "analytics";
  const showEvidence = section === "all" || section === "evidence";
  const showPeril = section === "all" || section === "peril";

  return (
    <div className="space-y-6 pb-10">
      {/* Header Bar */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="fp-page-title text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {t("executiveOverview")} &amp; {t("analytics")}
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <p className="fp-page-sub text-xs text-slate-500 mt-0.5">
            Real-time evidence confidence, operational workload, and agricultural risk distribution
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPerilCsv}
            disabled={!claims || claims.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-2xs"
            title="Download CSV report of all claims and analytics"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <span className="hidden text-xs text-slate-400 sm:inline">Auto-refreshes every 15s</span>
        </div>
      </div>

      {/* Filter Chips / View Switcher */}
      <div
        className="fp-chip-row border-b border-slate-200 pb-2 text-xs"
        role="tablist"
        aria-label="Overview & Analytics tabs"
      >
        {[
          { id: "all" as const, label: "All Telemetry & Charts", icon: Layers },
          { id: "kpis" as const, label: "Core KPIs", icon: Activity },
          { id: "analytics" as const, label: "Visual Analytics", icon: BarChart3 },
          { id: "evidence" as const, label: "Evidence Health", icon: ShieldCheck },
          { id: "peril" as const, label: "Peril & Authenticity", icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => switchSection(tab.id)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-slate-900 text-white shadow-xs font-semibold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900",
              )}
            >
              <Icon className="h-3.5 w-3.5 opacity-80" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION 1: Core KPIs (Retained 8 green-dot metrics) */}
      {showKpis && (
        <section aria-label="Core Performance Indicators" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--ink)]" aria-hidden="true" />
              {t("evidenceTrustHeading")} &amp; {t("workload")}
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              {claims ? claims.length : data.total_submissions} active cases
            </span>
          </div>

          {/* Row 1: Primary Operational Pulse */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label={t("totalSubmissions")}
              value={data.total_submissions}
              hint="All incoming claims"
            />
            <MetricCard
              label={t("pendingReview")}
              href={reviewerCardHref("pending_review", bucketIds?.pending_review || [])}
              value={claims ? (bucketIds?.pending_review?.length ?? 0) : data.pending_human_review}
              hint={(bucketIds?.pending_review?.length ?? 0) === 1 ? t("openCase") : t("openQueue")}
              tone={
                (claims ? (bucketIds?.pending_review?.length ?? 0) : data.pending_human_review) > 0
                  ? "warn"
                  : undefined
              }
            />
            <MetricCard
              label={t("avgEvidenceConfidence")}
              value={
                data.average_evidence_confidence != null
                  ? `${data.average_evidence_confidence.toFixed(1)}%`
                  : "—"
              }
              hint="Ground truth score"
              tone={
                (data.average_evidence_confidence ?? 0) >= 80
                  ? "ok"
                  : (data.average_evidence_confidence ?? 0) >= 65
                  ? "warn"
                  : "danger"
              }
            />
            <MetricCard
              label={t("verified")}
              value={data.verified_assessments}
              hint="Verified for payout"
              tone="ok"
            />
          </div>

          {/* Row 2: Secondary Diagnostic Strip */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label={t("lowConfidenceCases")}
              href={reviewerCardHref("low_confidence", bucketIds?.low_confidence || [])}
              value={claims ? (bucketIds?.low_confidence?.length ?? 0) : (data.low_evidence_confidence_cases ?? 0)}
              hint={(bucketIds?.low_confidence?.length ?? 0) === 1 ? t("openCase") : t("openQueue")}
              tone={
                (claims ? (bucketIds?.low_confidence?.length ?? 0) : (data.low_evidence_confidence_cases ?? 0)) > 0
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
              hint="Uncertainty resolution"
            />
            <MetricCard
              label={t("highSeverity")}
              value={data.high_severity_cases}
              hint="High damage claims"
              tone="danger"
            />
            <MetricCard
              label={t("mostAffectedCrop")}
              value={data.most_affected_crop || "—"}
              hint="Dominant crop risk"
            />
          </div>
        </section>
      )}

      {/* SECTION 2: Visual Analytics & Graphs */}
      {showAnalytics && (
        <section id="analytics" aria-label="Visual Analytics" className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              <BarChart3 className="h-4 w-4 text-slate-600" />
              Visual Analytics &amp; Distribution Intelligence
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              Aggregate distributions
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Chart 1: Submissions by Crop */}
            <div className="fp-panel p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Sprout className="h-3.5 w-3.5 text-emerald-600" />
                    Submissions by Crop
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Active portfolio breakdown by harvested genus
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-slate-500">
                  {cropAnalytics.length} crops
                </span>
              </div>

              {mounted ? (
                cropAnalytics.length === 0 ? (
                  <div className="flex h-64 flex-col items-center justify-center text-xs text-slate-400">
                    <Sprout className="h-8 w-8 mb-2 opacity-40 text-slate-400" />
                    <span>No crop submissions recorded yet</span>
                  </div>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={cropAnalytics} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="crop_name"
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          axisLine={{ stroke: "#e2e8f0" }}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 10, fill: "#64748b" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0];
                            return (
                              <div className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white shadow-xl font-mono">
                                <span className="font-bold text-slate-200">{item.payload.crop_name}</span>
                                <div className="text-emerald-400 mt-0.5 font-semibold">
                                  {item.value} submissions
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {cropAnalytics.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )
              ) : (
                <div className="h-64 w-full bg-slate-50 animate-pulse rounded-lg" />
              )}
            </div>

            {/* Chart 2: Damage Severity Breakdown (Donut Chart) */}
            <div className="fp-panel p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <PieIcon className="h-3.5 w-3.5 text-amber-600" />
                    Damage Severity Distribution
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    AI triage severity grading breakdown
                  </p>
                </div>
                <span className="font-mono text-xs font-semibold text-slate-500">
                  {claims ? claims.length : data.total_submissions} evaluated
                </span>
              </div>

              {mounted ? (
                (claims || []).length === 0 ? (
                  <div className="flex h-64 flex-col items-center justify-center text-xs text-slate-400">
                    <AlertCircle className="h-8 w-8 mb-2 opacity-40 text-slate-400" />
                    <span>No claims available for severity grading</span>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 h-64">
                    <div className="relative h-56 w-56 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={severityAnalytics}
                            dataKey="count"
                            nameKey="severity"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={3}
                          >
                            {severityAnalytics.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const item = payload[0];
                              return (
                                <div className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white shadow-xl font-mono">
                                  <span className="font-bold text-slate-200">{item.name} Severity</span>
                                  <div className="text-amber-400 mt-0.5 font-semibold">
                                    {item.value} claims ({item.payload.pct}%)
                                  </div>
                                </div>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Center Stat */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-xl font-extrabold font-mono text-slate-900">
                          {claims?.length || 0}
                        </span>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                          Total Cases
                        </span>
                      </div>
                    </div>

                    {/* Donut Legend */}
                    <div className="flex-1 w-full space-y-2 pr-2">
                      {severityAnalytics.map((item) => (
                        <div
                          key={item.severity}
                          className="flex items-center justify-between text-xs font-mono p-1.5 rounded-lg bg-slate-50/80 border border-slate-100"
                        >
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <span className="font-semibold text-slate-700">{item.severity}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-500">
                            <span className="font-bold text-slate-900">{item.count}</span>
                            <span className="text-[10px] text-slate-400 w-8 text-right">({item.pct}%)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <div className="h-64 w-full bg-slate-50 animate-pulse rounded-lg" />
              )}
            </div>
          </div>
        </section>
      )}

      {/* SECTION 3: Evidence Trust & AI Authenticity Health */}
      {showEvidence && (
        <section aria-label="Evidence Quality & Authenticity" className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Evidence Confidence &amp; Vision Gate Telemetry
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              Independent ground-truth signals
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Confidence Spectrum Tier Bar */}
            <div className="fp-panel p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Confidence Tier Spectrum
                </span>
                <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Avg {data.average_evidence_confidence != null ? `${data.average_evidence_confidence.toFixed(1)}%` : "—"}
                </span>
              </div>

              {/* Multi-tier progress bar */}
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 flex">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${confidenceTiers.high.pct}%` }}
                  title={`High (≥80%): ${confidenceTiers.high.count} (${confidenceTiers.high.pct}%)`}
                />
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${confidenceTiers.medium.pct}%` }}
                  title={`Moderate (65-79%): ${confidenceTiers.medium.count} (${confidenceTiers.medium.pct}%)`}
                />
                <div
                  className="h-full bg-rose-500 transition-all duration-300"
                  style={{ width: `${confidenceTiers.low.pct}%` }}
                  title={`Low (<65%): ${confidenceTiers.low.count} (${confidenceTiers.low.pct}%)`}
                />
              </div>

              {/* 3 Tier breakdown cards */}
              <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-center">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
                  <div className="text-[10px] uppercase font-semibold text-emerald-800">High (≥80%)</div>
                  <div className="text-base font-bold text-emerald-900 mt-0.5">{confidenceTiers.high.count}</div>
                  <div className="text-[10px] text-emerald-700">{confidenceTiers.high.pct}% of total</div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2">
                  <div className="text-[10px] uppercase font-semibold text-amber-800">Review (65-79%)</div>
                  <div className="text-base font-bold text-amber-900 mt-0.5">{confidenceTiers.medium.count}</div>
                  <div className="text-[10px] text-amber-700">{confidenceTiers.medium.pct}% of total</div>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-2">
                  <div className="text-[10px] uppercase font-semibold text-rose-800">Alert (&lt;65%)</div>
                  <div className="text-base font-bold text-rose-900 mt-0.5">{confidenceTiers.low.count}</div>
                  <div className="text-[10px] text-rose-700">{confidenceTiers.low.pct}% of total</div>
                </div>
              </div>
            </div>

            {/* Authenticity Vision Gate & Quality Audit */}
            <div className="fp-panel p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  AI Authenticity Gate
                </span>
                <span
                  className={clsx(
                    "rounded px-2 py-0.5 text-[10px] font-bold uppercase font-mono",
                    authenticityRejects > 0
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200",
                  )}
                >
                  {authenticityRejects > 0 ? `${authenticityRejects} Rejections` : "100% Passed"}
                </span>
              </div>

              <p className="text-xs leading-relaxed text-slate-600">
                Incoming images undergo zero-trust validation: AI synthetic artifacts, non-field anomalies,
                lighting compliance, and SHA-256 integrity tamper checks.
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="text-[10px] uppercase font-semibold text-slate-500">Claims Scanned</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">{(claims || []).length}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="text-[10px] uppercase font-semibold text-slate-500">Gate Rejects</div>
                  <div
                    className={clsx(
                      "text-lg font-bold mt-0.5",
                      authenticityRejects > 0 ? "text-rose-700" : "text-emerald-700",
                    )}
                  >
                    {authenticityRejects}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 4: Peril Mix Intelligence & Export */}
      {showPeril && (
        <section aria-label="Peril Mix & Intelligence" className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600">
              <Layers className="h-4 w-4 text-slate-600" />
              Peril Mix &amp; Protocol Intelligence
            </h3>
            <span className="font-mono text-[11px] text-slate-500">{perilMix.length} protocols active</span>
          </div>

          <div className="fp-panel p-4 rounded-xl border border-slate-200 bg-white shadow-2xs">
            {perilMix.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No claim evidence registered yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {perilMix.map(({ peril, count, avgConfidence, recaptureRate }) => {
                  const total = perilMix.reduce((a, b) => a + b.count, 0);
                  const pct = total ? Math.round((count / total) * 100) : 0;
                  const label = PERIL_OPTIONS.find((p) => p.value === peril)?.en || peril;
                  const confTone =
                    avgConfidence >= 80
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                      : avgConfidence >= 65
                      ? "text-amber-700 bg-amber-50 border-amber-200"
                      : "text-rose-700 bg-rose-50 border-rose-200";

                  return (
                    <li key={peril} className="rounded-lg border border-slate-100 p-2.5 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold capitalize text-slate-800">{label}</span>
                          <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                            {count} {count === 1 ? "claim" : "claims"} ({pct}%)
                          </span>
                        </div>

                        <div className="flex items-center gap-3 font-mono text-[11px]">
                          <span className={clsx("rounded px-2 py-0.5 font-bold border", confTone)}>
                            {avgConfidence.toFixed(1)}% confidence
                          </span>
                          <span className="text-slate-500">
                            Recapture: <strong>{(recaptureRate * 100).toFixed(0)}%</strong>
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                        <div
                          className="h-full rounded-full bg-[var(--ink)] transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
