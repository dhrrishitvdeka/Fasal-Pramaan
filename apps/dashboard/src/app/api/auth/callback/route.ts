import { NextResponse } from "next/server";
import { applyAuthCookies, createAuthClientFromRequest, type CookieToSet } from "@/lib/auth-cookies";

function safeNext(value: string | null): string {
  if (!value) return "/farmer";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/farmer";
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const redirectTo = new URL(next, url.origin);

  if (!code) {
    redirectTo.pathname = "/login";
    redirectTo.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectTo);
  }

  const pending: CookieToSet[] = [];
  const supabase = createAuthClientFromRequest(request, (cookies) => pending.push(...cookies));
  if (!supabase) {
    redirectTo.pathname = "/login";
    redirectTo.searchParams.set("error", "not_configured");
    return NextResponse.redirect(redirectTo);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    redirectTo.pathname = "/login";
    redirectTo.searchParams.set("error", "exchange_failed");
    return NextResponse.redirect(redirectTo);
  }

  const response = NextResponse.redirect(new URL(next, url.origin));
  applyAuthCookies(response, pending);
  return response;
}
