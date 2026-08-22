import { describe, expect, it } from "vitest";
import { analyticsFromClaims } from "../src/lib/web-db";
import type { FarmerClaim } from "../src/lib/farmerStore";

function claim(partial: Partial<FarmerClaim> & { id: string }): FarmerClaim {
  return {
    plotId: "",
    plotName: "",
    plotNameHi: "",
    khasraNumber: "",
    cropType: "",
    cropTypeHi: "",
    cropVariety: "",
    status: "under_review",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    farmerObservations: "",
    images: [],
    evidenceTrust: {
      qualityScore: 0,
      coverageScore: 0,
      contextScore: 0,
      integrityScore: 0,
      overallConfidence: 0,
    },
    aiPrediction: {
      cropIdentified: "",
      cropConfidence: 0,
      diseaseDetected: "",
      diseaseDetectedHi: "",
      severityPercentage: 0,
      severityGrade: "Low",
      affectedAreaHectares: 0,
      estimatedLossInr: 0,
      modelConfidence: 0,
    },
    ...partial,
  } as FarmerClaim;
}

describe("analyticsFromClaims byPeril", () => {
  it("groups by peril with avg confidence rounded to 1dp and recapture rate", () => {
    const analytics = analyticsFromClaims([
      claim({ id: "c1", peril: "hailstorm", status: "needs_recapture" }),
      claim({ id: "c2", peril: "hailstorm", status: "verified" }),
      claim({ id: "c3", status: "under_review" }),
    ]);
    expect(analytics.byPeril).toEqual([
      { peril: "hailstorm", count: 2, avgConfidence: 0.0, recaptureRate: 0.5 },
      { peril: "normal", count: 1, avgConfidence: 0.0, recaptureRate: 0 },
    ]);
  });

  it("rounds average confidence to one decimal place", () => {
    const analytics = analyticsFromClaims([
      claim({ id: "a", peril: "flood" }),
      claim({ id: "b", peril: "flood", evidenceTrust: { qualityScore: 0, coverageScore: 0, contextScore: 0, integrityScore: 0, overallConfidence: 77.77 } }),
    ]);
    expect(analytics.byPeril[0].avgConfidence).toBe(38.9);
  });

  it("defaults missing peril to normal", () => {
    const analytics = analyticsFromClaims([claim({ id: "x" })]);
    expect(analytics.byPeril.map((p) => p.peril)).toEqual(["normal"]);
  });
});
