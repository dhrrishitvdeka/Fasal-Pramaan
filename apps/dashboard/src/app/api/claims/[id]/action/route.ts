import { NextResponse } from "next/server";
import { applyReviewerAction } from "@/lib/claim-pipeline";
import { createServerSupabase } from "@/lib/supabase";
import { createSupabaseClaimStore } from "@/lib/supabase-store";
import { actorUnauthorized, isReviewerRole, requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { REVIEW_ACTION_IDS, reviewActionSchema } from "@/lib/schemas";

const ALLOWED_ACTIONS = new Set<string>(REVIEW_ACTION_IDS);
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  if (!isReviewerRole(auth.actor.role)) {
    return actorUnauthorized("Reviewer role required");
  }
  const limit = checkRateLimit(`claim-action:${auth.actor.userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many review actions. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  const { id } = await context.params;
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const rawPayload: unknown = await request.json().catch(() => ({}));
  const parsed = reviewActionSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid review action" },
      { status: 400 },
    );
  }
  const payload = parsed.data;
  const action = payload.action;
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Unsupported review action" }, { status: 400 });
  }
  try {
    const updated = await applyReviewerAction(createSupabaseClaimStore(supabase), id, {
      action,
      notes: payload.notes,
      reason: payload.reason || payload.override_reason,
      reason_hi: payload.reason_hi,
      required_angles: payload.required_angles,
      actor: auth.actor.email || auth.actor.userId,
      corrected_crop: payload.corrected_crop,
      corrected_grade: payload.corrected_grade,
      corrected_severity: payload.corrected_severity,
      corrected_damage_codes: payload.corrected_damage_codes,
      corrected_affected_area_pct: payload.corrected_affected_area_pct,
      corrected_growth_stage: payload.corrected_growth_stage,
    });
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed";
    const status =
      message === "Claim not found"
        ? 404
        : message === "Claim status changed" || /Cannot recapture/i.test(message)
          ? 409
          : message.startsWith("Cannot accept claim") || message.startsWith("Cannot ")
            ? 400
            : 500;
    // Known domain errors are safe user-facing copy; anything else may carry
    // DB/storage internals — log it and return a generic message.
    if (status === 500) {
      console.error("POST /api/claims/[id]/action failed:", error);
      return NextResponse.json({ error: "Action failed" }, { status });
    }
    return NextResponse.json(
      { error: message },
      { status },
    );
  }
}
