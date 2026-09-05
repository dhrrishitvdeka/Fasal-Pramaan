import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  diffNewPayoutApprovals,
  diffNewRecaptures,
  diffNewRejections,
  loadSeenNotices,
  loadSeenPayoutNotices,
  loadSeenRejectionNotices,
  markPayoutSeen,
  markRejectionSeen,
  markSeen,
  SEEN_PAYOUT_NOTICES_KEY,
  SEEN_RECAPTURE_NOTICES_KEY,
  SEEN_REJECTION_NOTICES_KEY,
} from "../src/lib/farmer-notifications";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

function claim(partial: {
  id: string;
  status?: string;
  recaptureReason?: string;
  recaptureReasonHi?: string;
  missingAngles?: string[];
  updatedAt?: string;
}) {
  return { status: "needs_recapture", ...partial };
}

function payoutClaim(partial: {
  id: string;
  status?: string;
  payoutStatus?: string | null;
  payoutAmountInr?: number | null;
  plotName?: string | null;
  plotNameHi?: string | null;
  cropType?: string | null;
  cropTypeHi?: string | null;
  aiPrediction?: { estimatedLossInr?: number | null } | null;
  updatedAt?: string;
  createdAt?: string;
}) {
  return {
    status: "verified",
    payoutStatus: "approved",
    payoutAmountInr: 25000,
    plotName: "North Wheat Plot",
    cropType: "Wheat",
    ...partial,
  };
}

function rejectedClaim(partial: {
  id: string;
  status?: string;
  payoutStatus?: string | null;
  reviewerNotes?: string | null;
  plotName?: string | null;
  plotNameHi?: string | null;
  cropType?: string | null;
  cropTypeHi?: string | null;
  updatedAt?: string;
  createdAt?: string;
}) {
  return {
    status: "rejected",
    payoutStatus: "rejected",
    reviewerNotes: "Non-agricultural subject detected",
    plotName: "West Paddy Field",
    cropType: "Paddy",
    ...partial,
  };
}

describe("farmer-notifications", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    const storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("degrades gracefully without window (SSR guard)", () => {
    vi.unstubAllGlobals();
    expect(loadSeenNotices()).toEqual([]);
    expect(loadSeenPayoutNotices()).toEqual([]);
    expect(markSeen("c1")).toBeUndefined();
    expect(markPayoutSeen("c1")).toBeUndefined();
    // seen set is empty without storage, so nothing is filtered out
    expect(diffNewRecaptures([claim({ id: "c1" })]).map((n) => n.claimId)).toEqual(["c1"]);
    expect(diffNewPayoutApprovals([payoutClaim({ id: "c1" })]).map((n) => n.claimId)).toEqual(["c1"]);
  });

  it("loadSeenNotices returns [] when nothing stored", () => {
    expect(loadSeenNotices()).toEqual([]);
    expect(loadSeenPayoutNotices()).toEqual([]);
  });

  it("loadSeenNotices survives corrupt payloads", () => {
    localStorage.setItem(SEEN_RECAPTURE_NOTICES_KEY, "{not json");
    expect(loadSeenNotices()).toEqual([]);
    localStorage.setItem(SEEN_RECAPTURE_NOTICES_KEY, JSON.stringify(["a", 3, null]));
    expect(loadSeenNotices()).toEqual(["a"]);

    localStorage.setItem(SEEN_PAYOUT_NOTICES_KEY, "{not json");
    expect(loadSeenPayoutNotices()).toEqual([]);
    localStorage.setItem(SEEN_PAYOUT_NOTICES_KEY, JSON.stringify(["b", 4, null]));
    expect(loadSeenPayoutNotices()).toEqual(["b"]);
  });

  it("markSeen and markPayoutSeen persist ids across calls", () => {
    markSeen("c1");
    markSeen("c2");
    expect(loadSeenNotices()).toEqual(["c1", "c2"]);

    markPayoutSeen("p1");
    markPayoutSeen("p2");
    expect(loadSeenPayoutNotices()).toEqual(["p1", "p2"]);
  });

  it("diffNewRecaptures keeps only unseen needs_recapture claims, newest first", () => {
    markSeen("seen-claim");
    const notices = diffNewRecaptures([
      claim({ id: "old", updatedAt: "2026-01-01T00:00:00Z" }),
      claim({ id: "newer", updatedAt: "2026-03-01T00:00:00Z" }),
      claim({ id: "seen-claim", updatedAt: "2026-04-01T00:00:00Z" }),
      claim({ id: "verified", status: "verified", updatedAt: "2026-05-01T00:00:00Z" }),
    ]);
    expect(notices.map((n) => n.claimId)).toEqual(["newer", "old"]);
  });

  it("diffNewRecaptures carries reason and missing angles", () => {
    const [notice] = diffNewRecaptures([
      claim({
        id: "c1",
        recaptureReason: "Blurry closeup",
        recaptureReasonHi: "धुंधली तस्वीर",
        missingAngles: ["closeup_damage"],
        updatedAt: "2026-01-02T00:00:00Z",
      }),
    ]);
    expect(notice.reason).toBe("Blurry closeup");
    expect(notice.reasonHi).toBe("धुंधली तस्वीर");
    expect(notice.missingAngles).toEqual(["closeup_damage"]);
    expect(notice.at).toBe("2026-01-02T00:00:00Z");
  });

  it("dismissed claims disappear after markSeen", () => {
    expect(diffNewRecaptures([claim({ id: "c9" })]).map((n) => n.claimId)).toEqual(["c9"]);
    markSeen("c9");
    expect(diffNewRecaptures([claim({ id: "c9" })])).toEqual([]);
  });

  it("diffNewPayoutApprovals keeps only unseen approved/verified claims, newest first", () => {
    markPayoutSeen("seen-payout");
    const notices = diffNewPayoutApprovals([
      payoutClaim({ id: "p-old", updatedAt: "2026-01-01T00:00:00Z" }),
      payoutClaim({ id: "p-newer", updatedAt: "2026-03-01T00:00:00Z" }),
      payoutClaim({ id: "seen-payout", updatedAt: "2026-04-01T00:00:00Z" }),
      payoutClaim({ id: "rejected", status: "rejected", payoutStatus: "rejected", updatedAt: "2026-05-01T00:00:00Z" }),
    ]);
    expect(notices.map((n) => n.claimId)).toEqual(["p-newer", "p-old"]);
  });

  it("diffNewPayoutApprovals resolves amount from payoutAmountInr or fallback aiPrediction", () => {
    const [notice1] = diffNewPayoutApprovals([
      payoutClaim({
        id: "p1",
        payoutAmountInr: 45000,
        plotName: "Plot 1",
        plotNameHi: "खेत 1",
        cropType: "Wheat",
        cropTypeHi: "गेहूं",
      }),
    ]);
    expect(notice1.payoutAmountInr).toBe(45000);
    expect(notice1.plotNameHi).toBe("खेत 1");
    expect(notice1.cropTypeHi).toBe("गेहूं");

    const [notice2] = diffNewPayoutApprovals([
      payoutClaim({
        id: "p2",
        payoutAmountInr: null,
        aiPrediction: { estimatedLossInr: 32000 },
      }),
    ]);
    expect(notice2.payoutAmountInr).toBe(32000);
  });

  it("dismissed payout claims disappear after markPayoutSeen", () => {
    expect(diffNewPayoutApprovals([payoutClaim({ id: "p-test" })]).map((n) => n.claimId)).toEqual(["p-test"]);
    markPayoutSeen("p-test");
    expect(diffNewPayoutApprovals([payoutClaim({ id: "p-test" })])).toEqual([]);
  });

  it("diffNewRejections surfaces rejected claims with reason, newest first", () => {
    markRejectionSeen("seen-rej");
    const notices = diffNewRejections([
      rejectedClaim({ id: "r-old", updatedAt: "2026-01-01T00:00:00Z" }),
      rejectedClaim({ id: "r-newer", updatedAt: "2026-02-01T00:00:00Z", reviewerNotes: "Screen capture detected" }),
      rejectedClaim({ id: "seen-rej", updatedAt: "2026-03-01T00:00:00Z" }),
      rejectedClaim({ id: "approved", status: "verified", payoutStatus: "approved", updatedAt: "2026-04-01T00:00:00Z" }),
    ]);
    expect(notices.map((n) => n.claimId)).toEqual(["r-newer", "r-old"]);
    expect(notices[0].reason).toBe("Screen capture detected");
  });

  it("dismissed rejected claims disappear after markRejectionSeen", () => {
    expect(diffNewRejections([rejectedClaim({ id: "r-dismiss" })]).map((n) => n.claimId)).toEqual(["r-dismiss"]);
    markRejectionSeen("r-dismiss");
    expect(diffNewRejections([rejectedClaim({ id: "r-dismiss" })])).toEqual([]);
  });
});

