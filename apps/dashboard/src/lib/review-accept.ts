export type AcceptablePrediction = {
  predicted_grade?: string | null;
  primary_damage?: string | null;
  severity?: string | null;
  affected_area_pct?: number | null;
} | null | undefined;

/**
 * Reviewer Accept is allowed when integrity is intact and the screening grade
 * is not Unusable. A missing prediction (HF Space still warming / timed out)
 * does not block Accept — the model is assistive, not a settlement gate.
 */
export function predictionIsAcceptable(
  pred: AcceptablePrediction,
  integrityFailed = false,
): boolean {
  if (integrityFailed) return false;
  if (!pred) return true;
  if (pred.predicted_grade === "U") return false;
  if (
    pred.predicted_grade === "A" ||
    pred.predicted_grade === "B" ||
    pred.predicted_grade === "C"
  ) {
    return true;
  }
  return Boolean(
    pred.primary_damage &&
      pred.primary_damage !== "unknown" &&
      pred.severity &&
      pred.affected_area_pct != null,
  );
}
