import { NextResponse } from "next/server";
import { applyReviewerAction } from "@/lib/claim-pipeline";
import { createServerSupabase } from "@/lib/supabase";
import { createSupabaseClaimStore } from "@/lib/supabase-store";
import { actorUnauthorized, isReviewerRole, requireWebActor } from "@/lib/web-auth";

const ALLOWED_ACTIONS = new Set([
  "accept",
  "correct",
  "request_recapture",
  "physical_inspection",
  "reject",
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  if (!isReviewerRole(auth.actor.role)) {
    return actorUnauthorized("Reviewer role required");
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
      reason: payload.reason,
      required_angles: Array.isArray(payload.required_angles) ? payload.required_angles.map(String) : undefined,
      actor: auth.actor.email || auth.actor.userId,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error && error.message === "Claim not found" ? "Claim not found" : "Action failed" },
      { status: error instanceof Error && error.message === "Claim not found" ? 404 : 500 },
    );
  }
}
