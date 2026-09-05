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

const SEEN_NOTICES_CAP = 200;

export function markSeen(claimId: string): void {
  if (typeof window === "undefined") return;
  try {
    const seen = loadSeenNotices().filter((id) => id !== claimId);
    seen.push(claimId);
    const trimmed = seen.length > SEEN_NOTICES_CAP ? seen.slice(seen.length - SEEN_NOTICES_CAP) : seen;
    localStorage.setItem(SEEN_RECAPTURE_NOTICES_KEY, JSON.stringify(trimmed));
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
