import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  diffNewRecaptures,
  loadSeenNotices,
  markSeen,
  SEEN_RECAPTURE_NOTICES_KEY,
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
    expect(markSeen("c1")).toBeUndefined();
    // seen set is empty without storage, so nothing is filtered out
    expect(diffNewRecaptures([claim({ id: "c1" })]).map((n) => n.claimId)).toEqual(["c1"]);
  });

  it("loadSeenNotices returns [] when nothing stored", () => {
    expect(loadSeenNotices()).toEqual([]);
  });

  it("loadSeenNotices survives corrupt payloads", () => {
    localStorage.setItem(SEEN_RECAPTURE_NOTICES_KEY, "{not json");
    expect(loadSeenNotices()).toEqual([]);
    localStorage.setItem(SEEN_RECAPTURE_NOTICES_KEY, JSON.stringify(["a", 3, null]));
    expect(loadSeenNotices()).toEqual(["a"]);
  });

  it("markSeen persists ids across calls", () => {
    markSeen("c1");
    markSeen("c2");
    expect(loadSeenNotices()).toEqual(["c1", "c2"]);
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
});
