import { NextResponse } from "next/server";
import { clientIp } from "@/lib/auth-cookies";
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
    secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

/** Constant-time string compare via fixed-length SHA-256 digests. */
async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const u8A = new Uint8Array(hashA);
  const u8B = new Uint8Array(hashB);
  let mismatch = 0;
  for (let i = 0; i < u8A.length; i += 1) {
    mismatch |= u8A[i] ^ u8B[i];
  }
  return mismatch === 0;
}

export async function POST(request: Request) {
  if (!isSiteLockActive()) {
    return NextResponse.json({ ok: true, locked: false });
  }
  // Per-IP bucket, always enforced: a global key lets one attacker lock out
  // every legitimate user (or brute-force unbothered when disabled in dev).
  const unlockLimit = checkRateLimit(`unlock:${clientIp(request)}`, 10, 60_000, true);
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
  const submitted = String(body.password || "").slice(0, 256);
  if (!(await timingSafeEqualStrings(submitted, expected))) {
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
