import { NextResponse } from "next/server";
import { clientIp, createAuthClientFromRequest, publicOrigin } from "@/lib/auth-cookies";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { forgotPasswordSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  const limit = checkRateLimit(`auth-forgot:${clientIp(request)}`, 5, 60_000, true);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many reset attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = forgotPasswordSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const supabase = createAuthClientFromRequest(request);
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const origin = publicOrigin(request);
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/api/auth/callback?next=/login`,
  });
  // Always the same response: do not reveal whether the email exists.
  return NextResponse.json({
    ok: true,
    message: "If an account exists for this email, a reset link has been sent.",
  });
}
