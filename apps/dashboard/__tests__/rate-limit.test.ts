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

  it("bypasses rate limits when not in production and not explicitly enabled", () => {
    const key = "route:test-user";
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(key, 2)).toEqual({ ok: true });
    }
  });

  it("allows up to max calls then blocks within the window when enforced, resetting after it elapses", () => {
    const key = "route:user-a";
    expect(checkRateLimit(key, 2, 60_000, true)).toEqual({ ok: true });
    vi.advanceTimersByTime(10_000);
    expect(checkRateLimit(key, 2, 60_000, true)).toEqual({ ok: true });

    const blocked = checkRateLimit(key, 2, 60_000, true);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
    }

    vi.advanceTimersByTime(61_000);
    expect(checkRateLimit(key, 2, 60_000, true)).toEqual({ ok: true });
  });

  it("keeps forced auth limits on even when DISABLE_RATE_LIMIT is set", () => {
    const previous = process.env.DISABLE_RATE_LIMIT;
    process.env.DISABLE_RATE_LIMIT = "true";
    const key = `auth-forced:${Date.now()}`;
    expect(checkRateLimit(key, 1, 60_000, true)).toEqual({ ok: true });
    expect(checkRateLimit(key, 1, 60_000, true).ok).toBe(false);
    if (previous === undefined) delete process.env.DISABLE_RATE_LIMIT;
    else process.env.DISABLE_RATE_LIMIT = previous;
  });

  it("isolates different keys so one exhausted bucket never blocks another when enforced", () => {
    expect(checkRateLimit("route:key-x", 1, 60_000, true)).toEqual({ ok: true });
    expect(checkRateLimit("route:key-x", 1, 60_000, true).ok).toBe(false);

    expect(checkRateLimit("route:key-y", 1, 60_000, true)).toEqual({ ok: true });
  });
});
