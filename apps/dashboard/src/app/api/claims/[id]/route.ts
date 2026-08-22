import { NextResponse } from "next/server";
import { claimToSubmission } from "@/lib/claim-pipeline";
import { createServerSupabase } from "@/lib/supabase";
import { createSupabaseClaimStore } from "@/lib/supabase-store";
import { isReviewerRole, requireWebActor } from "@/lib/web-auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const store = createSupabaseClaimStore(supabase);
  const claim = await store.getClaim(id);
  if (!claim) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isReviewerRole(auth.actor.role) && claim.created_by !== auth.actor.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(claimToSubmission(claim, await store.listImages(id)));
}
