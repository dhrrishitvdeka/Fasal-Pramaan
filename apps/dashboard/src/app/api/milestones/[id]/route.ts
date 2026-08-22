import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isReviewerRole, requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";

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
  const payload = await request.json().catch(() => ({}));
  const { error } = await supabase
    .from("web_milestones")
    .update({
      due_date: payload.dueDate ?? undefined,
      completed: payload.completed ?? undefined,
      completed_date: payload.completedDate ?? null,
      evidence_image_url: payload.evidenceImageUrl ?? undefined,
      notes: payload.notes ?? undefined,
      is_overdue: payload.isOverdue ?? undefined,
    })
    .eq("id", id);
  if (error) {
    console.error("milestone update failed:", error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
