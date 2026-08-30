import { afterEach, describe, expect, it } from "vitest";
import { geminiGate, heuristicGate } from "../src/lib/vision/gate-shared";

function bigJpegDataUrl(): string {
  // ~9 KB of base64 payload — comfortably above the heuristic's ~8 KB floor.
  return `data:image/jpeg;base64,${"A".repeat(12000)}`;
}

const savedGeminiKey = process.env.GEMINI_API_KEY;
const savedGoogleKey = process.env.GOOGLE_API_KEY;

afterEach(() => {
  if (savedGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedGeminiKey;
  if (savedGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
  else process.env.GOOGLE_API_KEY = savedGoogleKey;
});

describe("vision authenticity gate (heuristic, no network)", () => {
  it("rejects non-data URLs as not_image", () => {
    const res = heuristicGate("https://cdn.example.com/field.jpg");
    expect(res.usable).toBe(false);
    expect(res.reason).toBe("not_image");
    expect(res.crop_detected).toBeNull();
  });

  it("rejects tiny payloads as too_small_or_blank", () => {
    const tiny = `data:image/jpeg;base64,${"A".repeat(64)}`;
    const res = heuristicGate(tiny);
    expect(res.usable).toBe(false);
    expect(res.reason).toBe("too_small_or_blank");
    expect(res.confidence).toBeLessThan(0.5);
  });

  it("passes fire_burn frames without requiring a crop match", () => {
    const res = heuristicGate(bigJpegDataUrl(), undefined, "fire_burn");
    expect(res.usable).toBe(true);
    expect(res.reason).toBe("ok");
    expect(res.crop_detected).toBe("unknown");

    const withCrop = heuristicGate(bigJpegDataUrl(), "Wheat", "fire_burn");
    expect(withCrop.usable).toBe(true);
    expect(withCrop.crop_detected).toBe("Wheat");
  });

  it("does not auto-pass expected-crop frames without CV quality signals", () => {
    const res = heuristicGate(bigJpegDataUrl(), "Wheat");
    expect(res.usable).toBe(false);
    expect(res.reason).toBe("heuristic_unverified");
    expect(res.fallback).toBe(true);
  });

  it("rejects low on-device crop scores instead of trusting expectedCrop", () => {
    const res = heuristicGate(bigJpegDataUrl(), "Wheat", "normal", {
      cvAnalysis: { luma: 50, greenPct: 40, blurScore: 40, cropScore: 20 },
    });
    expect(res.usable).toBe(false);
    expect(res.reason).toBe("crop_not_detected");
  });

  it("passes expected-crop frames when CV quality signals are present", () => {
    const res = heuristicGate(bigJpegDataUrl(), "Wheat", "normal", {
      cvAnalysis: { luma: 50, greenPct: 40, blurScore: 40, cropScore: 80 },
    });
    expect(res.usable).toBe(true);
    expect(res.reason).toBe("ok");
    expect(res.crop_detected).toBe("Wheat");
    expect(res.confidence).toBeCloseTo(0.65, 5);
    expect(res.fallback).toBe(true);
  });

  it("verifies full metadata and rejects excessively dark images via metadata cv analysis", () => {
    const darkRes = heuristicGate(bigJpegDataUrl(), "Wheat", "normal", {
      cvAnalysis: { luma: 5, greenPct: 2 },
    });
    expect(darkRes.usable).toBe(false);
    expect(darkRes.reason).toBe("too_dark");

    const validMetaRes = heuristicGate(bigJpegDataUrl(), "Wheat", "normal", {
      lat: 28.6139,
      lon: 77.209,
      accuracyM: 4.2,
      cvAnalysis: { luma: 140, greenPct: 65, blurScore: 120 },
      farmerObservation: "Yellow rust lesions on upper wheat foliage",
    });
    expect(validMetaRes.usable).toBe(true);
    expect(validMetaRes.metadata_verified).toBe(true);
    expect(validMetaRes.peril_match).toBe(true);
  });

  it("geminiGate is a no-op returning null when no API key is configured", async () => {
    process.env.GEMINI_API_KEY = "";
    process.env.GOOGLE_API_KEY = "";
    let fetched = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetched = true;
      throw new Error("network must not be called in tests");
    }) as typeof fetch;
    try {
      await expect(geminiGate(bigJpegDataUrl(), "wide_field", "Wheat", "normal")).resolves.toBeNull();
      expect(fetched).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
