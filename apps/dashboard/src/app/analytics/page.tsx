"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const GRAYS = ["#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1", "#e2e8f0"];

export default function AnalyticsPage() {
  const byCat = useQuery({
    queryKey: ["damage-cat"],
    queryFn: async () =>
      (await api.get("/dashboard/analytics/damage-by-category")).data as Array<{
        category: string;
        count: number;
      }>,
  });
  const bySev = useQuery({
    queryKey: ["severity"],
    queryFn: async () =>
      (await api.get("/dashboard/analytics/severity-distribution")).data as Array<{
        severity: string;
        count: number;
      }>,
  });
  const byCrop = useQuery({
    queryKey: ["by-crop"],
    queryFn: async () =>
      (await api.get("/dashboard/analytics/by-crop")).data as Array<{
        crop_name: string;
        count: number;
      }>,
  });

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">Damage analytics</h2>
        <p className="fp-page-sub">Aggregate counts for planning and oversight</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="fp-panel h-80 p-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            By damage category
          </h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={byCat.data || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: "#64748b" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip />
              <Bar dataKey="count" fill="#334155" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="fp-panel h-80 p-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Severity distribution
          </h3>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie data={bySev.data || []} dataKey="count" nameKey="severity" outerRadius={100} label>
                {(bySev.data || []).map((_, i) => (
                  <Cell key={i} fill={GRAYS[i % GRAYS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="fp-panel h-80 p-3 lg:col-span-2">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Submissions by crop
          </h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={byCrop.data || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="crop_name" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip />
              <Bar dataKey="count" fill="#0f172a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
