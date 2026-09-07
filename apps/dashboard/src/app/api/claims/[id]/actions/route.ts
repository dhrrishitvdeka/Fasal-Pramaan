import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isReviewerRole, requireWebActor } from "@/lib/web-auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json([]);
  const claim = await supabase.from("web_claims").select("id, created_by").eq("id", id).maybeSingle();
  if (claim.error) {
    console.error("claim lookup failed:", claim.error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  if (!claim.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isReviewerRole(auth.actor.role) && claim.data.created_by !== auth.actor.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data, error } = await supabase
    .from("web_review_actions")
    .select("*")
    .eq("claim_id", id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("review actions query failed:", error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  const rows = (data || []) as Array<Record<string, unknown>>;
  // Farmers see the decision trail on their own claims, but reviewer identity
  // stays internal: replace actor emails with a role label for non-reviewers.
  if (!isReviewerRole(auth.actor.role)) {
    return NextResponse.json(
      rows.map((row) => ({
        ...row,
        actor: typeof row.actor === "string" && row.actor.includes("@") ? "Reviewing officer" : row.actor,
      })),
    );
  }
  return NextResponse.json(rows);
}
