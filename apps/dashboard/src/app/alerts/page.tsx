"use client";

import { useQuery } from "@tanstack/react-query";
import { listAlerts } from "@/lib/api";
import { useRequireRole } from "@/lib/use-require-role";
import AccessGate from "@/components/AccessGate";
import EmptyState from "@/components/EmptyState";
import { CardSkeleton } from "@/components/LoadingAnimation";
import ErrorMessage from "@/components/ErrorMessage";
import Link from "next/link";
import { BellRing } from "lucide-react";

type Alert = {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  created_at?: string;
  submission_id?: string;
};

export default function AlertsPage() {
  const gate = useRequireRole(["reviewer", "administrator"]);
  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ["alerts"],
    queryFn: listAlerts,
    refetchInterval: 15_000,
    enabled: gate.status === "ok",
  });

  if (gate.status !== "ok") return <AccessGate status={gate.status} />;

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">Operational alerts</h2>
        <p className="fp-page-sub">Priority notices for field and review operations</p>
      </div>

      {error && (
        <ErrorMessage
          title="Something went wrong loading alerts"
          message={error instanceof Error ? error.message : "Unable to retrieve operational alerts."}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading && <CardSkeleton count={3} className="space-y-3 !grid-cols-1" />}

      {!isLoading && !error && data.length === 0 && (
        <EmptyState
          icon={BellRing}
          title="No alerts at this time"
          body="Priority notices from field operations will appear here."
          action={{ href: "/review", label: "Go to review queue" }}
        />
      )}

      <ul className="space-y-2">
        {data.map((a) => (
          <li key={a.id} className="fp-panel p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500">
                  <span className="fp-badge-neutral">{a.alert_type}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-bold ${
                      a.severity.toLowerCase() === "high"
                        ? "border border-rose-200 bg-rose-50 text-rose-700"
                        : a.severity.toLowerCase() === "medium"
                          ? "border border-amber-200 bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {a.severity}
                  </span>
                  {a.created_at ? <span className="normal-case text-slate-400">{a.created_at}</span> : null}
                </div>
                <div className="mt-1.5 text-sm font-medium text-[var(--ink)]">{a.title}</div>
                <p className="mt-1 text-sm text-slate-600">{a.message}</p>
              </div>
              {a.submission_id && (
                <Link
                  href={`/review/${a.submission_id}`}
                  className="shrink-0 self-start rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                >
                  Open case →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
