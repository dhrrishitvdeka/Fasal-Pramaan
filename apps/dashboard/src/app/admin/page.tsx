"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function AdminPage() {
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () =>
      (await api.get("/admin/users")).data as Array<{
        id: string;
        email: string;
        full_name: string;
        roles: string[];
      }>,
  });
  const jurisdictions = useQuery({
    queryKey: ["jurisdictions"],
    queryFn: async () =>
      (await api.get("/admin/jurisdictions")).data as Array<{
        code: string;
        name: string;
        level: string;
      }>,
  });
  const models = useQuery({
    queryKey: ["models"],
    queryFn: async () =>
      (await api.get("/admin/model-versions")).data as Array<{
        name: string;
        version: string;
        adapter_type: string;
        is_production_validated: boolean;
      }>,
  });
  const categories = useQuery({
    queryKey: ["damage-cats"],
    queryFn: async () =>
      (await api.get("/admin/damage-categories")).data as Array<{
        code: string;
        name: string;
        name_hi?: string;
      }>,
  });

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">Administration</h2>
        <p className="fp-page-sub">Users, jurisdictions, categories and model registry</p>
      </div>

      <section className="fp-panel">
        <h3 className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Users
        </h3>
        {users.error ? (
          <p className="px-4 py-3 text-sm text-slate-600">Administrator role required for user list.</p>
        ) : (
          <table className="fp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
              </tr>
            </thead>
            <tbody>
              {(users.data || []).map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name}</td>
                  <td className="text-slate-600">{u.email}</td>
                  <td className="text-xs text-slate-500">{(u.roles || []).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="fp-panel p-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Jurisdictions
          </h3>
          <ul className="space-y-1 text-sm">
            {(jurisdictions.data || []).map((j) => (
              <li key={j.code} className="flex justify-between gap-2 border-b border-slate-50 py-1">
                <span>{j.name}</span>
                <span className="text-xs text-slate-400">{j.level}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="fp-panel p-4">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Model versions
          </h3>
          <ul className="space-y-2 text-sm">
            {(models.data || []).map((m) => (
              <li key={`${m.name}-${m.version}`} className="border-b border-slate-50 pb-2">
                <div className="font-medium">
                  {m.name} {m.version}
                </div>
                <div className="text-xs text-slate-500">
                  {m.adapter_type} · production validated:{" "}
                  {m.is_production_validated ? "yes" : "no"}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="fp-panel p-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Damage categories
        </h3>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {(categories.data || []).map((c) => (
            <li key={c.code} className="border-b border-slate-50 py-1">
              {c.name}
              {c.name_hi ? <span className="text-slate-400"> · {c.name_hi}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
