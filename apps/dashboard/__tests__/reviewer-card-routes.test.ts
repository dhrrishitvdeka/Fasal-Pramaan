import { describe, expect, it } from "vitest";
import {
  caseIdsForBucket,
  parseReviewerFilter,
  reviewerCardHref,
  reviewerQueueHref,
  submissionMatchesBucket,
} from "../src/lib/reviewer-card-routes";

function ev(partial: {
  final?: number;
  type?: string | null;
  action?: string | null;
  integrity?: number;
  flags?: string[];
}) {
  return {
    confidence: { final: partial.final ?? 90, threshold: 85 },
    uncertainty: {
      present: false,
      type: partial.type ?? "none",
      severity: "low" as const,
      reasons: [],
      recommended_action: partial.action ?? "none",
    },
    integrity: {
      score: partial.integrity ?? 100,
      available: true,
      details: { flags: partial.flags ?? [] },
    },
  };
}

describe("reviewer card href helper", () => {
  it("opens the single matching case and otherwise the filtered queue", () => {
    expect(reviewerCardHref("low_confidence", ["case-1"])).toBe("/review/case-1");
    expect(reviewerCardHref("integrity", ["a", "b"])).toBe("/review?filter=integrity");
    expect(reviewerCardHref("pending_review", [])).toBe("/review?filter=pending_review");
    expect(reviewerCardHref("needs_recapture", ["  "])).toBe("/review?filter=needs_recapture");
    expect(reviewerQueueHref("all")).toBe("/review");
  });

  it("classifies the four dashboard buckets from shipped matchers", () => {
    expect(submissionMatchesBucket({ status: "submitted" }, ev({ final: 40 }), "low_confidence")).toBe(true);
    expect(submissionMatchesBucket({ status: "verified" }, ev({ final: 90 }), "low_confidence")).toBe(false);
    expect(submissionMatchesBucket({ status: "submitted" }, ev({}), "pending_review")).toBe(true);
    expect(submissionMatchesBucket({ status: "needs_recapture" }, ev({}), "needs_recapture")).toBe(true);
    expect(submissionMatchesBucket({ status: "under_review" }, ev({ integrity: 40, flags: ["sha"] }), "integrity")).toBe(
      true,
    );
    const items = [
      { submission: { id: "low-1", status: "submitted" }, evaluation: ev({ final: 40 }) },
      { submission: { id: "ok-1", status: "verified" }, evaluation: ev({ final: 92 }) },
    ];
    expect(caseIdsForBucket(items, "low_confidence")).toEqual(["low-1"]);
    expect(parseReviewerFilter("integrity")).toBe("integrity");
    expect(parseReviewerFilter("nope")).toBe("all");
  });

  it("opens the single KPI recapture/integrity case even when others only have missing-angle or sha flags", () => {
    const recaptureItems = [
      { submission: { id: "recap-1", status: "needs_recapture" }, evaluation: ev({ final: 90 }) },
      {
        submission: { id: "angles-only", status: "submitted" },
        evaluation: ev({ action: "request_specific_evidence", type: "coverage" }),
      },
      {
        submission: { id: "retake-only", status: "under_review" },
        evaluation: ev({ action: "retake_image", type: "visual" }),
      },
    ];
    const recaptureIds = caseIdsForBucket(recaptureItems, "needs_recapture");
    expect(recaptureIds).toEqual(["recap-1"]);
    expect(reviewerCardHref("needs_recapture", recaptureIds)).toBe("/review/recap-1");

    const integrityItems = [
      { submission: { id: "int-1", status: "submitted" }, evaluation: ev({ integrity: 40 }) },
      {
        submission: { id: "sha-flag-only", status: "submitted" },
        evaluation: ev({ integrity: 90, flags: ["sha256_missing"], type: "integrity" }),
      },
    ];
    const integrityIds = caseIdsForBucket(integrityItems, "integrity");
    expect(integrityIds).toEqual(["int-1"]);
    expect(reviewerCardHref("integrity", integrityIds)).toBe("/review/int-1");
  });
});
