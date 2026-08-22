import { NextResponse } from "next/server";
import { applyReviewerAction } from "@/lib/claim-pipeline";
import { createServerSupabase } from "@/lib/supabase";
import { createSupabaseClaimStore } from "@/lib/supabase-store";
import { actorUnauthorized, isReviewerRole, requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";

const ALLOWED_ACTIONS = new Set([
  "accept",
  "correct",
  "request_recapture",
  "physical_inspection",
  "reject",
  "override_gate",
]);
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
  const payload = await request.json().catch(() => ({}));
  const action = String(payload.action || "");
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Unsupported review action" }, { status: 400 });
  }
  try {
    const updated = await applyReviewerAction(createSupabaseClaimStore(supabase), id, {
      action,
      notes: payload.notes,
      reason: payload.reason || payload.override_reason,
      required_angles: Array.isArray(payload.required_angles) ? payload.required_angles.map(String) : undefined,
      actor: auth.actor.email || auth.actor.userId,
      corrected_crop: payload.corrected_crop == null ? undefined : String(payload.corrected_crop),
      corrected_grade: payload.corrected_grade == null ? undefined : String(payload.corrected_grade),
      corrected_severity: payload.corrected_severity == null ? undefined : String(payload.corrected_severity),
      corrected_damage_codes: Array.isArray(payload.corrected_damage_codes)
        ? payload.corrected_damage_codes.map(String)
        : undefined,
      corrected_affected_area_pct: (() => {
        if (payload.corrected_affected_area_pct == null || payload.corrected_affected_area_pct === "") {
          return undefined;
        }
        const pct = Number(payload.corrected_affected_area_pct);
        return Number.isFinite(pct) ? pct : undefined;
      })(),
      corrected_growth_stage:
        payload.corrected_growth_stage == null ? undefined : String(payload.corrected_growth_stage),
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message === "Claim not found" ? "Claim not found" : "Action failed" },
      { status: error instanceof Error && error.message === "Claim not found" ? 404 : 500 },
    );
  }
}
