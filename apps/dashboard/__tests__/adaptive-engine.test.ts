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
      missingAngles: ["wide_field"],
    });
    expect(res.level).toBe("low");
    expect(res.nextStep).toBe("retake");
    expect(res.missingAngles).toEqual(["wide_field"]);
    expect(res.reasons.join(" ")).toMatch(/gate/i);
  });

  it("escalates to a human when integrity drops below 50", () => {
    const res = adaptiveConfidence({
      ...base,
      integrity: 30,
      overall: 99,
      peril: "normal",
      missingAngles: ["wide_field"],
    });
    expect(res.level).toBe("low");
    expect(res.nextStep).toBe("escalate_to_human");
    expect(res.missingAngles).toEqual([]);
    expect(res.reasons.join(" ")).toMatch(/integrity/i);
  });

  it("holds fire_burn at medium/request_missing until Sentinel burn-scar is available", () => {
    const res = adaptiveConfidence({
      ...base,
      overall: 90,
      peril: "fire_burn",
      signals: [sig("sentinel", "unavailable")],
    });
    expect(res.level).toBe("medium");
    expect(res.nextStep).toBe("request_missing");
    expect(res.reasons.join(" ")).toMatch(/satellite/i);
  });

  it("asks animal_damage farmers for a GPS trail when the gps signal is missing", () => {
    const res = adaptiveConfidence({
      ...base,
      overall: 76,
      peril: "animal_damage",
      signals: [sig("imd", "available", { rainfall_7d_mm: 4 })],
    });
    expect(res.level).toBe("medium");
    expect(res.nextStep).toBe("request_missing");
    expect(res.missingAngles).toEqual(["__gps__"]);
  });

  it("filters reported missing angles down to the peril's required set only", () => {
    // fire_burn requires wide_field + closeup_damage; left_context is not required.
    const res = adaptiveConfidence({
      quality: 60,
      coverage: 50,
      context: 60,
      integrity: 90,
      overall: 80,
      peril: "fire_burn",
      signals: [sig("sentinel", "available")],
      missingAngles: ["wide_field", "left_context"],
    });
    expect(res.missingAngles).toEqual(["wide_field"]);
    expect(res.level).toBe("medium");
    expect(res.nextStep).toBe("request_missing");
    expect(res.reasons.join(" ")).toContain("wide_field");
  });
});
