"use client";

import { useQuery } from "@tanstack/react-query";
import { api, Submission } from "@/lib/api";
import Link from "next/link";

export default function ReviewQueuePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["review-queue"],
    queryFn: async () =>
      (
        await api.get<{ items: Submission[] }>("/review/queue", {
          params: { status: "pending_review" },
        })
      ).data,
  });

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">Review queue</h2>
        <p className="fp-page-sub">
          Cases requiring human decision · AI findings are assistive only
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading queue…</p>}

      <div className="fp-panel overflow-x-auto">
        <table className="fp-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Status</th>
              <th>Severity</th>
              <th>AI damage</th>
              <th>Confidence</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((s) => (
              <tr key={s.id}>
                <td className="font-mono text-xs text-slate-600">{s.id.slice(0, 8)}…</td>
                <td>
                  <span className="fp-badge-neutral">{s.status}</span>
                </td>
                <td>{s.severity || s.latest_prediction?.severity || "—"}</td>
                <td>{s.latest_prediction?.primary_damage || "—"}</td>
                <td className="tabular-nums">
                  {s.latest_prediction?.overall_confidence != null
                    ? `${(s.latest_prediction.overall_confidence * 100).toFixed(0)}%`
                    : "—"}
                </td>
                <td className="text-right">
                  <Link
                    href={`/review/${s.id}`}
                    className="text-sm font-medium text-slate-900 underline underline-offset-2 hover:no-underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {!isLoading && (data?.items || []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-slate-500">
                  No cases pending review.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
