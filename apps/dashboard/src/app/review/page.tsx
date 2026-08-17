"use client";

import { useQuery } from "@tanstack/react-query";
import { api, Submission } from "@/lib/api";
import Link from "next/link";
import { useState, useMemo } from "react";
import { resolveEvidenceEvaluation } from "@/components/EvidenceConfidenceSection";

export default function ReviewQueuePage() {
  const [filterTab, setFilterTab] = useState<
    "all" | "low_confidence" | "needs_recapture" | "integrity" | "coverage" | "visual" | "context"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "evidence_asc" | "evidence_desc" | "model_desc">("newest");

  const { data, isLoading } = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () =>
      (
        await api.get<{ items: Submission[] }>("/review/queue")
      ).data,
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

    // Filter Tab
    if (filterTab === "low_confidence") {
      list = list.filter((item) => item.evaluation.confidence.final < 85);
    } else if (filterTab === "needs_recapture") {
      list = list.filter(
        (item) =>
          item.submission.status === "needs_recapture" ||
          item.evaluation.uncertainty.recommended_action === "request_specific_evidence" ||
          item.evaluation.uncertainty.recommended_action === "retake_image"
      );
    } else if (filterTab === "integrity") {
      list = list.filter(
        (item) =>
          item.evaluation.uncertainty.type === "integrity" ||
          item.evaluation.integrity.score < 70 ||
          (item.evaluation.integrity.details?.flags && item.evaluation.integrity.details.flags.length > 0)
      );
    } else if (filterTab === "coverage") {
      list = list.filter((item) => item.evaluation.uncertainty.type === "coverage");
    } else if (filterTab === "visual") {
      list = list.filter((item) => item.evaluation.uncertainty.type === "visual");
    } else if (filterTab === "context") {
      list = list.filter((item) => item.evaluation.uncertainty.type === "context");
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.submission.id.toLowerCase().includes(q) ||
          item.submission.crop_cycle_id.toLowerCase().includes(q) ||
          item.submission.severity?.toLowerCase().includes(q) ||
          item.submission.latest_prediction?.primary_damage?.toLowerCase().includes(q) ||
          item.evaluation.uncertainty.type?.toLowerCase().includes(q)
      );
    }

    // Sort By
    if (sortBy === "evidence_asc") {
      list.sort((a, b) => a.evaluation.confidence.final - b.evaluation.confidence.final);
    } else if (sortBy === "evidence_desc") {
      list.sort((a, b) => b.evaluation.confidence.final - a.evaluation.confidence.final);
    } else if (sortBy === "model_desc") {
      list.sort(
        (a, b) =>
          (b.submission.latest_prediction?.overall_confidence || 0) -
          (a.submission.latest_prediction?.overall_confidence || 0)
      );
    }

    return list;
  }, [augmentedItems, filterTab, searchQuery, sortBy]);

  // Counts for tabs
  const tabCounts = useMemo(() => {
    return {
      all: augmentedItems.length,
      low_confidence: augmentedItems.filter((i) => i.evaluation.confidence.final < 85).length,
      needs_recapture: augmentedItems.filter(
        (i) =>
          i.submission.status === "needs_recapture" ||
          i.evaluation.uncertainty.recommended_action === "request_specific_evidence" ||
          i.evaluation.uncertainty.recommended_action === "retake_image"
      ).length,
      integrity: augmentedItems.filter(
        (i) =>
          i.evaluation.uncertainty.type === "integrity" ||
          i.evaluation.integrity.score < 70
      ).length,
      coverage: augmentedItems.filter((i) => i.evaluation.uncertainty.type === "coverage").length,
      visual: augmentedItems.filter((i) => i.evaluation.uncertainty.type === "visual").length,
      context: augmentedItems.filter((i) => i.evaluation.uncertainty.type === "context").length,
    };
  }, [augmentedItems]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="fp-page-title">Review Queue & Evidence Triage</h2>
          <p className="fp-page-sub">
            Cases requiring human decision · Evaluates both Evidence Trust and Model Prediction
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2 text-xs">
        {[
          { id: "all", label: "All Cases", count: tabCounts.all },
          { id: "low_confidence", label: "Low Evidence Conf (<85%)", count: tabCounts.low_confidence, tone: "amber" },
          { id: "needs_recapture", label: "Needs Recapture", count: tabCounts.needs_recapture, tone: "blue" },
          { id: "integrity", label: "Integrity Flags", count: tabCounts.integrity, tone: "rose" },
          { id: "coverage", label: "Coverage Uncertainty", count: tabCounts.coverage },
          { id: "visual", label: "Visual Uncertainty", count: tabCounts.visual },
          { id: "context", label: "Context Uncertainty", count: tabCounts.context },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterTab(tab.id as typeof filterTab)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
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
          </button>
        ))}
      </div>

      {/* Search & Sort Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="w-full sm:w-72">
          <input
            type="search"
            placeholder="Search by ID, peril, uncertainty…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="fp-input"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-slate-500 font-medium">Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="fp-input py-1 text-xs"
          >
            <option value="newest">Newest First</option>
            <option value="evidence_asc">Evidence Confidence (Lowest First)</option>
            <option value="evidence_desc">Evidence Confidence (Highest First)</option>
            <option value="model_desc">Model Confidence (Highest First)</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading queue…</p>}

      <div className="fp-panel overflow-x-auto shadow-sm">
        <table className="fp-table text-xs">
          <thead>
            <tr>
              <th>Reference</th>
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

              return (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="font-mono text-[11px] font-semibold text-slate-700">
                    {s.id.slice(0, 8)}…
                  </td>
                  <td>
                    <span className="fp-badge-neutral uppercase text-[10px]">{s.status}</span>
                  </td>
                  <td className="capitalize">{s.severity || s.latest_prediction?.severity || "—"}</td>
                  <td className="capitalize">{s.latest_prediction?.primary_damage?.replaceAll("_", " ") || "—"}</td>

                  {/* Evidence Confidence Column */}
                  <td className="tabular-nums font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900">{finalConf}%</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold border ${
                          isLowConf
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {isLowConf ? "SUB-85" : "OK"}
                      </span>
                    </div>
                  </td>

                  {/* Uncertainty Column */}
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

                  {/* Recommended Action Column */}
                  <td className="text-slate-700 capitalize max-w-[160px] truncate">
                    {ev.uncertainty.recommended_action
                      ? ev.uncertainty.recommended_action.replaceAll("_", " ")
                      : "Normal Review"}
                  </td>

                  {/* Integrity Status Column */}
                  <td>
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                        isIntegrityIssue
                          ? "bg-rose-50 text-rose-800 border-rose-200"
                          : "bg-emerald-50 text-emerald-800 border-emerald-200"
                      }`}
                    >
                      <span>{isIntegrityIssue ? "⚠️ Flagged" : "✓ Passed"}</span>
                    </span>
                  </td>

                  {/* Model Confidence Column (Separated) */}
                  <td className="tabular-nums text-slate-600 font-mono text-[11px]">
                    {s.latest_prediction?.overall_confidence != null
                      ? `${(s.latest_prediction.overall_confidence * 100).toFixed(0)}%`
                      : "—"}
                  </td>

                  {/* Action Link */}
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
                <td colSpan={10} className="py-12 text-center text-slate-500">
                  No cases found matching the selected filter criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

