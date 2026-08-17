import { describe, expect, it } from "vitest";
import { computeEvidencePreview, isRealSha256 } from "../src/lib/evidence";

describe("honest evidence preview", () => {
  it("scores coverage from usable captured angles only", () => {
    const preview = computeEvidencePreview([
      { imageUrl: "data:image/jpeg;base64,xx", qualityPassed: true },
      { imageUrl: "data:image/jpeg;base64,yy", qualityPassed: true },
    ]);
    expect(preview.coverageScore).toBe(40);
    expect(preview.qualityScore).toBe(0);
    expect(preview.integrityScore).toBe(0);
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
