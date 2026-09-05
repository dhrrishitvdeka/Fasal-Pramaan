import type { EvidenceEvaluation, Submission } from "./api";

export const REVIEWER_CARD_BUCKETS = [
  "low_confidence",
  "integrity",
  "pending_review",
  "needs_recapture",
] as const;

export type ReviewerCardBucket = (typeof REVIEWER_CARD_BUCKETS)[number];

export type ReviewerQueueFilter =
  | ReviewerCardBucket
  | "all"
  | "coverage"
  | "visual"
  | "context"
  | "verified"
  | "rejected"
  | "physical_inspection";

const QUEUE_FILTERS = new Set<string>([
  "all",
  "low_confidence",
  "integrity",
  "pending_review",
  "needs_recapture",
  "coverage",
  "visual",
  "context",
  "verified",
  "rejected",
  "physical_inspection",
]);

export function parseReviewerFilter(raw: string | null | undefined): ReviewerQueueFilter {
  const value = String(raw || "").trim();
  if (QUEUE_FILTERS.has(value)) return value as ReviewerQueueFilter;
  return "all";
}

export function reviewerQueueHref(filter: ReviewerQueueFilter): string {
  if (filter === "all") return "/review";
  return `/review?filter=${filter}`;
}

/** One matching case opens that case. Zero or many open the filtered queue — never a fake id. */
export function reviewerCardHref(bucket: ReviewerCardBucket, caseIds: readonly string[]): string {
  const ids = caseIds.map((id) => String(id || "").trim()).filter(Boolean);
  if (ids.length === 1) return `/review/${ids[0]}`;
  return reviewerQueueHref(bucket);
}

export function submissionMatchesBucket(
  submission: Pick<Submission, "status">,
  evaluation: Pick<EvidenceEvaluation, "confidence" | "uncertainty" | "integrity">,
  bucket: ReviewerQueueFilter,
): boolean {
  if (bucket === "all") return true;
  // The four overview KPI cards use the same predicates as overviewFromClaims.
  if (bucket === "low_confidence") return evaluation.confidence.final < 85;
  if (bucket === "pending_review") {
    return submission.status === "under_review" || submission.status === "submitted";
  }
  if (bucket === "needs_recapture") {
    return submission.status === "needs_recapture";
  }
  if (bucket === "verified") {
    return submission.status === "verified";
  }
  if (bucket === "rejected") {
    return submission.status === "rejected";
  }
  if (bucket === "physical_inspection") {
    return submission.status === "physical_inspection";
  }
  if (bucket === "integrity") {
    return evaluation.integrity.score < 70;
  }
  if (bucket === "coverage") return evaluation.uncertainty.type === "coverage";
  if (bucket === "visual") return evaluation.uncertainty.type === "visual";
  if (bucket === "context") return evaluation.uncertainty.type === "context";
  return false;
}

export function caseIdsForBucket(
  items: Array<{ submission: Pick<Submission, "id" | "status">; evaluation: Pick<EvidenceEvaluation, "confidence" | "uncertainty" | "integrity"> }>,
  bucket: ReviewerCardBucket,
): string[] {
  return items
    .filter((item) => submissionMatchesBucket(item.submission, item.evaluation, bucket))
    .map((item) => item.submission.id);
}
