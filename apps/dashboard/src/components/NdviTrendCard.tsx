"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/auth-headers";

interface NdviPoint {
  date: string;
  ndvi: number;
  coverage?: number;
}

interface NdviTrendStats {
  baseline: { count: number; meanNdvi: number | null };
  post: { count: number; meanNdvi: number | null };
  dropPct: number | null;
  verdict: "vegetation_collapse" | "no_significant_change" | "insufficient_data";
}

interface NdviTrendResponse {
  available: boolean;
  reason?: string;
  eventDate?: string | null;
  range?: { from: string; to: string };
  series?: NdviPoint[];
  stats?: NdviTrendStats;
}

interface NdviTrendCardProps {
  claimId: string;
}

const VERDICT_LABELS: Record<NdviTrendStats["verdict"], { en: string; hi: string; className: string }> = {
  vegetation_collapse: {
    en: "Vegetation collapse detected",
    hi: "वनस्पति पतन का संकेत",
    className: "bg-red-50 text-red-700 border-red-200",
  },
  no_significant_change: {
    en: "No significant vegetation change",
    hi: "वनस्पति में कोई महत्वपूर्ण बदलाव नहीं",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  insufficient_data: {
    en: "Too few cloud-free satellite passes",
    hi: "बादल-मुक्त उपग्रह चित्र अपर्याप्त",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

async function fetchNdviTrend(claimId: string): Promise<NdviTrendResponse | null> {
  try {
    const res = await apiFetch(`/api/claims/${encodeURIComponent(claimId)}/satellite-trend`);
    if (!res.ok) return null;
    return (await res.json()) as NdviTrendResponse;
  } catch {
    return null;
  }
}

export function NdviTrendCard({ claimId }: NdviTrendCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["ndvi-trend", claimId],
    queryFn: () => fetchNdviTrend(claimId),
    enabled: !!claimId,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Sentinel-2 NDVI trend
        </div>
        <div className="h-[96px] w-full animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (!data?.available || !data.series || data.series.length === 0 || !data.stats) {
    return null;
  }

  const { series, stats, eventDate } = data;
  const W = 320;
  const H = 96;
  const PAD = 6;
  const firstDate = Date.parse(series[0].date);
  const lastDate = Date.parse(series[series.length - 1].date);
  const span = Math.max(lastDate - firstDate, 1);
  const x = (d: string) => PAD + ((Date.parse(d) - firstDate) / span) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - Math.min(Math.max(v, 0), 1) * (H - 2 * PAD);
  const polyline = series.map((p) => `${x(p.date).toFixed(1)},${y(p.ndvi).toFixed(1)}`).join(" ");
  const eventX =
    eventDate && Date.parse(eventDate) >= firstDate && Date.parse(eventDate) <= lastDate
      ? x(eventDate.slice(0, 10))
      : null;
  const verdict = VERDICT_LABELS[stats.verdict];
  const eventLabel = eventDate ? formatDate(eventDate) : "";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Sentinel-2 NDVI trend (90d before → 30d after)
        </p>
        <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${verdict.className}`}>
          {verdict.en}
          {stats.verdict === "vegetation_collapse" && stats.dropPct != null
            ? ` (−${stats.dropPct.toFixed(0)}%)`
            : ""}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-slate-500">{verdict.hi}</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`NDVI trend chart${eventLabel ? `, loss event on ${eventLabel}` : ""}`}
        className="h-[96px] w-full"
      >
        {/* NDVI reference gridlines at 0.0 / 0.5 / 1.0 */}
        {[0, 0.5, 1].map((v) => (
          <line
            key={v}
            x1={PAD}
            x2={W - PAD}
            y1={y(v)}
            y2={y(v)}
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray={v === 0 || v === 1 ? undefined : "3 3"}
          />
        ))}
        {eventX != null && (
          <line
            x1={eventX}
            x2={eventX}
            y1={PAD - 2}
            y2={H - PAD + 2}
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}
        <polyline
          points={polyline}
          fill="none"
          stroke="#16a34a"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {series.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.ndvi)} r="2.2" fill="#16a34a">
            <title>{`${p.date}: NDVI ${p.ndvi.toFixed(2)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
        <span>{formatDate(series[0].date)}</span>
        <span className="text-amber-600">
          {eventLabel ? `Loss event ~${eventLabel}` : ""}
        </span>
        <span>{formatDate(series[series.length - 1].date)}</span>
      </div>
      <p className="mt-1 text-[10px] text-slate-400">
        Baseline NDVI {stats.baseline.meanNdvi != null ? stats.baseline.meanNdvi.toFixed(2) : "—"}
        {" · "}Post-event {stats.post.meanNdvi != null ? stats.post.meanNdvi.toFixed(2) : "—"}
        {" · "}Sentinel-2 L2A, 5-day composites
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}
