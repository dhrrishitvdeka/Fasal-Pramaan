import { describe, expect, it } from "vitest";
import { computeAngleCoverage, computeEvidencePreview, isRealSha256 } from "../src/lib/evidence";

describe("computeAngleCoverage (B10 unified scoring)", () => {
  it("counts distinct usable required angles and reports missing in canonical order", () => {
    const res = computeAngleCoverage([
      { angleType: "wide_field", imageUrl: "data:image/jpeg;base64,x", qualityPassed: true },
      // duplicate frame of the same angle must not double-count
      { angleType: "wide_field", imageUrl: "data:image/jpeg;base64,y", qualityPassed: true },
      // explicitly failed quality → unusable
      { angleType: "closeup_damage", imageUrl: "data:image/jpeg;base64,z", qualityPassed: false },
      // no image at all → absent
      { angleType: "mid_canopy" },
      // presence marker (pipeline path) with unmeasured quality still counts
      { angleType: "left_context", present: true },
    ]);
    expect(res.covered).toBe(2);
    expect(res.total).toBe(5);
    expect(res.missing).toEqual(["mid_canopy", "right_context", "closeup_damage"]);
  });

  it("honors route-specific required angle lists", () => {
    const res = computeAngleCoverage(
      [
        { angleType: "wide_field", imageUrl: "x" },
        { angleType: "closeup_damage", imageUrl: "y" },
      ],
      ["wide_field", "closeup_damage"],
    );
    expect(res.covered).toBe(2);
    expect(res.total).toBe(2);
    expect(res.missing).toEqual([]);
  });

  it("treats unmeasured quality as present and explicit failure as unusable", () => {
    const unmeasured = computeAngleCoverage([
      { angleType: "wide_field", imageUrl: "x", qualityPassed: undefined },
    ]);
    expect(unmeasured.covered).toBe(1);

    const failed = computeAngleCoverage([
      { angleType: "wide_field", imageUrl: "x", qualityPassed: false },
    ]);
    expect(failed.covered).toBe(0);
    // With the default 5-angle list, the single failed frame leaves every angle missing.
    expect(failed.missing).toEqual([
      "wide_field",
      "left_context",
      "mid_canopy",
      "right_context",
      "closeup_damage",
    ]);
  });
});

describe("honest evidence preview", () => {
  it("scores coverage from usable distinct required angles only", () => {
    const preview = computeEvidencePreview([
      { angleId: "wide_field", imageUrl: "data:image/jpeg;base64,xx", qualityPassed: true },
      { angleId: "closeup_damage", imageUrl: "data:image/jpeg;base64,yy", qualityPassed: true },
    ]);
    expect(preview.coverageScore).toBe(40);
    expect(preview.qualityScore).toBe(0);
    expect(preview.integrityScore).toBe(0);
  });

  it("does not inflate coverage when duplicate images of the same angle are uploaded", () => {
    const preview = computeEvidencePreview([
      { angleId: "wide_field", imageUrl: "data:image/jpeg;base64,xx", qualityPassed: true },
      { angleId: "wide_field", imageUrl: "data:image/jpeg;base64,yy", qualityPassed: true },
    ]);
    // 1 distinct angle out of 5 = 20%, not 40%
    expect(preview.coverageScore).toBe(20);
  });

  it("uses measured lighting and does not invent a hash", () => {
    const preview = computeEvidencePreview([
      {
        imageUrl: "x",
        qualityPassed: true,
        lightingScore: 70,
        sha256: "not-a-hash",
        lat: 27.8,
        lon: 76.2,
        accuracyM: 8,
      },
    ]);
    expect(preview.qualityScore).toBe(70);
    expect(preview.integrityScore).toBe(0);
    expect(preview.contextScore).toBe(100);
    expect(isRealSha256("not-a-hash")).toBe(false);
    expect(isRealSha256("a".repeat(64))).toBe(true);
  });
});
