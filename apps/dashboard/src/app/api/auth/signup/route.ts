import { NextResponse } from "next/server";
import { applyAuthCookies, clientIp, createAuthClientFromRequest, publicOrigin, type CookieToSet } from "@/lib/auth-cookies";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { signupSchema } from "@/lib/schemas";
import { actorFromUser } from "@/lib/web-auth";

export async function POST(request: Request) {
  const limit = checkRateLimit(`auth-signup:${clientIp(request)}`, 5, 60_000, true);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many sign-up attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = signupSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email and a password of at least 8 characters." }, { status: 400 });
  }

  const pending: CookieToSet[] = [];
  const supabase = createAuthClientFromRequest(request, (cookies) => pending.push(...cookies));
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const origin = publicOrigin(request);
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/api/auth/callback?next=/farmer`,
      data: {
        full_name: parsed.data.fullName || "",
      },
    },
  });
  if (error) {
    return NextResponse.json({ error: "Could not create the account. Try a different email." }, { status: 400 });
  }

  // Identities empty = email already registered (Supabase anti-enumeration shape).
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return NextResponse.json({
      ok: true,
      needsConfirmation: true,
      message: "If this email can be used, a confirmation link has been sent.",
    });
  }

  if (data.session && data.user?.email_confirmed_at) {
    const actor = await actorFromUser(data.user);
    const response = NextResponse.json({
      ok: true,
      needsConfirmation: false,
      userId: actor.userId,
      email: actor.email,
      role: "farmer",
      roles: ["farmer"],
    });
    applyAuthCookies(response, pending);
    return response;
  }

  return NextResponse.json({
    ok: true,
    needsConfirmation: true,
    message: "Check your email for a confirmation link before signing in.",
  });
}
