import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Quiet liveness probe + non-secret dependency presence.
 * Booleans only: configured vs not. No secret values, counts, or vendor URLs.
 */
export async function GET() {
  const hasSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
  const hasServiceRole = Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim());
  const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const degraded = !hasSupabase || !hasServiceRole || !hasGemini;
  return NextResponse.json({
    ok: true,
    status: degraded ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    checks: {
      app: true,
      supabase: hasSupabase,
      serviceRole: hasServiceRole,
      gemini: hasGemini,
    },
  });
}
