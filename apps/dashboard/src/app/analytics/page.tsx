"use client";

import { useQuery } from "@tanstack/react-query";
import { analyticsByCategory, analyticsByCrop, analyticsBySeverity } from "@/lib/api";
import { useRequireRole } from "@/lib/use-require-role";
import AccessGate from "@/components/AccessGate";
import { CardSkeleton } from "@/components/LoadingAnimation";
import ErrorMessage from "@/components/ErrorMessage";
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
  const gate = useRequireRole(["reviewer", "administrator"]);
  const byCat = useQuery({
    queryKey: ["damage-cat"],
    queryFn: async () =>
      analyticsByCategory() as Promise<Array<{
        category: string;
        count: number;
      }>>,
    enabled: gate.status === "ok",
  });
  const bySev = useQuery({
    queryKey: ["severity"],
    queryFn: async () =>
      analyticsBySeverity() as Promise<Array<{
        severity: string;
        count: number;
      }>>,
    enabled: gate.status === "ok",
  });
  const byCrop = useQuery({
    queryKey: ["by-crop"],
    queryFn: async () =>
      analyticsByCrop() as Promise<Array<{
        crop_name: string;
        count: number;
      }>>,
    enabled: gate.status === "ok",
  });

  if (gate.status !== "ok") return <AccessGate status={gate.status} />;

  const isLoading = byCat.isLoading || bySev.isLoading || byCrop.isLoading;
  const isError = byCat.isError || bySev.isError || byCrop.isError;

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-3">
        <h2 className="fp-page-title">Damage analytics</h2>
        <p className="fp-page-sub">Aggregate counts for planning and oversight</p>
      </div>

      {isError && (
        <ErrorMessage
          title="Something went wrong loading analytics data"
          message="Unable to aggregate damage and crop analytics. Please verify API availability."
          onRetry={() => {
            void byCat.refetch();
            void bySev.refetch();
            void byCrop.refetch();
          }}
        />
      )}

      {isLoading ? (
        <CardSkeleton count={3} className="space-y-4 !grid-cols-1 md:!grid-cols-2" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
        <div className="fp-panel p-2.5 sm:p-3" data-testid="chart-by-category">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            By damage category
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byCat.data || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="category" tick={{ fontSize: 10, fill: "#64748b" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip />
              <Bar dataKey="count" fill="#334155" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="fp-panel p-2.5 sm:p-3" data-testid="chart-by-severity">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Severity distribution
          </h3>
          <ResponsiveContainer width="100%" height={280}>
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
        <div className="fp-panel p-2.5 sm:p-3 lg:col-span-2" data-testid="chart-by-crop">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Submissions by crop
          </h3>
          <ResponsiveContainer width="100%" height={280}>
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
      )}
    </div>
  );
}
