"use client";

import { useQuery } from "@tanstack/react-query";

type HealthResponse = {
  ok: boolean;
  status: string;
  timestamp?: string;
  checks?: { app?: boolean; supabase?: boolean; gemini?: boolean };
};

function CheckRow({ label, pass }: { label: string; pass: boolean | undefined }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-700">{label}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
          pass ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
        }`}
      >
        {pass ? "Configured" : "Not set"}
      </span>
    </li>
  );
}

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
          <>
            <p className="mt-2 text-sm text-slate-800">
              App {data.ok ? "is up" : "reported a failure"} ({data.status}).
            </p>
            <ul className="mt-2">
              <CheckRow label="Next.js app" pass={data.checks?.app} />
              <CheckRow label="Supabase (database + auth)" pass={data.checks?.supabase} />
              <CheckRow label="Gemini (AI analysis)" pass={data.checks?.gemini} />
            </ul>
          </>
        )}
        <button type="button" className="fp-btn-secondary mt-3 text-xs" onClick={() => void refetch()}>
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
