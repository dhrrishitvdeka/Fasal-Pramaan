import { NextResponse } from "next/server";
import { requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";

/**
 * POST /api/telemetry/error — log-only client error intake (v1).
 * Auth-gated (requireWebActor) so anonymous visitors cannot spam it, and
 * rate-limited to 5/min per user. No persistence: errors are printed as
 * structured JSON to the server console for log-drain collection.
 */

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

const MAX_MESSAGE = 500;
const MAX_STACK = 2000;
const MAX_URL = 2048;
const MAX_USER_AGENT = 512;

export async function POST(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;

  const limit = checkRateLimit(
    `telemetry-error:${auth.actor.userId}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many error reports. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE);
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const payload = {
    message,
    stack: body.stack ? String(body.stack).slice(0, MAX_STACK) : undefined,
    url: body.url ? String(body.url).slice(0, MAX_URL) : undefined,
    userAgent: body.userAgent ? String(body.userAgent).slice(0, MAX_USER_AGENT) : undefined,
    source: body.source ? String(body.source).slice(0, 32) : undefined,
    reportedBy: auth.actor.userId,
    reportedAt: new Date().toISOString(),
  };

  // v1 is log-only — a log drain picks this up; no DB write by design.
  console.error(JSON.stringify({ level: "client_error", ...payload }));

  return NextResponse.json({ ok: true });
}
