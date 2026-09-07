"use client";

/**
 * Zero-dependency error telemetry.
 *
 * v1 scope (honest): window.onerror + unhandledrejection listeners feed a
 * 50-entry in-memory ring buffer and a `[telemetry]`-prefixed console.error.
 * Errors are forwarded to POST /api/telemetry/error ONLY when a real session
 * token exists (anonymous spam protection enforced server-side too).
 *
 * If NEXT_PUBLIC_SENTRY_DSN is set we still only console+buffer for now:
 * TODO(telemetry): slot Sentry.init({ dsn }) here when the @sentry/nextjs
 * dependency is added. The DSN is read today so the env contract is stable.
 */

const RING_SIZE = 50;

export type TelemetryError = {
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
  timestamp: string;
  source: "onerror" | "unhandledrejection";
};

type Ring = TelemetryError[];

let ring: Ring = [];
let initialized = false;

export function telemetryBuffer(): readonly TelemetryError[] {
  return ring;
}

export function telemetryInitialized(): boolean {
  return initialized;
}

function record(error: TelemetryError) {
  ring.push(error);
  if (ring.length > RING_SIZE) {
    ring = ring.slice(ring.length - RING_SIZE);
  }
  // Keep the newest at the end of the buffer; consumers read it directly.
}

let lastForwardAt = 0;
const FORWARD_MIN_MS = 5000;

function forward(error: TelemetryError) {
  if (typeof navigator === "undefined" || !navigator.onLine) return;
  const now = Date.now();
  if (now - lastForwardAt < FORWARD_MIN_MS) return;
  lastForwardAt = now;
  // Supabase session is the single token source (legacy sessionStorage keys
  // are purged in auth-headers and must not be read here).
  void (async () => {
    try {
      const { supabaseAccessToken } = await import("./auth-headers");
      const token = await supabaseAccessToken();
      if (!token) return;
      await fetch("/api/telemetry/error", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          url: error.url,
          userAgent: error.userAgent,
          source: error.source,
        }),
        keepalive: true,
      });
    } catch {
      // Telemetry must never throw into the app; drop silently.
    }
  })();
}

/** Client-side scrub (mirrors server sanitizeTelemetryText): the in-memory
 * ring and console output must never hold raw emails, phone numbers, or JWTs.
 * Query strings and hashes are stripped from URLs (may carry IDs/tokens). */
export function scrubTelemetryText(input: string): string {
  return input
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL_MASKED]")
    .replace(/\b(?:\+91|91)?[6-9]\d{9}\b/g, "[PHONE_MASKED]")
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[JWT_MASKED]");
}

function scrubUrl(href: string): string {
  if (!href) return "";
  const queryIndex = href.search(/[?#]/);
  return queryIndex === -1 ? href : href.slice(0, queryIndex);
}

function handle(kind: "onerror" | "unhandledrejection", message: string, stack?: string) {
  const error: TelemetryError = {
    message: scrubTelemetryText(String(message)).slice(0, 500),
    stack: stack ? scrubTelemetryText(String(stack)).slice(0, 2000) : undefined,
    url: typeof window !== "undefined" ? scrubUrl(window.location.href) : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    timestamp: new Date().toISOString(),
    source: kind,
  };
  record(error);
  // eslint-disable-next-line no-console -- intentional structured output
  console.error(`[telemetry] ${error.source}:`, {
    message: error.message,
    url: error.url,
    at: error.timestamp,
    buffered: ring.length,
  });
  forward(error);
}

/** Client-only, call once from Providers useEffect. Idempotent. */
export function initTelemetry() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const dsn =
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    (typeof process !== "undefined" ? process.env.SENTRY_DSN : undefined);
  if (dsn) {
    // TODO(telemetry): replace this stub with real Sentry SDK init when
    // @sentry/nextjs lands. Until then the DSN is intentionally unused beyond
    // signaling that operators expect error collection.
    // eslint-disable-next-line no-console
    console.info("[telemetry] NEXT_PUBLIC_SENTRY_DSN set; using local buffer until Sentry SDK is added.");
  }

  window.addEventListener("error", (event) => {
    // Resource-load errors (img/script) arrive here without an Error object;
    // skip them so we don't spam on flaky CDNs.
    if (!event.error && !(event.message || "").trim()) return;
    handle(
      "onerror",
      event.message || event.error?.message || "Unknown error",
      event.error?.stack,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason ?? "Unhandled rejection");
    const stack = reason instanceof Error ? reason.stack : undefined;
    handle("unhandledrejection", message, stack);
  });
}

/** Test hook: reset module state between unit tests. */
export function resetTelemetryForTests() {
  ring = [];
  initialized = false;
  lastForwardAt = 0;
}
