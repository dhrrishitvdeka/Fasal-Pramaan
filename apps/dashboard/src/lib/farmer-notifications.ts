export type RecaptureNotice = {
  claimId: string;
  reason?: string;
  reasonHi?: string;
  missingAngles: string[];
  at: string;
};

export type PayoutNotice = {
  claimId: string;
  plotName: string;
  plotNameHi?: string;
  cropType: string;
  cropTypeHi?: string;
  payoutAmountInr: number;
  at: string;
};

export const SEEN_RECAPTURE_NOTICES_KEY = "fp_seen_recapture_notices_v1";
export const SEEN_PAYOUT_NOTICES_KEY = "fp_seen_payout_notices_v1";

const SEEN_NOTICES_CAP = 200;

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
    const seen = loadSeenNotices().filter((id) => id !== claimId);
    seen.push(claimId);
    const trimmed = seen.length > SEEN_NOTICES_CAP ? seen.slice(seen.length - SEEN_NOTICES_CAP) : seen;
    localStorage.setItem(SEEN_RECAPTURE_NOTICES_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function loadSeenPayoutNotices(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEEN_PAYOUT_NOTICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function markPayoutSeen(claimId: string): void {
  if (typeof window === "undefined") return;
  try {
    const seen = loadSeenPayoutNotices().filter((id) => id !== claimId);
    seen.push(claimId);
    const trimmed = seen.length > SEEN_NOTICES_CAP ? seen.slice(seen.length - SEEN_NOTICES_CAP) : seen;
    localStorage.setItem(SEEN_PAYOUT_NOTICES_KEY, JSON.stringify(trimmed));
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

export interface PayoutNoticeSource {
  id: string;
  status: string;
  payoutStatus?: string | null;
  payoutAmountInr?: number | null;
  plotName?: string | null;
  plotNameHi?: string | null;
  cropType?: string | null;
  cropTypeHi?: string | null;
  aiPrediction?: {
    estimatedLossInr?: number | null;
  } | null;
  updatedAt?: string;
  createdAt?: string;
}

export function diffNewPayoutApprovals(claims: PayoutNoticeSource[]): PayoutNotice[] {
  const seen = new Set(loadSeenPayoutNotices());
  return claims
    .filter(
      (claim) =>
        (claim.payoutStatus === "approved" || claim.status === "verified") &&
        claim.payoutStatus !== "rejected" &&
        !seen.has(claim.id),
    )
    .map((claim) => {
      const amount =
        typeof claim.payoutAmountInr === "number" && claim.payoutAmountInr > 0
          ? claim.payoutAmountInr
          : typeof claim.aiPrediction?.estimatedLossInr === "number" && claim.aiPrediction.estimatedLossInr > 0
            ? claim.aiPrediction.estimatedLossInr
            : 0;
      return {
        claimId: claim.id,
        plotName: claim.plotName || "Plot",
        plotNameHi: claim.plotNameHi || undefined,
        cropType: claim.cropType || "Crop",
        cropTypeHi: claim.cropTypeHi || undefined,
        payoutAmountInr: amount,
        at: claim.updatedAt || claim.createdAt || "",
      };
    })
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}
