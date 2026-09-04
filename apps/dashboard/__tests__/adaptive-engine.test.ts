import { describe, expect, it } from "vitest";
import { adaptiveConfidence } from "../src/lib/context/adaptive-engine";
import type { ContextSignal } from "../src/lib/context/types";

function sig(
  source: ContextSignal["source"],
  status: ContextSignal["status"],
  meta?: Record<string, unknown>,
): ContextSignal {
  return {
    source,
    status,
    labelEn: source,
    labelHi: source,
    summaryEn: `${source} ${status}`,
    summaryHi: `${source} ${status}`,
    meta,
    checkedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("adaptive engine", () => {
  const base = { quality: 80, coverage: 100, context: 60, integrity: 90 };

  it("proceeds at high when overall clears threshold with coverage >= 60 and quality >= 40", () => {
    const res = adaptiveConfidence({ ...base, overall: 90, peril: "normal" });
    expect(res.level).toBe("high");
    expect(res.nextStep).toBe("proceed");
    expect(res.threshold).toBe(85);
    expect(res.reasons.join(" ")).toMatch(/threshold/i);
  });

  it("forces retake when the authenticity gate failed regardless of scores", () => {
    const res = adaptiveConfidence({
      ...base,
      overall: 99,
      peril: "normal",
      gateFailed: true,
      missingAngles: ["photo_1"],
    });
    expect(res.level).toBe("low");
    expect(res.nextStep).toBe("retake");
    expect(res.missingAngles).toEqual(["photo_1"]);
    expect(res.reasons.join(" ")).toMatch(/gate/i);
  });

  it("escalates to a human when integrity drops below 50", () => {
    const res = adaptiveConfidence({
      ...base,
      integrity: 30,
      overall: 99,
      peril: "normal",
      missingAngles: ["photo_1"],
    });
    expect(res.level).toBe("low");
    expect(res.nextStep).toBe("escalate_to_human");
    expect(res.missingAngles).toEqual([]);
    expect(res.reasons.join(" ")).toMatch(/integrity/i);
  });

  it("forces retake when duplicateDetected is true", () => {
    const res = adaptiveConfidence({
      ...base,
      integrity: 35,
      overall: 70,
      peril: "normal",
      duplicateDetected: true,
      missingAngles: ["photo_2"],
    });
    expect(res.level).toBe("low");
    expect(res.nextStep).toBe("retake");
    expect(res.reasons.join(" ")).toMatch(/duplicate/i);
  });

  it("holds fire_burn at medium/proceed when photos are complete but Sentinel burn-scar is unavailable", () => {
    const res = adaptiveConfidence({
      ...base,
      overall: 90,
      peril: "fire_burn",
      signals: [sig("sentinel", "unavailable")],
      missingAngles: [],
    });
    expect(res.level).toBe("medium");
    expect(res.nextStep).toBe("proceed");
    expect(res.reasons.join(" ")).toMatch(/satellite/i);
  });

  it("requests missing angles for fire_burn when photos are incomplete and Sentinel is unavailable", () => {
    const res = adaptiveConfidence({
      ...base,
      overall: 90,
      peril: "fire_burn",
      signals: [sig("sentinel", "unavailable")],
      missingAngles: ["photo_1"],
    });
    expect(res.level).toBe("medium");
    expect(res.nextStep).toBe("request_missing");
    expect(res.missingAngles).toEqual(["photo_1"]);
  });

  it("proceeds for animal_damage when GPS is unavailable but every required angle was captured", () => {
    const res = adaptiveConfidence({
      ...base,
      overall: 76,
      peril: "animal_damage",
      signals: [sig("imd", "available", { rainfall_7d_mm: 4 })],
      missingAngles: [],
    });
    // B2 regression: request_missing with zero missing angles is never returned.
    expect(res.level).toBe("medium");
    expect(res.nextStep).toBe("proceed");
    expect(res.missingAngles).toEqual([]);
  });

  it("keeps request_missing for animal_damage when a required angle is genuinely absent", () => {
    const res = adaptiveConfidence({
      ...base,
      overall: 76,
      peril: "animal_damage",
      signals: [sig("imd", "available", { rainfall_7d_mm: 4 })],
      missingAngles: ["photo_1"],
    });
    expect(res.level).toBe("medium");
    expect(res.nextStep).toBe("request_missing");
    expect(res.missingAngles).toEqual(["photo_1"]);
  });

  it("never requests missing angles for animal_damage when only optional angles are absent", () => {
    // animal_damage requires photo_1/photo_2/photo_3; extra unneeded angles are ignored.
    const res = adaptiveConfidence({
      ...base,
      overall: 76,
      peril: "animal_damage",
      signals: [sig("imd", "available", { rainfall_7d_mm: 4 })],
      missingAngles: ["extra_unsupported_view"],
    });
    expect(res.level).toBe("medium");
    expect(res.nextStep).toBe("proceed");
    expect(res.missingAngles).toEqual([]);
  });

  it("proceeds instead of requesting missing angles in the medium band when everything required arrived", () => {
    // overall 70 sits below the normal threshold (85) but inside the threshold-20 medium band.
    const res = adaptiveConfidence({
      ...base,
      overall: 70,
      peril: "normal",
      missingAngles: [],
    });
    expect(res.level).toBe("medium");
    expect(res.nextStep).toBe("proceed");
    expect(res.missingAngles).toEqual([]);
  });

  it("filters reported missing angles down to the peril's required set only", () => {
    // Perils require the 3 evidence photos; extra angles are filtered out.
    const res = adaptiveConfidence({
      quality: 60,
      coverage: 50,
      context: 60,
      integrity: 90,
      overall: 80,
      peril: "fire_burn",
      signals: [sig("sentinel", "available")],
      missingAngles: ["photo_1", "extra_unsupported_view"],
    });
    expect(res.missingAngles).toEqual(["photo_1"]);
    expect(res.level).toBe("medium");
    expect(res.nextStep).toBe("request_missing");
    expect(res.reasons.join(" ")).toContain("photo_1");
  });
});
