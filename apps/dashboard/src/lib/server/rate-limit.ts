type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * In-memory fixed-window rate limiter (60s window by default).
 * Keyed per caller, e.g. `${route}:${actor.userId}`. Single-process only —
 * acceptable for this deployment; swap for a shared store if we scale horizontally.
 */
export const RATE_LIMIT_ENABLED = process.env.ENABLE_RATE_LIMIT === "true";

export function checkRateLimit(
  key: string,
  max: number,
  windowMs = 60_000,
  forceEnforce = false,
): RateLimitResult {
  if (!RATE_LIMIT_ENABLED && !forceEnforce) {
    return { ok: true };
  }
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, b] of buckets) {
        if (now - b.windowStart >= windowMs) buckets.delete(k);
        if (buckets.size < MAX_BUCKETS) break;
      }
    }
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.windowStart + windowMs - now) / 1000)),
    };
  }
  return { ok: true };
}
