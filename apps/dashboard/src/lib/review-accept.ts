export type AcceptablePrediction = {
  predicted_grade?: string | null;
  primary_damage?: string | null;
  severity?: string | null;
  affected_area_pct?: number | null;
} | null | undefined;

/**
 * Mirrors `applyReviewerAction("accept")`: integrity must hold, grade U is
 * never one-click acceptable (Correct must set A/B/C first), and a missing
 * prediction is only acceptable after an explicit gate override.
 */
export function predictionIsAcceptable(
  pred: AcceptablePrediction,
  integrityFailed = false,
  gateOverridden = false,
): boolean {
  if (integrityFailed) return false;
  if (!pred) return Boolean(gateOverridden);
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
