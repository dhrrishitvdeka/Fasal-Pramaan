import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/rate-limit";
import {
  SITE_LOCK_COOKIE,
  isSiteLockActive,
  siteLockPassword,
  siteLockToken,
} from "@/lib/site-lock";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.VERCEL === "1",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

/** Constant-time string compare (mirrors site-lock.ts isValidSiteLockToken). */
function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: Request) {
  if (!isSiteLockActive()) {
    return NextResponse.json({ ok: true, locked: false });
  }
  const unlockLimit = checkRateLimit("unlock", 10, 60_000);
  if (!unlockLimit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(unlockLimit.retryAfterSeconds) } },
    );
  }
  const expected = siteLockPassword();
  if (!expected) {
    return NextResponse.json({ error: "Site lock is not configured" }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (!timingSafeEqualStrings(String(body.password || ""), expected)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SITE_LOCK_COOKIE, await siteLockToken(expected), cookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SITE_LOCK_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return response;
}
