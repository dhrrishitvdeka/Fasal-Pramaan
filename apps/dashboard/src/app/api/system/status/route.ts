import { NextResponse } from "next/server";
import { requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
export const VERSION = "2.7.0";

/**
 * Honest configuration summary for the admin System Status page.
 * Returns booleans / public URLs only — never secret values.
 */
export async function GET(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  if (auth.actor.role !== "administrator") {
    return NextResponse.json({ error: "Administrator role required" }, { status: 403 });
  }
  const limit = checkRateLimit(`system-status:${auth.actor.userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  return NextResponse.json({
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    sentinel: Boolean(process.env.SENTINEL_TOKEN || process.env.COPERNICUS_TOKEN),
    imdKey: Boolean(process.env.IMD_API_KEY || process.env.OPENWEATHER_KEY),
    version: VERSION,
  });
}
