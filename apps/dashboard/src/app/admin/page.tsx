"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth-headers";
import { useRequireRole } from "@/lib/use-require-role";
import AccessGate from "@/components/AccessGate";
import { Activity, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

type SystemStatus = {
  supabase: boolean;
  gemini: boolean;
  sentinel: boolean;
  imdKey: boolean;
  hfSpaceUrl: string | null;
  version: string;
};

type StatusRow = {
  key: keyof Pick<SystemStatus, "supabase" | "gemini" | "sentinel" | "imdKey">;
  label: string;
  description: string;
};

const STATUS_ROWS: StatusRow[] = [
  { key: "supabase", label: "Supabase", description: "Claims store and auth (URL + service role key)" },
  { key: "gemini", label: "Gemini", description: "Vision authenticity gate (GEMINI_API_KEY)" },
  { key: "sentinel", label: "Sentinel", description: "Copernicus satellite cross-check (SENTINEL_TOKEN)" },
  { key: "imdKey", label: "IMD / Weather", description: "Official rainfall API upgrade path (IMD_API_KEY)" },
];

function ConfigChip({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-300 bg-slate-100 text-slate-500"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
      {ok ? "Configured" : "Not set"}
    </span>
  );
}

export default function AdminPage() {
  const gate = useRequireRole(["administrator"]);

  const status = useQuery({
    queryKey: ["system-status"],
    queryFn: async (): Promise<SystemStatus> => {
      const res = await apiFetch("/api/system/status");
      if (!res.ok) {
        throw new Error(res.status === 403 ? "Administrator role required" : "Status unavailable");
      }
      return res.json();
    },
    enabled: gate.status === "ok",
    refetchInterval: 60_000,
  });

  if (gate.status !== "ok") return <AccessGate status={gate.status} />;

  const data = status.data;
  const degraded = data ? (!data.supabase || !data.gemini) : false;

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">System status</h2>
        <p className="fp-page-sub">Environment configuration summary — booleans only, no secret values</p>
      </div>

      {status.isLoading && <p className="text-sm text-slate-500">Checking configuration…</p>}

      {status.error && (
        <div className="border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800" role="alert">
          {status.error instanceof Error ? status.error.message : "Unable to load system status."}
          {" "}Confirm administrator access.
        </div>
      )}

      {data && (
        <>
          <section aria-label="Overall health" className="fp-panel flex flex-wrap items-center gap-3 p-4">
            <span className={`inline-flex items-center gap-2 rounded border px-2.5 py-1 text-sm font-bold ${
              degraded
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}>
              {degraded ? (
                <AlertTriangle className="h-4 w-4" aria-hidden />
              ) : (
                <Activity className="h-4 w-4" aria-hidden />
              )}
              {degraded ? "Degraded" : "OK"}
            </span>
            <span className="text-xs text-slate-500">
              {degraded
                ? "Core services missing configuration — claims pipeline may not persist."
                : "All core services configured."}
            </span>
            <span className="ml-auto rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">
              version {data.version}
            </span>
          </section>

          <section aria-label="Configuration checks" className="fp-panel p-4" data-testid="system-status-checks">
            <h3 className="mb-2 border-b border-slate-100 pb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Checks
            </h3>
            <ul className="divide-y divide-slate-100">
              {STATUS_ROWS.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--ink)]">{row.label}</div>
                    <div className="text-xs text-[var(--ink-muted)]">{row.description}</div>
                  </div>
                  <ConfigChip ok={Boolean(data[row.key])} />
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--ink)]">HuggingFace Space</div>
                  <div className="truncate text-xs text-[var(--ink-muted)]">
                    {data.hfSpaceUrl || "Default space (not overridden)"}
                  </div>
                </div>
                {data.hfSpaceUrl ? (
                  <a
                    href={data.hfSpaceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="fp-link shrink-0 text-xs underline underline-offset-2"
                  >
                    Open ↗
                  </a>
                ) : (
                  <ConfigChip ok={false} />
                )}
              </li>
            </ul>
          </section>

          <p className="text-[11px] leading-snug text-slate-400">
            Live health probes (Supabase reachability, HF Space ping) remain on{" "}
            <span className="font-mono">/health</span>. This page reports static environment
            configuration and refreshes every minute.
          </p>
        </>
      )}
    </div>
  );
}
