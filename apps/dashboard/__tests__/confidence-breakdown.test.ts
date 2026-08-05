import { describe, expect, it } from "vitest";

describe("AI Confidence Calculation & Angle Quality Helpers", () => {
  const REQUIRED_ANGLES = [
    "wide_field",
    "left_context",
    "mid_canopy",
    "right_context",
    "closeup_damage",
  ];

  function calculateAngleCoverage(images?: Array<{ angle_type?: string; upload_status?: string }>) {
    const safeImages = Array.isArray(images) ? images : [];
    const uploaded = new Set(
      safeImages
        .filter((img) => img?.upload_status === "uploaded")
        .map((img) => img?.angle_type)
        .filter(Boolean)
    );
    const count = REQUIRED_ANGLES.filter((angle) => uploaded.has(angle)).length;
    return {
      count,
      total: REQUIRED_ANGLES.length,
      pct: Math.round((count / REQUIRED_ANGLES.length) * 100),
    };
  }

  function getConfidenceTier(confidence: number) {
    if (confidence >= 0.7) return "high";
    if (confidence >= 0.55) return "moderate";
    return "low_abstain";
  }

  it("calculates 100% angle coverage when all 5 required angles are uploaded", () => {
    const images = REQUIRED_ANGLES.map((angle) => ({
      angle_type: angle,
      upload_status: "uploaded",
    }));
    const res = calculateAngleCoverage(images);
    expect(res.count).toBe(5);
    expect(res.pct).toBe(100);
  });

  it("calculates partial angle coverage correctly", () => {
    const images = [
      { angle_type: "wide_field", upload_status: "uploaded" },
      { angle_type: "left_context", upload_status: "uploaded" },
      { angle_type: "mid_canopy", upload_status: "pending" }, // not uploaded yet
    ];
    const res = calculateAngleCoverage(images);
    expect(res.count).toBe(2);
    expect(res.pct).toBe(40);
  });

  it("handles empty or undefined image arrays gracefully", () => {
    expect(calculateAngleCoverage(undefined).count).toBe(0);
    expect(calculateAngleCoverage([]).pct).toBe(0);
  });

  it("categorizes confidence thresholds correctly", () => {
    expect(getConfidenceTier(0.85)).toBe("high");
    expect(getConfidenceTier(0.62)).toBe("moderate");
    expect(getConfidenceTier(0.48)).toBe("low_abstain");
  });
});
