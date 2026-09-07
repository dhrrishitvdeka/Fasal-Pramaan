import { NextResponse } from "next/server";
import { applyAuthCookies, clientIp, createAuthClientFromRequest, type CookieToSet } from "@/lib/auth-cookies";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { loginSchema } from "@/lib/schemas";
import { actorFromUser } from "@/lib/web-auth";

export async function POST(request: Request) {
  const limit = checkRateLimit(`auth-login:${clientIp(request)}`, 10, 60_000, true);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and password (8+ characters)." }, { status: 400 });
  }

  const pending: CookieToSet[] = [];
  const supabase = createAuthClientFromRequest(request, (cookies) => pending.push(...cookies));
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    const unconfirmed = /confirm|not.*confirmed/i.test(error?.message || "");
    return NextResponse.json(
      { error: unconfirmed ? "Confirm your email before signing in." : "Invalid email or password." },
      { status: unconfirmed ? 403 : 401 },
    );
  }
  if (!data.user.email_confirmed_at) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "Confirm your email before signing in." }, { status: 403 });
  }

  const actor = await actorFromUser(data.user);
  const response = NextResponse.json({
    userId: actor.userId,
    email: actor.email,
    role: actor.role,
    roles: [actor.role],
  });
  applyAuthCookies(response, pending);
  return response;
}
