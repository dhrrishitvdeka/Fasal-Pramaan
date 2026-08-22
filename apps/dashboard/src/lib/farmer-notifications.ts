export type RecaptureNotice = {
  claimId: string;
  reason?: string;
  reasonHi?: string;
  missingAngles: string[];
  at: string;
};

export const SEEN_RECAPTURE_NOTICES_KEY = "fp_seen_recapture_notices_v1";

export function loadSeenNotices(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEEN_RECAPTURE_NOTICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function markSeen(claimId: string): void {
  if (typeof window === "undefined") return;
  try {
    const seen = new Set(loadSeenNotices());
    seen.add(claimId);
    localStorage.setItem(SEEN_RECAPTURE_NOTICES_KEY, JSON.stringify(Array.from(seen)));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export interface RecaptureNoticeSource {
  id: string;
  status: string;
  recaptureReason?: string;
  recaptureReasonHi?: string;
  missingAngles?: string[];
  updatedAt?: string;
}

export function diffNewRecaptures(claims: RecaptureNoticeSource[]): RecaptureNotice[] {
  const seen = new Set(loadSeenNotices());
  return claims
    .filter((claim) => claim.status === "needs_recapture" && !seen.has(claim.id))
    .map((claim) => ({
      claimId: claim.id,
      reason: claim.recaptureReason || undefined,
      reasonHi: claim.recaptureReasonHi || undefined,
      missingAngles: claim.missingAngles || [],
      at: claim.updatedAt || "",
    }))
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}
