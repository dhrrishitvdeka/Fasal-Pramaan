"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { applyWebReviewAction, listWebClaims, Submission } from "@/lib/api";
import { useRequireRole } from "@/lib/use-require-role";
import AccessGate from "@/components/AccessGate";
import ModalShell from "@/components/ModalShell";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveEvidenceEvaluation } from "@/components/EvidenceConfidenceSection";
import { useLanguage } from "@/lib/LanguageContext";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  parseReviewerFilter,
  submissionMatchesBucket,
  type ReviewerQueueFilter,
} from "@/lib/reviewer-card-routes";
import { PERIL_OPTIONS } from "@/lib/claim-routing";
import { TableSkeleton } from "@/components/LoadingAnimation";
import ErrorMessage from "@/components/ErrorMessage";
import { Search, Download } from "lucide-react";
import { isCropMatch } from "@/lib/crop-synonyms";

type QueueSort = "newest" | "evidence_asc" | "evidence_desc" | "model_desc";

const QUEUE_SORTS: readonly QueueSort[] = ["newest", "evidence_asc", "evidence_desc", "model_desc"];
const MAX_BULK_SELECT = 25;
const BULK_GAP_MS = 300;

function parseQueueSort(raw: string | null | undefined): QueueSort {
  return QUEUE_SORTS.includes(raw as QueueSort) ? (raw as QueueSort) : "newest";
}

function adaptiveBadge(s: Submission) {
  const a = s.adaptive_result as { level?: string; nextStep?: string; threshold?: number } | null | undefined;
  if (!a?.level) return null;
  const cls =
    a.level === "high"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : a.level === "medium"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-rose-50 text-rose-700 border-rose-200";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase border ${cls}`}>
      {String(a.level)} · {String(a.nextStep || "").replaceAll("_", " ")}
    </span>
  );
}

function ReviewQueuePage() {
  const { t } = useLanguage();
  const gate = useRequireRole(["reviewer", "administrator"]);
  const router = useRouter();
  const qc = useQueryClient();
  const searchParams = useSearchParams();

  // Filter lives in the URL already; sort / peril / search persist there too
  // so a refresh (or shared link) restores the exact working context.
  const filterTab = parseReviewerFilter(searchParams.get("filter"));
  const searchQuery = searchParams.get("q") ?? "";
  const sortBy = parseQueueSort(searchParams.get("sort"));
  const perilFilter = searchParams.get("peril") ?? "all";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `/review?${qs}` : "/review", { scroll: false });
  };

  const queueTabHref = (filter: ReviewerQueueFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === "all") params.delete("filter");
    else params.set("filter", filter);
    const qs = params.toString();
    return qs ? `/review?${qs}` : "/review";
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () => ({ items: await listWebClaims() }),
    enabled: gate.status === "ok",
  });

  const rawItems = useMemo(() => data?.items || [], [data?.items]);

  // Augment items with resolved evidence evaluation for robust filtering & display
  const augmentedItems = useMemo(() => {
    return rawItems.map((s) => {
      const evaluation = resolveEvidenceEvaluation(s);
      return {
        submission: s,
        evaluation,
      };
    });
  }, [rawItems]);

  const filteredItems = useMemo(() => {
    let list = [...augmentedItems];

    if (filterTab !== "all") {
      list = list.filter((item) => submissionMatchesBucket(item.submission, item.evaluation, filterTab));
    }

    if (perilFilter !== "all") {
      list = list.filter((item) => String(item.submission.peril || "normal") === perilFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.submission.id.toLowerCase().includes(q) ||
          item.submission.crop_cycle_id.toLowerCase().includes(q) ||
          (item.submission.plot_name || "").toLowerCase().includes(q) ||
          (item.submission.crop_type || "").toLowerCase().includes(q) ||
          isCropMatch(q, item.submission.crop_type) ||
          isCropMatch(q, item.submission.latest_prediction?.predicted_crop) ||
          (item.submission.latest_prediction?.predicted_crop || "").toLowerCase().includes(q) ||
          item.submission.severity?.toLowerCase().includes(q) ||
          item.submission.latest_prediction?.primary_damage?.toLowerCase().includes(q) ||
          item.submission.peril?.toLowerCase().includes(q) ||
          item.evaluation.uncertainty.type?.toLowerCase().includes(q),
      );
    }

    if (sortBy === "newest") {
      list.sort((a, b) =>
        String(b.submission.createdAt || "").localeCompare(String(a.submission.createdAt || "")),
      );
    } else if (sortBy === "evidence_asc") {
      list.sort((a, b) => a.evaluation.confidence.final - b.evaluation.confidence.final);
    } else if (sortBy === "evidence_desc") {
      list.sort((a, b) => b.evaluation.confidence.final - a.evaluation.confidence.final);
    } else if (sortBy === "model_desc") {
      list.sort(
        (a, b) =>
          (b.submission.latest_prediction?.overall_confidence || 0) -
          (a.submission.latest_prediction?.overall_confidence || 0),
      );
    }

    return list;
  }, [augmentedItems, filterTab, searchQuery, sortBy, perilFilter]);

  // Counts for tabs
  const tabCounts = useMemo(() => {
    const count = (filter: ReviewerQueueFilter) =>
      augmentedItems.filter((item) => submissionMatchesBucket(item.submission, item.evaluation, filter)).length;
    return {
      all: augmentedItems.length,
      low_confidence: count("low_confidence"),
      needs_recapture: count("needs_recapture"),
      pending_review: count("pending_review"),
      integrity: count("integrity"),
      coverage: count("coverage"),
      visual: count("visual"),
      context: count("context"),
      verified: count("verified"),
      rejected: count("rejected"),
      physical_inspection: count("physical_inspection"),
    };
  }, [augmentedItems]);

  const handleExportCsv = () => {
    const rows = filteredItems.map(({ submission: s, evaluation: ev }) => ({
      id: s.id,
      status: s.status,
      peril: s.peril || "normal",
      evidence_confidence: ev.confidence.final,
      uncertainty_type: ev.uncertainty.type || "",
      integrity_score: ev.integrity.score,
      model_confidence: s.latest_prediction?.overall_confidence ?? "",
      created_at: s.createdAt || "",
      recommended_action: ev.uncertainty.recommended_action || "",
      adaptive_level:
        (s as unknown as { adaptive_result?: { level?: string } }).adaptive_result?.level ?? "",
    }));
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    downloadCsv(
      `fasal-pramaan-review-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
        d.getHours(),
      )}${pad(d.getMinutes())}.csv`,
      toCsv(rows),
    );
  };

  // Bulk selection (desktop table only)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulk, setBulk] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  function canQueueAccept(s: Submission, ev: { integrity: { score: number } }) {
    if (s.status === "verified" || s.status === "rejected") return false;
    if (ev.integrity.score < 50) return false;
    const g = s.gate_result as { gateFailed?: boolean; overridden?: boolean } | null | undefined;
    if (g?.gateFailed && !g.overridden) return false;
    return true;
  }

  const selectableIds = useMemo(
    () =>
      filteredItems
        .filter(({ submission: s, evaluation: ev }) => canQueueAccept(s, ev))
        .map((item) => item.submission.id),
    [filteredItems],
  );
  const allVisibleSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));

  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_BULK_SELECT) return prev;
      return [...prev, id];
    });

  const toggleAllRows = () =>
    setSelectedIds(allVisibleSelected ? [] : selectableIds.slice(0, MAX_BULK_SELECT));

  const runBulkAccept = async () => {
    if (bulk || selectedIds.length === 0) return;
    const ids = [...selectedIds];
    setConfirmOpen(false);
    setBulkResult(null);
    setBulk({ done: 0, total: ids.length, failed: 0 });
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await applyWebReviewAction(ids[i], {
          action: "accept",
          notes: "Bulk accept from review queue",
        });
      } catch {
        failed += 1;
      }
      setBulk({ done: i + 1, total: ids.length, failed });
      if (i < ids.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, BULK_GAP_MS));
      }
    }
    setSelectedIds([]);
    setBulk(null);
    // Same corrected set as the review-detail action onSuccess (B3): prefix keys
    // that match real queries — phantom "reviewer-stats"/"claims" removed.
    void qc.invalidateQueries({ queryKey: ["review-queue"] });
    void qc.invalidateQueries({ queryKey: ["overview"] });
    void qc.invalidateQueries({ queryKey: ["map"] });
    void qc.invalidateQueries({ queryKey: ["audit"] });
    void qc.invalidateQueries({ queryKey: ["damage-cat"] });
    void qc.invalidateQueries({ queryKey: ["severity"] });
    void qc.invalidateQueries({ queryKey: ["by-crop"] });
    setBulkResult(
      failed === 0
        ? `Accepted ${ids.length} case${ids.length === 1 ? "" : "s"}.`
        : `Accepted ${ids.length - failed} of ${ids.length}; ${failed} failed (cases with blocked integrity cannot be accepted).`,
    );
  };

  if (gate.status !== "ok") return <AccessGate status={gate.status} />;

  const bulkBusy = bulk !== null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="fp-page-title">{t("reviewQueueTitle")}</h2>
          <p className="fp-page-sub">{t("reviewQueueSub")}</p>
        </div>
      </div>

      {bulkResult && (
        <div className="border border-slate-400 bg-slate-50 px-3 py-2 text-sm text-slate-800" role="status">
          {bulkResult}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 text-xs">
        {[
          { id: "all" as const, label: "All Cases", count: tabCounts.all },
          { id: "pending_review" as const, label: t("pendingReview"), count: tabCounts.pending_review, tone: "amber" },
          { id: "low_confidence" as const, label: t("lowConfidenceCases"), count: tabCounts.low_confidence, tone: "amber" },
          { id: "needs_recapture" as const, label: t("recapture"), count: tabCounts.needs_recapture, tone: "blue" },
          { id: "integrity" as const, label: t("integrityFlags"), count: tabCounts.integrity, tone: "rose" },
        ].map((tab) => (
          <Link
            key={tab.id}
            href={queueTabHref(tab.id)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors ${
              filterTab === tab.id
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                filterTab === tab.id
                  ? "bg-slate-700 text-slate-100"
                  : tab.tone === "rose" && tab.count > 0
                  ? "bg-rose-100 text-rose-800 font-bold"
                  : tab.tone === "amber" && tab.count > 0
                  ? "bg-amber-100 text-amber-800 font-bold"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {tab.count}
            </span>
          </Link>
        ))}
      </div>

      {/* Search & Sort Row */}
      <div className="flex flex-col gap-3 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search by ID, plot, crop, peril…"
            value={searchQuery}
            onChange={(e) => setParam("q", e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 shadow-2xs focus:border-slate-800 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:w-auto">
          <div className="flex items-center gap-1.5">
            <label htmlFor="peril-filter" className="shrink-0 font-medium text-slate-500">
              Peril:
            </label>
            <select
              id="peril-filter"
              value={perilFilter}
              onChange={(e) => setParam("peril", e.target.value === "all" ? "" : e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none w-auto sm:w-36"
            >
              <option value="all">All perils</option>
              {PERIL_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.en}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label htmlFor="sort-filter" className="shrink-0 font-medium text-slate-500">
              Sort by:
            </label>
            <select
              id="sort-filter"
              value={sortBy}
              onChange={(e) => setParam("sort", e.target.value === "newest" ? "" : e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs focus:border-slate-800 focus:outline-none w-auto sm:w-52"
            >
              <option value="newest">Newest First</option>
              <option value="evidence_asc">Evidence Confidence (Lowest First)</option>
              <option value="evidence_desc">Evidence Confidence (Highest First)</option>
              <option value="model_desc">Model Confidence (Highest First)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredItems.length === 0}
            title="Export filtered cases to CSV"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-2xs"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {error && (
        <ErrorMessage
          title="Something went wrong loading the review queue"
          message={error instanceof Error ? error.message : "Unable to retrieve claims for review. Please verify reviewer credentials."}
          onRetry={() => {
            if (typeof window !== "undefined") window.location.reload();
            else void refetch();
          }}
          className="my-4"
        />
      )}

      {isLoading && <TableSkeleton rows={8} cols={7} className="mt-4" />}

      {!isLoading && !error && (
        <p className="text-xs font-medium text-slate-500" data-testid="queue-result-count">
          Showing {filteredItems.length} of {augmentedItems.length} cases
        </p>
      )}

      <div className="space-y-2 md:hidden">
        {filteredItems.map(({ submission: s, evaluation: ev }) => {
          const finalConf = ev.confidence.final;
          return (
            <Link
              key={s.id}
              href={`/review/${s.id}`}
              className="fp-panel block p-3 transition-colors hover:border-[var(--ink)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-slate-800">{s.id.slice(0, 8)}…</div>
                  <div className="mt-0.5 truncate text-xs capitalize text-slate-600">
                    {s.plot_name || s.crop_type || s.crop_cycle_id} · {s.status.replaceAll("_", " ")}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="fp-badge-neutral">{finalConf}%</span>
                  <span className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-600">
                    {s.peril || "normal"}
                  </span>
                  {adaptiveBadge(s)}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] capitalize text-slate-600">
                <span>{s.severity || s.latest_prediction?.severity || "—"}</span>
                <span>·</span>
                <span>{ev.uncertainty.type || "no uncertainty"}</span>
                {ev.integrity.score < 70 ? <span className="fp-badge-alert">Integrity</span> : null}
              </div>
            </Link>
          );
        })}
        {!isLoading && filteredItems.length === 0 && (
          <div className="fp-panel px-3 py-8 text-center text-sm text-slate-500">
            No cases found matching the selected filter criteria.
          </div>
        )}
      </div>

      <div className="fp-panel hidden overflow-x-auto shadow-sm md:block">
        <table className="fp-table min-w-[68rem] text-xs">
          <thead>
            <tr>
              <th className="w-9">
                <input
                  type="checkbox"
                  aria-label="Select all shown cases (max 25)"
                  title="Select all shown cases (max 25)"
                  checked={allVisibleSelected}
                  onChange={toggleAllRows}
                  disabled={bulkBusy || selectableIds.length === 0}
                  className="h-3.5 w-3.5 rounded border-[var(--line)] align-middle"
                />
              </th>
              <th>Reference</th>
              <th>Plot / crop</th>
              <th>Status</th>
              <th>Severity</th>
              <th>AI Damage</th>
              <th>Evidence Conf.</th>
              <th>Uncertainty</th>
              <th>Recommended Action</th>
              <th>Integrity</th>
              <th>Model Conf.</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(({ submission: s, evaluation: ev }) => {
              const finalConf = ev.confidence.final;
              const isLowConf = finalConf < 85;
              const integrityScore = ev.integrity.score;
              const isIntegrityIssue = integrityScore < 70;
              const isSelected = selectedIds.includes(s.id);

              return (
                <tr key={s.id} className={`transition-colors ${isSelected ? "bg-[var(--accent-soft)]" : "hover:bg-slate-50"}`}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select case ${s.id.slice(0, 8)}`}
                      checked={isSelected}
                      onChange={() => toggleRow(s.id)}
                      disabled={
                        bulkBusy ||
                        !canQueueAccept(s, ev) ||
                        (!isSelected && selectedIds.length >= MAX_BULK_SELECT)
                      }
                      className="h-3.5 w-3.5 rounded border-[var(--line)] align-middle"
                    />
                  </td>
                  <td className="font-mono text-[11px] font-semibold text-slate-700">
                    {s.id.slice(0, 8)}…
                  </td>
                  <td className="max-w-[10rem]">
                    <div className="truncate font-medium text-slate-800">{s.plot_name || s.crop_cycle_id || "—"}</div>
                    <div className="truncate capitalize text-[10px] text-slate-500">{s.crop_type || "—"}</div>
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <span className="fp-badge-neutral uppercase text-[10px]">{s.status}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] uppercase text-slate-600 w-fit">{s.peril || "normal"}</span>
                      {adaptiveBadge(s)}
                    </div>
                  </td>
                  <td className="capitalize">{s.severity || s.latest_prediction?.severity || "—"}</td>
                  <td className="capitalize">{s.latest_prediction?.primary_damage?.replaceAll("_", " ") || "—"}</td>

                  <td className="tabular-nums font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900">{finalConf}%</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold border ${
                          isLowConf
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "fp-badge-ok"
                        }`}
                      >
                        {isLowConf ? "SUB-85" : "OK"}
                      </span>
                    </div>
                  </td>

                  <td>
                    <div className="flex items-center gap-1">
                      <span className="capitalize font-semibold text-slate-800">
                        {ev.uncertainty.type || "None"}
                      </span>
                      {ev.uncertainty.severity && ev.uncertainty.severity !== "low" && (
                        <span className="rounded bg-rose-50 px-1 text-[9px] font-bold text-rose-700 border border-rose-200 uppercase">
                          {ev.uncertainty.severity}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="text-slate-700 capitalize max-w-[160px] truncate">
                    {ev.uncertainty.recommended_action
                      ? ev.uncertainty.recommended_action.replaceAll("_", " ")
                      : "Normal Review"}
                  </td>

                  <td>
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                        isIntegrityIssue
                          ? "bg-rose-50 text-rose-800 border-rose-200"
                          : "fp-badge-ok"
                      }`}
                    >
                      <span>{isIntegrityIssue ? "⚠️ Flagged" : "✓ Passed"}</span>
                    </span>
                  </td>

                  <td className="tabular-nums text-slate-600 font-mono text-[11px]">
                    {s.latest_prediction?.overall_confidence != null
                      ? `${(s.latest_prediction.overall_confidence * 100).toFixed(0)}%`
                      : "—"}
                  </td>

                  <td className="text-right">
                    <Link
                      href={`/review/${s.id}`}
                      className="rounded bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold px-2.5 py-1 inline-block border border-slate-300"
                    >
                      Review →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!isLoading && filteredItems.length === 0 && (
              <tr>
                <td colSpan={12} className="py-12 text-center text-slate-500">
                  No cases found matching the selected filter criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(selectedIds.length > 0 || bulk) && (
        <div
          className="sticky bottom-0 z-30 border border-[var(--line)] bg-[var(--surface)] px-3 py-2 shadow-md"
          role={bulk ? "status" : undefined}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
            <span className="font-semibold text-slate-900">
              {bulk
                ? `Accepting ${bulk.done}/${bulk.total}…`
                : `${selectedIds.length} selected (max ${MAX_BULK_SELECT})`}
            </span>
            {bulk && bulk.failed > 0 && (
              <span className="font-semibold text-rose-700">{bulk.failed} failed</span>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className="rounded border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 font-semibold text-[var(--surface)] hover:bg-[var(--accent)] disabled:opacity-45"
                disabled={bulkBusy || confirmOpen}
                onClick={() => setConfirmOpen(true)}
              >
                Accept selected
              </button>
              <button
                type="button"
                className="fp-btn-secondary px-3 py-1.5 text-xs"
                disabled={bulkBusy}
                onClick={() => setSelectedIds([])}
              >
                Clear
              </button>
            </div>
          </div>
          {bulk && (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[var(--ink)] transition-all duration-300"
                style={{ width: `${bulk.total ? Math.round((bulk.done / bulk.total) * 100) : 0}%` }}
              />
            </div>
          )}
        </div>
      )}

      {confirmOpen && (
        <ModalShell labelledById="bulk-confirm-title" onClose={() => !bulkBusy && setConfirmOpen(false)}>
          <h3 id="bulk-confirm-title" className="text-sm font-bold text-slate-900">
            Accept {selectedIds.length} case{selectedIds.length === 1 ? "" : "s"}?
          </h3>
          <p className="text-xs leading-relaxed text-slate-600">
            Each selected case will be recorded as an AI-result acceptance, one every{" "}
            {BULK_GAP_MS / 1000}s. Cases whose integrity checks block acceptance will fail and be
            reported. This is audited and cannot be undone here.
          </p>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
            {selectedIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="fp-btn-secondary w-full sm:w-auto"
              data-autofocus
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="fp-btn-primary w-full sm:w-auto"
              onClick={runBulkAccept}
            >
              Confirm accept ({selectedIds.length})
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

export default function ReviewQueueRoute() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading queue…</p>}>
      <ReviewQueuePage />
    </Suspense>
  );
}
