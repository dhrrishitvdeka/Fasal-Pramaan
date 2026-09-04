import { NextResponse } from "next/server";
import { retryPendingInference } from "@/lib/claim-pipeline";
import { inferCropDisease } from "@/lib/gemini-analyze";
import { createServerSupabase } from "@/lib/supabase";
import { createSupabaseClaimStore } from "@/lib/supabase-store";
import { actorUnauthorized, isReviewerRole, requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";

/**
 * POST /api/claims/[id]/reanalyze — reviewer-only "Re-run AI analysis".
 *
 * Re-downloads the stored evidence photos and runs Gemini field analysis
 * again, overwriting a failed / missing / grade-U prediction. Blocked on
 * finalized (verified/rejected) claims. Rate-limited: vision calls are slow.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  if (!isReviewerRole(auth.actor.role)) {
    return actorUnauthorized("Reviewer role required");
  }
  const limit = checkRateLimit(`claim-reanalyze:${auth.actor.userId}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many re-analysis requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  const { id } = await context.params;
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  try {
    const result = await retryPendingInference(createSupabaseClaimStore(supabase), id, inferCropDisease, {
      force: true,
    });
    if (!result) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }
    if (result.inferError && !result.prediction) {
      return NextResponse.json(
        { error: result.inferError, inference_status: "failed" },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      inference_status: "complete",
      grade: result.prediction?.predictedGrade ?? null,
      crop: result.prediction?.predictedCrop ?? null,
      inferError: result.inferError ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Re-analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
