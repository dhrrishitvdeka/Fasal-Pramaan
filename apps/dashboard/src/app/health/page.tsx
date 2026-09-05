"use client";

import { useQuery } from "@tanstack/react-query";

type HealthResponse = {
  ok: boolean;
  status: string;
  timestamp?: string;
};

export default function HealthPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<HealthResponse>({
    queryKey: ["system-health"],
    queryFn: async () => {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) throw new Error(`Health probe failed with HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">System health</h1>
      </div>
      <div className="fp-panel p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Dependency checks</h2>
        {isLoading && <p className="mt-2 text-sm text-slate-600">Checking…</p>}
        {error && (
          <p className="mt-2 text-sm text-rose-700">
            {error instanceof Error ? error.message : "Health check failed"}
          </p>
        )}
        {data && (
          <p className="mt-2 text-sm text-slate-800">
            App {data.ok ? "is up" : "reported a failure"} ({data.status}).
          </p>
        )}
        <button type="button" className="fp-btn-secondary mt-3 text-xs" onClick={() => void refetch()}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <pre className="overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700">
        {JSON.stringify(data || { ok: false }, null, 2)}
      </pre>
    </div>
  );
}
