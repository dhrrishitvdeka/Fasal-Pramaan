import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isValidCoordinate,
  plotContainment,
  assembleContext,
  imdCategory,
} from "../src/lib/context/assemble";

describe("isValidCoordinate", () => {
  it("accepts valid geographic coordinates as numbers", () => {
    expect(isValidCoordinate(28.6139, 77.209)).toBe(true);
    expect(isValidCoordinate(-33.8688, 151.2093)).toBe(true);
    expect(isValidCoordinate(90, 180)).toBe(true);
    expect(isValidCoordinate(-90, -180)).toBe(true);
    expect(isValidCoordinate(10.5, -45.2)).toBe(true);
  });

  it("accepts numeric strings that represent valid coordinates", () => {
    expect(isValidCoordinate("28.6139", "77.2090")).toBe(true);
    expect(isValidCoordinate("-12.34", "56.78")).toBe(true);
  });

  it("rejects null or undefined coordinates", () => {
    expect(isValidCoordinate(null, 77.209)).toBe(false);
    expect(isValidCoordinate(28.6139, null)).toBe(false);
    expect(isValidCoordinate(undefined, 77.209)).toBe(false);
    expect(isValidCoordinate(28.6139, undefined)).toBe(false);
    expect(isValidCoordinate(null, null)).toBe(false);
  });

  it("rejects non-numeric strings and non-finite numbers", () => {
    expect(isValidCoordinate("abc", 77.209)).toBe(false);
    expect(isValidCoordinate(28.6139, "xyz")).toBe(false);
    expect(isValidCoordinate(NaN, 77.209)).toBe(false);
    expect(isValidCoordinate(28.6139, NaN)).toBe(false);
    expect(isValidCoordinate(Infinity, 77.209)).toBe(false);
    expect(isValidCoordinate(28.6139, -Infinity)).toBe(false);
  });

  it("rejects out-of-bounds latitudes and longitudes", () => {
    expect(isValidCoordinate(90.1, 77.209)).toBe(false);
    expect(isValidCoordinate(-90.1, 77.209)).toBe(false);
    expect(isValidCoordinate(28.6139, 180.1)).toBe(false);
    expect(isValidCoordinate(28.6139, -180.1)).toBe(false);
  });

  it("rejects Null Island (0,0) and near-zero coordinates", () => {
    expect(isValidCoordinate(0, 0)).toBe(false);
    expect(isValidCoordinate(0.000005, 0.000005)).toBe(false);
    expect(isValidCoordinate(-0.000008, 0.000002)).toBe(false);
    // Non-zero values far enough from (0,0) should pass
    expect(isValidCoordinate(0.01, 0.01)).toBe(true);
  });
});

describe("plotContainment", () => {
  it("returns nulls if coordinates are missing or invalid", () => {
    expect(plotContainment(null, null, 28.61, 77.2)).toEqual({
      distanceM: null,
      within: null,
    });
    expect(plotContainment(28.61, 77.2, 0, 0)).toEqual({
      distanceM: null,
      within: null,
    });
  });

  it("returns within: true when points are close within threshold", () => {
    // 28.6139, 77.2090 and 28.6140, 77.2091 are ~15 meters apart
    const result = plotContainment(28.6139, 77.209, 28.614, 77.2091, 200);
    expect(result.distanceM).not.toBeNull();
    expect(result.distanceM).toBeLessThan(50);
    expect(result.within).toBe(true);
  });

  it("returns within: false when points exceed threshold", () => {
    // ~11 km apart
    const result = plotContainment(28.6139, 77.209, 28.7139, 77.209, 200);
    expect(result.distanceM).toBeGreaterThan(5000);
    expect(result.within).toBe(false);
  });
});

describe("imdCategory", () => {
  it("maps rainfall numbers correctly to categories", () => {
    expect(imdCategory(1)).toEqual({ category: "light", categoryHi: "हल्की" });
    expect(imdCategory(5)).toEqual({ category: "moderate", categoryHi: "मध्यम" });
    expect(imdCategory(25)).toEqual({ category: "moderately_heavy", categoryHi: "मध्यम-भारी" });
    expect(imdCategory(80)).toEqual({ category: "heavy", categoryHi: "भारी" });
  });
});

describe("assembleContext GPS accuracy & signals", () => {
  beforeEach(() => {
    // Mock global fetch to return clean responses or 404s so no real external network calls happen
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => "",
      } as Response;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports unavailable GPS when coordinates are missing or invalid", async () => {
    const ctx = await assembleContext({
      lat: null,
      lon: null,
      peril: "inundation",
    });
    const gpsSignal = ctx.signals.find((s) => s.source === "gps");
    expect(gpsSignal).toBeDefined();
    expect(gpsSignal?.status).toBe("unavailable");
    expect(gpsSignal?.confidence).toBe(0);
    expect(gpsSignal?.summaryEn).toMatch(/no valid gps fix/i);
  });

  it("reports available GPS when coordinates are valid and accuracy is within threshold", async () => {
    const ctx = await assembleContext({
      captureLat: 26.5,
      captureLon: 85.5,
      captureAccuracyM: 25,
      peril: "inundation",
    });
    const gpsSignal = ctx.signals.find((s) => s.source === "gps");
    expect(gpsSignal).toBeDefined();
    expect(gpsSignal?.status).toBe("available");
    expect(gpsSignal?.confidence).toBe(90);
    expect(gpsSignal?.summaryEn).toContain("±25m");
  });

  it("degrades GPS signal when captureAccuracyM exceeds 100 meters", async () => {
    const ctx = await assembleContext({
      captureLat: 26.5,
      captureLon: 85.5,
      captureAccuracyM: 150,
      peril: "inundation",
    });
    const gpsSignal = ctx.signals.find((s) => s.source === "gps");
    expect(gpsSignal).toBeDefined();
    expect(gpsSignal?.status).toBe("unavailable");
    expect(gpsSignal?.labelEn).toBe("GPS (Inaccurate)");
    expect(gpsSignal?.confidence).toBe(30);
    expect(gpsSignal?.meta?.inaccurate).toBe(true);
    expect(gpsSignal?.summaryEn).toMatch(/exceeds the 100m threshold/i);
  });

  it("degrades plot_match signal when captureAccuracyM > 100 even if plot coords exist", async () => {
    const ctx = await assembleContext({
      captureLat: 26.5001,
      captureLon: 85.5001,
      captureAccuracyM: 180,
      plotLat: 26.5,
      plotLon: 85.5,
      plotProximityMeters: 200,
      peril: "inundation",
    });
    const plotSignal = ctx.signals.find((s) => s.source === "plot_match");
    expect(plotSignal).toBeDefined();
    expect(plotSignal?.status).toBe("pending");
    expect(plotSignal?.labelEn).toBe("Plot location match (Degraded)");
    expect(plotSignal?.confidence).toBe(30);
    expect(plotSignal?.meta?.inaccurateGps).toBe(true);
    expect(plotSignal?.summaryEn).toMatch(/inaccurate.*threshold/i);
  });
});
