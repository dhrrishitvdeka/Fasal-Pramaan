import { NextResponse } from "next/server";
import { applyAuthCookies, createAuthClientFromRequest, type CookieToSet } from "@/lib/auth-cookies";

export async function POST(request: Request) {
  const pending: CookieToSet[] = [];
  const supabase = createAuthClientFromRequest(request, (cookies) => pending.push(...cookies));
  if (supabase) {
    await supabase.auth.signOut();
  }
  const response = NextResponse.json({ ok: true });
  applyAuthCookies(response, pending);
  // Belt-and-braces: expire any leftover sb-* cookies the client still holds.
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name && (name.startsWith("sb-") || name.includes("-auth-token"))) {
      response.cookies.set(name, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    }
  }
  return response;
}
