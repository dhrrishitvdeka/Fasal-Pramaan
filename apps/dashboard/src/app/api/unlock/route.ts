import { NextResponse } from "next/server";
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

export async function POST(request: Request) {
  if (!isSiteLockActive()) {
    return NextResponse.json({ ok: true, locked: false });
  }
  const expected = siteLockPassword();
  if (!expected) {
    return NextResponse.json({ error: "Site lock is not configured" }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (String(body.password || "") !== expected) {
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
