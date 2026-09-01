import { describe, expect, it } from "vitest";
import {
  computeTrendStats,
  fetchNdviTimeSeries,
  ndviTrendRange,
  parseNdviStatisticsResponse,
  type NdviPoint,
} from "@/lib/context/ndvi-trend";

describe("parseNdviStatisticsResponse", () => {
  const makeResponse = (intervals: Record<string, { mean: { B0: number; B1: number } }>) => ({
    data: { C0: intervals },
  });

  it("parses the canonical Copernicus statistics shape and sorts by date", () => {
    const j = makeResponse({
      "2026-06-10T00:00:00Z": { mean: { B0: 0.55, B1: 0.98 } },
      "2026-06-05T00:00:00Z": { mean: { B0: 0.62, B1: 0.95 } },
    });
    expect(parseNdviStatisticsResponse(j)).toEqual([
      { date: "2026-06-05", ndvi: 0.62, coverage: 0.95 },
      { date: "2026-06-10", ndvi: 0.55, coverage: 0.98 },
    ]);
  });

  it("drops intervals with poor dataMask coverage (< 0.5, mostly cloud)", () => {
    const j = makeResponse({
      "2026-06-05T00:00:00Z": { mean: { B0: 0.62, B1: 0.95 } },
      "2026-06-10T00:00:00Z": { mean: { B0: 0.05, B1: 0.2 } },
    });
    const out = parseNdviStatisticsResponse(j);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe("2026-06-05");
  });

  it("tolerates C0 missing (band object directly under data)", () => {
    const j = {
      data: {
        "2026-06-05T00:00:00Z": { mean: { B0: 0.4, B1: 1 } },
      },
    };
    expect(parseNdviStatisticsResponse(j)).toEqual([
      { date: "2026-06-05", ndvi: 0.4, coverage: 1 },
    ]);
  });

  it("returns [] on garbage, missing mean, NaN values, and non-object roots", () => {
    expect(parseNdviStatisticsResponse(null)).toEqual([]);
    expect(parseNdviStatisticsResponse("nope")).toEqual([]);
    expect(parseNdviStatisticsResponse({ data: { C0: "broken" } })).toEqual([]);
    expect(parseNdviStatisticsResponse({ data: { C0: { "2026-06-05T00:00:00Z": {} } } })).toEqual([]);
    expect(
      parseNdviStatisticsResponse({ data: { C0: { "2026-06-05T00:00:00Z": { mean: { B0: NaN } } } } }),
    ).toEqual([]);
  });
});

describe("ndviTrendRange", () => {
  it("spans 90 days before the event and 30 days after by default", () => {
    const event = new Date("2026-06-15T00:00:00Z");
    const r = ndviTrendRange(event, { today: new Date("2026-12-31T00:00:00Z") });
    expect(r.from).toBe("2026-03-17");
    expect(r.to).toBe("2026-07-15");
  });

  it("clamps the post-event window to today (no future archive requests)", () => {
    const event = new Date("2026-06-15T00:00:00Z");
    const r = ndviTrendRange(event, { today: new Date("2026-06-20T00:00:00Z") });
    expect(r.to).toBe("2026-06-20");
  });
});

describe("computeTrendStats", () => {
  const p = (date: string, ndvi: number): NdviPoint => ({ date, ndvi });

  it("flags vegetation collapse on a >= 20% drop with enough baseline points", () => {
    const series = [p("2026-03-20", 0.6), p("2026-04-01", 0.62), p("2026-06-16", 0.42)];
    const stats = computeTrendStats(series, new Date("2026-06-15T00:00:00Z"));
    expect(stats.baseline.count).toBe(2);
    expect(stats.post.count).toBe(1);
    expect(stats.verdict).toBe("vegetation_collapse");
    expect(stats.dropPct).not.toBeNull();
    expect(stats.dropPct!).toBeGreaterThan(20);
  });

  it("reports no_significant_change when vegetation holds steady", () => {
    const series = [p("2026-03-20", 0.6), p("2026-04-01", 0.6), p("2026-06-16", 0.58)];
    const stats = computeTrendStats(series, new Date("2026-06-15T00:00:00Z"));
    expect(stats.verdict).toBe("no_significant_change");
  });

  it("returns insufficient_data when the baseline window has fewer than 2 points", () => {
    const series = [p("2026-04-01", 0.6), p("2026-06-16", 0.3)];
    const stats = computeTrendStats(series, new Date("2026-06-15T00:00:00Z"));
    expect(stats.verdict).toBe("insufficient_data");
  });

  it("returns insufficient_data when there are no post-event points yet", () => {
    const series = [p("2026-03-20", 0.6), p("2026-04-01", 0.6)];
    const stats = computeTrendStats(series, new Date("2026-06-15T00:00:00Z"));
    expect(stats.verdict).toBe("insufficient_data");
    expect(stats.post.count).toBe(0);
  });

  it("handles an empty series without throwing", () => {
    const stats = computeTrendStats([], new Date("2026-06-15T00:00:00Z"));
    expect(stats.verdict).toBe("insufficient_data");
    expect(stats.dropPct).toBeNull();
    expect(stats.baseline.meanNdvi).toBeNull();
  });

  it("treats the event day itself as post-event", () => {
    const series = [p("2026-04-01", 0.6), p("2026-06-15", 0.2)];
    const stats = computeTrendStats(series, new Date("2026-06-15T00:00:00Z"));
    expect(stats.baseline.count).toBe(1);
    expect(stats.post.count).toBe(1);
  });
});

describe("fetchNdviTimeSeries", () => {
  it("returns null without any network call when the token is missing or coords are invalid", async () => {
    expect(await fetchNdviTimeSeries({ lat: 25, lon: 80, from: "2026-03-01", to: "2026-06-01", token: "" })).toBeNull();
    expect(
      await fetchNdviTimeSeries({ lat: NaN, lon: 80, from: "2026-03-01", to: "2026-06-01", token: "t" }),
    ).toBeNull();
  });
});
