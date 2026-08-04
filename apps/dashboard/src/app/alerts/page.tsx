"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Link from "next/link";

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
  const { data = [], isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: async () => (await api.get<Alert[]>("/dashboard/alerts")).data,
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">Operational alerts</h2>
        <p className="fp-page-sub">Priority notices for field and review operations</p>
      </div>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      <ul className="divide-y divide-slate-200 border border-slate-200 bg-white">
        {data.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-4 px-4 py-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                {a.alert_type} · {a.severity}
              </div>
              <div className="mt-0.5 text-sm font-medium text-slate-900">{a.title}</div>
              <p className="mt-1 text-sm text-slate-600">{a.message}</p>
              <p className="mt-1 text-xs text-slate-400">{a.created_at}</p>
            </div>
            {a.submission_id && (
              <Link
                href={`/review/${a.submission_id}`}
                className="shrink-0 text-sm font-medium text-slate-900 underline underline-offset-2"
              >
                Open case
              </Link>
            )}
          </li>
        ))}
        {!isLoading && data.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-slate-500">No alerts at this time.</li>
        )}
      </ul>
    </div>
  );
}
