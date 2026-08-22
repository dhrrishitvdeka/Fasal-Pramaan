import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "../src/lib/server/rate-limit";

describe("fixed-window rate limiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to max calls then blocks within the window, resetting after it elapses", () => {
    const key = "route:user-a";
    expect(checkRateLimit(key, 2)).toEqual({ ok: true });
    vi.advanceTimersByTime(10_000);
    expect(checkRateLimit(key, 2)).toEqual({ ok: true });

    const blocked = checkRateLimit(key, 2);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
    }

    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit(key, 2)).toEqual({ ok: true });
  });

  it("isolates different keys so one exhausted bucket never blocks another", () => {
    expect(checkRateLimit("route:key-x", 1)).toEqual({ ok: true });
    expect(checkRateLimit("route:key-x", 1).ok).toBe(false);

    expect(checkRateLimit("route:key-y", 1)).toEqual({ ok: true });
  });
});
