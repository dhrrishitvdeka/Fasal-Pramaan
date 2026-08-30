import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isReviewerRole, requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { milestoneSchema } from "@/lib/schemas";

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  const limit = checkRateLimit(`milestones:${auth.actor.userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many milestone updates. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  const { id } = await context.params;
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const existing = await supabase.from("web_milestones").select("id, created_by").eq("id", id).maybeSingle();
  if (existing.error) {
    console.error("milestone lookup failed:", existing.error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  if (!existing.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isReviewerRole(auth.actor.role) && existing.data.created_by !== auth.actor.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = milestoneSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request body" },
      { status: 400 },
    );
  }
  const payload = parsed.data;
  // Only patch fields the client actually sent — an absent completedDate must
  // not wipe the stored value.
  const updates: Record<string, unknown> = {};
  if (payload.dueDate !== undefined) updates.due_date = payload.dueDate;
  if (payload.completed !== undefined) updates.completed = payload.completed;
  if (payload.completedDate !== undefined) updates.completed_date = payload.completedDate;
  if (payload.evidenceImageUrl !== undefined) updates.evidence_image_url = payload.evidenceImageUrl;
  if (payload.notes !== undefined) updates.notes = payload.notes;
  if (payload.isOverdue !== undefined) updates.is_overdue = payload.isOverdue;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }
  const { error } = await supabase
    .from("web_milestones")
    .update(updates)
    .eq("id", id);
  if (error) {
    console.error("milestone update failed:", error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
