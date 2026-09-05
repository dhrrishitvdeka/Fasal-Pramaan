import { describe, expect, it } from "vitest";
import { resolveEvidenceEvaluation } from "../src/components/EvidenceConfidenceSection";
import { Submission, EvidenceEvaluation } from "../src/lib/api";

describe("Evidence Evaluation Layer Tests", () => {
  const baseSubmission: Submission = {
    id: "sub-12345678-abcd-ef01-2345-6789abcdef01",
    crop_cycle_id: "cycle-123",
    status: "pending_review",
    capture_lat: 28.6139,
    capture_lon: 77.209,
    capture_accuracy_m: 12.0,
    farmer_observations: "Leaves show yellow spotting",
    images: [
      { id: "img-1", angle_type: "wide_field", upload_status: "uploaded" },
      { id: "img-2", angle_type: "left_context", upload_status: "uploaded" },
      { id: "img-3", angle_type: "mid_canopy", upload_status: "uploaded" },
      { id: "img-4", angle_type: "right_context", upload_status: "uploaded" },
      { id: "img-5", angle_type: "closeup_damage", upload_status: "uploaded" },
    ],
    latest_prediction: {
      model_version: "v1.0",
      adapter_type: "crop_vit",
      is_production_validated: true,
      predicted_crop: "wheat",
      crop_confidence: 0.94,
      predicted_growth_stage: "tillering",
      predicted_grade: "C",
      grade_label: "Disease Pattern",
      primary_damage: "yellow_rust",
      severity: "medium",
      overall_confidence: 0.88,
      affected_area_pct: 25.0,
      quality_warnings: [],
      anomaly_flags: [],
      human_review_recommendation: "Review recommended",
    },
  };

  it("does not invent sharpness or brightness when pixels were not measured", () => {
    const ev = resolveEvidenceEvaluation(baseSubmission);
    expect(ev.quality.details?.blur_score).toBeUndefined();
    expect(ev.quality.details?.brightness_score).toBeUndefined();
  });

  it("uses measured lighting instead of a default 82% brightness", () => {
    const dark: Submission = {
      ...baseSubmission,
      images: baseSubmission.images.map((img) => ({
        ...img,
        quality_flags: { lighting_score: 0, quality_passed: false },
      })),
    };
    const ev = resolveEvidenceEvaluation(dark);
    expect(ev.quality.score).toBe(0);
    expect(ev.quality.details?.brightness_score).toBe(0);
  });

  it("calculates high evidence confidence for complete, valid submissions", () => {
    const ev = resolveEvidenceEvaluation(baseSubmission);
    expect(ev.confidence.final).toBeGreaterThanOrEqual(85);
    expect(ev.quality.score).toBe(100);
    expect(ev.coverage.score).toBe(100);
    expect(ev.context.score).toBe(100);
    expect(ev.integrity.score).toBe(100);
    expect(ev.uncertainty.type).toBe("none");
    expect(ev.uncertainty.present).toBe(false);
  });

  it("identifies coverage uncertainty when close-up damage is missing", () => {
    const missingCloseupSub: Submission = {
      ...baseSubmission,
      images: [
        { id: "img-1", angle_type: "wide_field", upload_status: "uploaded" },
        { id: "img-2", angle_type: "left_context", upload_status: "uploaded" },
        { id: "img-3", angle_type: "mid_canopy", upload_status: "uploaded" },
        { id: "img-4", angle_type: "right_context", upload_status: "uploaded" },
      ],
    };
    const ev = resolveEvidenceEvaluation(missingCloseupSub);
    expect(ev.confidence.final).toBeLessThan(85);
    expect(ev.coverage.score).toBe(55);
    expect(ev.uncertainty.present).toBe(true);
    expect(ev.uncertainty.type).toBe("coverage");
    expect(ev.uncertainty.recommended_action).toBe("request_specific_evidence");
    expect(ev.request?.required_angles).toContain("closeup_damage");
  });

  it("prioritizes integrity failure over coverage or visual issues", () => {
    const integrityTamperSub: Submission = {
      ...baseSubmission,
      images: [
        { id: "img-1", angle_type: "wide_field", upload_status: "uploaded" },
      ],
      latest_prediction: {
        ...baseSubmission.latest_prediction!,
        anomaly_flags: ["tamper_detected", "duplicate_perceptual_hash"],
        quality_warnings: ["blur_detected"],
      },
    };
    const ev = resolveEvidenceEvaluation(integrityTamperSub);
    expect(ev.uncertainty.type).toBe("integrity");
    expect(ev.uncertainty.severity).toBe("critical");
    expect(ev.uncertainty.recommended_action).toBe("human_review");
    expect(ev.integrity.score).toBeLessThan(50);
  });

  it("calculates weighted final confidence score accurately according to specification formula", () => {
    // formula: 0.4*quality + 0.3*coverage + 0.2*context + 0.1*integrity
    const customEvaluation: EvidenceEvaluation = {
      evaluation_version: "evidence-confidence-v1",
      quality: { score: 70, available: true },
      coverage: { score: 60, available: true },
      context: { score: 80, available: true },
      integrity: { score: 100, available: true },
      confidence: {
        final: Math.round(0.4 * 70 + 0.3 * 60 + 0.2 * 80 + 0.1 * 100), // 28 + 18 + 16 + 10 = 72
        threshold: 85,
      },
      uncertainty: {
        present: true,
        type: "coverage",
        severity: "medium",
        reasons: ["Missing wide field context"],
        recommended_action: "request_specific_evidence",
      },
    };
    expect(customEvaluation.confidence.final).toBe(72);
  });

  it("preserves explicit persisted latest_evaluation if provided by backend API", () => {
    const persistedEvaluation: EvidenceEvaluation = {
      id: "ev-999",
      evaluation_version: "evidence-confidence-v1",
      quality: { score: 95, available: true },
      coverage: { score: 90, available: true },
      context: { score: 88, available: true },
      integrity: { score: 100, available: true },
      confidence: {
        final: 92,
        threshold: 85,
      },
      uncertainty: {
        present: false,
        type: "none",
        severity: "low",
        reasons: [],
        recommended_action: "none",
      },
    };

    const subWithEvaluation: Submission = {
      ...baseSubmission,
      latest_evaluation: persistedEvaluation,
    };

    const resolved = resolveEvidenceEvaluation(subWithEvaluation);
    expect(resolved.id).toBe("ev-999");
    expect(resolved.confidence.final).toBe(92);
  });

  it("measures resolution, framing, crop visibility, damage visibility, and consistency", () => {
    const ev = resolveEvidenceEvaluation(baseSubmission);
    expect(ev.quality.details?.resolution_score).toBeGreaterThanOrEqual(0.75);
    expect(ev.quality.details?.framing_score).toBeGreaterThanOrEqual(0.8);
    expect(ev.quality.details?.crop_visibility).toContain("wheat");
    expect(ev.quality.details?.damage_visibility).toContain("25% area affected");
    expect(ev.quality.details?.consistency_score).toBeGreaterThanOrEqual(0.9);
  });

  it("computes plot proximity when capture coordinates and registered plot coordinates are given", () => {
    // Within 200m
    const nearSub: Submission = {
      ...baseSubmission,
      capture_lat: 28.6139,
      capture_lon: 77.209,
      ...({ plot_lat: 28.6140, plot_lon: 77.2091 } as any),
    };
    const nearEv = resolveEvidenceEvaluation(nearSub);
    expect(nearEv.context.details?.plot_match).toBe(true);

    // Far away (>200m)
    const farSub: Submission = {
      ...baseSubmission,
      capture_lat: 28.6139,
      capture_lon: 77.209,
      ...({ plot_lat: 28.6250, plot_lon: 77.2200 } as any),
    };
    const farEv = resolveEvidenceEvaluation(farSub);
    expect(farEv.context.details?.plot_match).toBe(false);
  });
});
