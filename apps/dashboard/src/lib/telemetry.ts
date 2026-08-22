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

function sessionToken(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem("fp_access_token");
  } catch {
    return null;
  }
}

function forward(error: TelemetryError) {
  const token = sessionToken();
  if (!token || typeof navigator === "undefined" || !navigator.onLine) return;
  try {
    void fetch("/api/telemetry/error", {
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
}

function handle(kind: "onerror" | "unhandledrejection", message: string, stack?: string) {
  const error: TelemetryError = {
    message: String(message).slice(0, 500),
    stack: stack ? String(stack).slice(0, 2000) : undefined,
    url: typeof window !== "undefined" ? window.location.href : "",
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
}
