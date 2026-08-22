import { describe, expect, it } from "vitest";
import { computeEvidencePreview, isRealSha256 } from "../src/lib/evidence";

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
