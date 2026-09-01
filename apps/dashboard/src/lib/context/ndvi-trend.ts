/**
 * Sentinel-2 NDVI time-series for claim review.
 *
 * Uses the Copernicus Data Space **Statistical API** (`/api/v1/statistics`),
 * which aggregates an evalscript over a time range in fixed intervals — one
 * request returns the whole series instead of one call per scene.
 *
 * All parsing/stats helpers are pure and unit-tested; `fetchNdviTimeSeries`
 * is the only network call and degrades to `null` (never throws) so reviewers
 * always see honest "unavailable" rather than a broken chart.
 */

export interface NdviPoint {
  /** Interval start, YYYY-MM-DD. */
  date: string;
  /** Mean NDVI over the plot bbox for this interval (0..1). */
  ndvi: number;
  /** Mean dataMask — proxy for cloud/scene coverage (0..1). */
  coverage?: number;
}

export type NdviTrendVerdict = "vegetation_collapse" | "no_significant_change" | "insufficient_data";

export interface NdviTrendStats {
  baseline: { count: number; meanNdvi: number | null };
  post: { count: number; meanNdvi: number | null };
  /** Relative NDVI drop across the event, percent (0..100+). Null when either window is empty. */
  dropPct: number | null;
  verdict: NdviTrendVerdict;
}

export interface NdviTrendRange {
  from: string;
  to: string;
}

// Evalscript mirrors the burn-scar script in assemble.ts: band 0 = NDVI,
// band 1 = dataMask, FLOAT32 so the statistics API answers with plain numbers.
const NDVI_TREND_EVALSCRIPT = `//VERSION=3
function setup(){return{input:["B04","B08","dataMask"],output:{bands:2,sampleType:"FLOAT32"}}}
function evaluatePixel(s){
  const denom = s.B08 + s.B04;
  const ndvi = denom === 0 ? 0 : (s.B08 - s.B04)/denom;
  return [ndvi, s.dataMask];
}`;

/**
 * Time range to chart around a loss event: `daysBefore` of healthy-growth
 * baseline and `daysAfter` of post-event response. The `to` edge is clamped
 * to `today` so we never ask the archive for future dates.
 */
export function ndviTrendRange(
  eventDate: Date,
  opts: { daysBefore?: number; daysAfter?: number; today?: Date } = {},
): NdviTrendRange {
  const daysBefore = opts.daysBefore ?? 90;
  const daysAfter = opts.daysAfter ?? 30;
  const today = opts.today ?? new Date();
  const to = today < eventDate ? today : new Date(Math.min(eventDate.getTime() + daysAfter * 86400000, today.getTime()));
  const from = new Date(eventDate.getTime() - daysBefore * 86400000);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isIsoDateString(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}

function finiteNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a Copernicus Statistical API response into a sorted series.
 *
 * Canonical shape: `{ data: { C0: { "2026-06-01T00:00:00Z": { mean: { B0: 0.42, B1: 0.97 } } } } }`
 * Tolerates `C0` missing (bands object directly at `data`), and skips
 * intervals whose dataMask mean (B1) is < 0.5 (mostly cloud / no scene).
 */
export function parseNdviStatisticsResponse(j: unknown): NdviPoint[] {
  try {
    const root = (j as { data?: unknown } | null)?.data ?? j;
    if (!root || typeof root !== "object" || Array.isArray(root)) return [];
    const channels = root as Record<string, unknown>;
    const intervalsRaw =
      channels.C0 && typeof channels.C0 === "object" && !Array.isArray(channels.C0)
        ? (channels.C0 as Record<string, unknown>)
        : channels;
    const points: NdviPoint[] = [];
    for (const [key, value] of Object.entries(intervalsRaw)) {
      if (!isIsoDateString(key)) continue;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const mean = (value as { mean?: unknown }).mean;
      if (!mean || typeof mean !== "object" || Array.isArray(mean)) continue;
      const meanObj = mean as Record<string, unknown>;
      const ndvi = finiteNumber(meanObj.B0);
      if (ndvi == null) continue;
      const coverage = finiteNumber(meanObj.B1);
      if (coverage != null && coverage < 0.5) continue;
      points.push({ date: key.slice(0, 10), ndvi, coverage: coverage ?? undefined });
    }
    points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return points;
  } catch {
    return [];
  }
}

/**
 * Compare pre-event baseline vegetation against post-event response.
 * Verdict rules (conservative — a reviewer-facing "collapse" claim needs support):
 *  - `vegetation_collapse`: ≥2 baseline points, ≥1 post point, mean NDVI drop ≥ 20%.
 *  - `no_significant_change`: both windows populated, drop < 20%.
 *  - `insufficient_data`: either window empty (too few cloud-free scenes).
 */
export function computeTrendStats(series: NdviPoint[], eventDate: Date): NdviTrendStats {
  const eventDay = toIsoDate(eventDate);
  const baseline = series.filter((p) => p.date < eventDay);
  const post = series.filter((p) => p.date >= eventDay);
  const mean = (arr: NdviPoint[]) =>
    arr.length === 0 ? null : arr.reduce((sum, p) => sum + p.ndvi, 0) / arr.length;
  const baselineMean = mean(baseline);
  const postMean = mean(post);
  const dropPct =
    baselineMean != null && postMean != null && baselineMean > 0
      ? ((baselineMean - postMean) / baselineMean) * 100
      : null;
  let verdict: NdviTrendVerdict = "insufficient_data";
  if (baseline.length >= 2 && post.length >= 1 && dropPct != null) {
    verdict = dropPct >= 20 ? "vegetation_collapse" : "no_significant_change";
  }
  return {
    baseline: { count: baseline.length, meanNdvi: baselineMean },
    post: { count: post.length, meanNdvi: postMean },
    dropPct,
    verdict,
  };
}

export interface NdviFetchInput {
  lat: number;
  lon: number;
  from: string;
  to: string;
  token: string;
  timeoutMs?: number;
}

/**
 * Fetch the NDVI series around a plot. One statistical request at 10 m
 * resolution, 5-day intervals, cloud coverage capped at 30%. Returns null on
 * any failure (timeout, auth, malformed payload) — callers must degrade to
 * "unavailable", never fabricate a series.
 */
export async function fetchNdviTimeSeries(input: NdviFetchInput): Promise<NdviPoint[] | null> {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lon)) return null;
  if (!input.token) return null;
  const bbox = [input.lon - 0.01, input.lat - 0.01, input.lon + 0.01, input.lat + 0.01];
  const body = {
    input: {
      bounds: { bbox, properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" } },
      data: [
        {
          type: "S2L2A",
          dataFilter: {
            timeRange: { from: `${input.from}T00:00:00Z`, to: `${input.to}T23:59:59Z` },
            maxCloudCoverage: 30,
          },
        },
      ],
    },
    aggregation: {
      timeRange: { from: `${input.from}T00:00:00Z`, to: `${input.to}T23:59:59Z` },
      aggregation: { interval: "P5D", evalscript: NDVI_TREND_EVALSCRIPT },
      resx: 10,
      resy: 10,
    },
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), input.timeoutMs ?? 8000);
  try {
    const res = await fetch("https://sh.dataspace.copernicus.eu/api/v1/statistics", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j: unknown = await res.json().catch(() => null);
    if (!j) return null;
    const series = parseNdviStatisticsResponse(j);
    return series.length > 0 ? series : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
