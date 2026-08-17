import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isReviewerRole, requireWebActor } from "@/lib/web-auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const existing = await supabase.from("web_milestones").select("id, created_by").eq("id", id).maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 500 });
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
