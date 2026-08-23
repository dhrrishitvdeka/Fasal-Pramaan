export type AcceptablePrediction = {
  predicted_grade?: string | null;
  primary_damage?: string | null;
  severity?: string | null;
  affected_area_pct?: number | null;
} | null | undefined;

/** Reviewer Accept is allowed when a screening grade is present, or a complete legacy prediction exists. */
export function predictionIsAcceptable(
  pred: AcceptablePrediction,
  integrityFailed = false,
): boolean {
  if (!pred || integrityFailed) return false;
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
