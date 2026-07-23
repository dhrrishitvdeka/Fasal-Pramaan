"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function AuditPage() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: async () =>
      (await api.get("/admin/audit-logs")).data as Array<{
        id: string;
        action: string;
        entity_type: string;
        entity_id?: string;
        actor_id?: string;
        created_at?: string;
        notes?: string;
      }>,
  });

  return (
    <div className="space-y-4">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">Audit logs</h2>
        <p className="fp-page-sub">Immutable record of significant actions</p>
      </div>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && (
        <p className="border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
          Administrator access required.
        </p>
      )}
      <div className="fp-panel overflow-x-auto">
        <table className="fp-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((a) => (
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
