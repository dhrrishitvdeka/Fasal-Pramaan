import { NextResponse } from "next/server";

export const maxDuration = 60;
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
  // Owners and reviewers share this endpoint, so keep the quota tight:
  // each call is a synchronous multi-model Gemini run.
  const limit = checkRateLimit(`claim-reanalyze:${auth.actor.userId}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many re-analysis requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  const { id } = await context.params;
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const store = createSupabaseClaimStore(supabase);
  const existingClaim = await store.getClaim(id);
  if (!existingClaim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }
  if (!isReviewerRole(auth.actor.role)) {
    return actorUnauthorized("Reviewer role required");
  }
  try {
    const result = await retryPendingInference(store, id, inferCropDisease, {
      force: true,
    });
    if (!result) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }
    if (result.inferError && !result.prediction) {
      // A held inference lease means another run is in flight: 409, not 502.
      if (/already running/i.test(result.inferError)) {
        return NextResponse.json(
          { error: "Analysis already running — please wait.", inference_status: "pending" },
          { status: 409 },
        );
      }
      // Log provider internals server-side; the client only needs the status.
      console.error(`reanalyze ${id} inference failed:`, result.inferError);
      return NextResponse.json(
        { error: "Analysis failed", inference_status: "failed" },
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
    console.error(`reanalyze ${id} failed:`, error);
    return NextResponse.json({ error: "Re-analysis failed" }, { status: 500 });
  }
}
