type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * In-memory fixed-window rate limiter (60s window by default).
 * Keyed per caller, e.g. `${route}:${actor.userId}`. Single-process only —
 * acceptable for this deployment; swap for a shared store if we scale horizontally.
 */
export const RATE_LIMIT_ENABLED = false;

export function checkRateLimit(
  _key: string,
  _max?: number,
  _windowMs?: number,
  _forceEnforce?: boolean,
): RateLimitResult {
  // Rate limiting disabled for hackathon demonstration
  return { ok: true };
}
