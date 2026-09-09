"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth-headers";

type HealthResponse = {
  ok: boolean;
  status: string;
  timestamp?: string;
};

type SystemStatus = {
  supabase?: boolean;
  gemini?: boolean;
  sentinel?: boolean;
  imdKey?: boolean;
  version?: string;
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
  const health = useQuery<HealthResponse>({
    queryKey: ["system-health"],
    queryFn: async () => {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) throw new Error(`Health probe failed with HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const status = useQuery<SystemStatus | null>({
    queryKey: ["system-status"],
    queryFn: async () => {
      const res = await apiFetch("/api/system/status");
      if (res.status === 403) return null;
      if (!res.ok) throw new Error("Unable to load system status.");
      return (await res.json()) as SystemStatus;
    },
  });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">System health</h1>
      </div>
      <div className="fp-panel p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Liveness</h2>
        {health.isLoading && <p className="mt-2 text-sm text-slate-600">Checking…</p>}
        {health.error && (
          <p className="mt-2 text-sm text-rose-700">
            {health.error instanceof Error ? health.error.message : "Health check failed"}
          </p>
        )}
        {health.data && (
          <p className="mt-2 text-sm text-slate-800">
            App {health.data.ok ? "is up" : "reported a failure"} ({health.data.status}).
          </p>
        )}
        <button type="button" className="fp-btn-secondary mt-3 text-xs" onClick={() => void health.refetch()}>
          {health.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      {status.data && (
        <div className="fp-panel p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Dependency checks</h2>
          <ul className="mt-2">
            <CheckRow label="Supabase (database + auth)" pass={status.data.supabase} />
            <CheckRow label="Gemini (AI analysis)" pass={status.data.gemini} />
            <CheckRow label="Sentinel / Copernicus" pass={status.data.sentinel} />
            <CheckRow label="IMD / weather key" pass={status.data.imdKey} />
          </ul>
          {status.data.version ? (
            <p className="mt-3 text-xs text-slate-500">Version {status.data.version}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
