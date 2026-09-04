import { describe, expect, it } from "vitest";
import {
  computeAngleCoverage,
  computeDHashFromImageData,
  computeEvidencePreview,
  detectDuplicateImages,
  hammingDistance,
  isRealSha256,
} from "../src/lib/evidence";

describe("computeAngleCoverage (B10 unified scoring)", () => {
  it("counts distinct usable required photos and reports missing", () => {
    const res = computeAngleCoverage([
      { angleType: "photo_1", imageUrl: "data:image/jpeg;base64,x", qualityPassed: true },
      // duplicate frame of the same angle must not double-count
      { angleType: "photo_1", imageUrl: "data:image/jpeg;base64,y", qualityPassed: true },
      // explicitly failed quality → unusable
      { angleType: "photo_3", imageUrl: "data:image/jpeg;base64,z", qualityPassed: false },
      // no image at all → absent
      { angleType: "photo_2" },
      // presence marker (pipeline path) with unmeasured quality still counts
      { angleType: "photo_2", present: true },
    ]);
    expect(res.covered).toBe(2);
    expect(res.total).toBe(3);
    expect(res.missing).toEqual(["photo_3"]);
  });

  it("honors route-specific required angle lists", () => {
    const res = computeAngleCoverage(
      [
        { angleType: "photo_1", imageUrl: "x" },
        { angleType: "photo_2", imageUrl: "y" },
      ],
      ["photo_1", "photo_2"],
    );
    expect(res.covered).toBe(2);
    expect(res.total).toBe(2);
    expect(res.missing).toEqual([]);
  });

  it("treats unmeasured quality as present and explicit failure as unusable", () => {
    const unmeasured = computeAngleCoverage([
      { angleType: "photo_1", imageUrl: "x", qualityPassed: undefined },
    ]);
    expect(unmeasured.covered).toBe(1);

    const failed = computeAngleCoverage([
      { angleType: "photo_1", imageUrl: "x", qualityPassed: false },
    ]);
    expect(failed.covered).toBe(0);
    // With the default 3-photo list, the single failed frame leaves all 3 slots missing.
    expect(failed.missing).toEqual([
      "photo_1",
      "photo_2",
      "photo_3",
    ]);
  });
});

describe("honest evidence preview", () => {
  it("scores coverage from usable distinct required angles only", () => {
    const preview = computeEvidencePreview([
      { angleId: "photo_1", imageUrl: "data:image/jpeg;base64,xx", qualityPassed: true },
      { angleId: "photo_2", imageUrl: "data:image/jpeg;base64,yy", qualityPassed: true },
    ]);
    expect(preview.coverageScore).toBe(67);
    expect(preview.qualityScore).toBe(0);
    expect(preview.integrityScore).toBe(0);
  });

  it("does not inflate coverage when duplicate images of the same angle are uploaded", () => {
    const preview = computeEvidencePreview([
      { angleId: "photo_1", imageUrl: "data:image/jpeg;base64,xx", qualityPassed: true },
      { angleId: "photo_1", imageUrl: "data:image/jpeg;base64,yy", qualityPassed: true },
    ]);
    // 1 distinct photo out of 3 = 33%, not 67%
    expect(preview.coverageScore).toBe(33);
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

  it("penalizes integrity score when duplicate hashes are reused across distinct angles", () => {
    const preview = computeEvidencePreview([
      {
        angleId: "wide_field",
        imageUrl: "x",
        sha256: "a".repeat(64),
      },
      {
        angleId: "closeup_damage",
        imageUrl: "y",
        sha256: "a".repeat(64),
      },
    ]);
    expect(preview.integrityScore).toBe(35);
    expect(preview.integrityNotes).toMatch(/duplicate/i);
  });

  it("gives 100% coverage for any 3 distinct clear photos without requiring rigid camera angles", () => {
    const preview = computeEvidencePreview([
      { angleId: "view_a", imageUrl: "data:image/jpeg;base64,distinct_1_payload_string_here_longer_than_fifty_chars", qualityPassed: true, blurScore: 65, lightingScore: 70 },
      { angleId: "view_b", imageUrl: "data:image/jpeg;base64,distinct_2_payload_string_here_longer_than_fifty_chars", qualityPassed: true, blurScore: 60, lightingScore: 65 },
      { angleId: "view_c", imageUrl: "data:image/jpeg;base64,distinct_3_payload_string_here_longer_than_fifty_chars", qualityPassed: true, blurScore: 70, lightingScore: 75 },
    ]);
    expect(preview.coverageScore).toBe(100);
    expect(preview.missingAngles).toEqual([]);
    expect(preview.qualityScore).toBeGreaterThan(60);
  });

  it("penalizes integrity and flags retake when exact same duplicate photo data is uploaded", () => {
    const identicalDataUrl = "data:image/jpeg;base64,identical_image_data_across_multiple_frames_test_12345";
    const preview = computeEvidencePreview([
      { angleId: "photo_1", imageUrl: identicalDataUrl, qualityPassed: true, sha256: "b".repeat(64) },
      { angleId: "photo_2", imageUrl: identicalDataUrl, qualityPassed: true, sha256: "b".repeat(64) },
    ]);
    expect(preview.integrityScore).toBe(35);
    expect(preview.integrityNotes).toMatch(/duplicate/i);
  });

  it("does not award coverage for blurry or unusable photos", () => {
    const preview = computeEvidencePreview([
      { angleId: "photo_1", imageUrl: "data:image/jpeg;base64,clear_photo_data_url_here_1", qualityPassed: true },
      { angleId: "photo_2", imageUrl: "data:image/jpeg;base64,blurry_photo_data_url_here_2", qualityPassed: false, blurScore: 5 },
      { angleId: "photo_3", imageUrl: "data:image/jpeg;base64,clear_photo_data_url_here_3", qualityPassed: true },
    ]);
    // 2 usable distinct photos out of 3 = 67%
    expect(preview.coverageScore).toBe(67);
    expect(preview.missingAngles).toEqual(["photo_2"]);
  });
});

describe("perceptual dHash and duplicate angle detection", () => {
  it("computes 16-hex perceptual difference hash from pixel data", () => {
    const width = 18;
    const height = 16;
    const pixels = new Uint8Array(width * height * 4);
    // Create horizontal luminance gradient
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const val = Math.floor((x / width) * 255);
        pixels[idx] = val;
        pixels[idx + 1] = val;
        pixels[idx + 2] = val;
        pixels[idx + 3] = 255;
      }
    }
    const hash = computeDHashFromImageData(pixels, width, height);
    expect(hash.length).toBe(16);
    expect(/^[0-9a-f]{16}$/i.test(hash)).toBe(true);
  });

  it("calculates correct hamming distance between perceptual hashes", () => {
    expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance("0000000000000001", "0000000000000003")).toBe(1);
    expect(hammingDistance("0000000000000000", "000000000000000f")).toBe(4);
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });

  it("detects duplicates when perceptual hashes are within threshold <= 6", () => {
    const dup = detectDuplicateImages([
      { angleId: "photo_1", pHash: "0000000000000000" },
      { angleId: "photo_2", pHash: "0000000000000003" }, // dist = 2 <= 6
    ]);
    expect(dup.hasDuplicates).toBe(true);
    expect(dup.duplicatePairs).toEqual([[0, 1]]);
    expect(dup.reasons[0]).toMatch(/perceptual hash/i);
  });

  it("does not flag duplicates when perceptual hashes are sufficiently different (> 6)", () => {
    const dup = detectDuplicateImages([
      { angleId: "photo_1", pHash: "0000000000000000" },
      { angleId: "photo_2", pHash: "00000000000000ff" }, // dist = 8 > 6
    ]);
    expect(dup.hasDuplicates).toBe(false);
  });

  it("detects identical multi-metric continuous CV measurements across slots", () => {
    const dup = detectDuplicateImages([
      { angleId: "photo_1", blurScore: 54, lightingScore: 68, luma: 128 },
      { angleId: "photo_2", blurScore: 54, lightingScore: 68, luma: 128 },
    ]);
    expect(dup.hasDuplicates).toBe(true);
    expect(dup.reasons[0]).toMatch(/identical sensor and CV feature signatures/i);
  });
});

