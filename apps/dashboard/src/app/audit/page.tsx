"use client";

import { useQuery } from "@tanstack/react-query";
import { auditLogs } from "@/lib/api";
import { useRequireRole } from "@/lib/use-require-role";
import AccessGate from "@/components/AccessGate";
import EmptyState from "@/components/EmptyState";
import { ShieldCheck } from "lucide-react";

export default function AuditPage() {
  const gate = useRequireRole(["administrator"]);
  const { data, error, isLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: async () =>
      auditLogs(),
    enabled: gate.status === "ok",
  });

  if (gate.status !== "ok") return <AccessGate status={gate.status} />;

  const rows = data || [];

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">Audit logs</h2>
        <p className="fp-page-sub">Immutable record of significant actions</p>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      {!isLoading && rows.length === 0 && !error && (
        <EmptyState
          icon={ShieldCheck}
          title="No audit entries yet"
          body="Reviewer decisions and administrative actions will appear here as they are recorded."
          action={{ href: "/review", label: "Go to review queue" }}
        />
      )}

      {error && (
        <p className="border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Administrator access required.
        </p>
      )}

      {/* Phone: compact cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((a) => (
          <article key={a.id} className="fp-panel p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <span className="font-semibold capitalize text-[var(--ink)]">{a.action.replaceAll("_", " ")}</span>
              <time className="text-[10px] text-slate-400">{a.created_at || "—"}</time>
            </div>
            <div className="mt-1 break-all font-mono text-[10px] text-slate-500">
              {a.entity_type}
              {a.entity_id ? ` · ${a.entity_id}` : ""}
            </div>
            {a.notes && <p className="mt-1 break-words text-slate-600">{a.notes}</p>}
          </article>
        ))}
      </div>

      {/* md+: table */}
      <div className="fp-panel hidden overflow-x-auto md:block">
        <table className="fp-table min-w-[36rem]">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap text-xs text-slate-500">{a.created_at}</td>
                <td>{a.action}</td>
                <td className="text-xs text-slate-600">
                  {a.entity_type} {a.entity_id}
                </td>
                <td className="text-slate-600">{a.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
