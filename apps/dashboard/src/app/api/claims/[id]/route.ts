import { NextResponse } from "next/server";
import { getReviewerClaim } from "@/lib/claim-pipeline";
import { createServerSupabase } from "@/lib/supabase";
import { createSupabaseClaimStore } from "@/lib/supabase-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const item = await getReviewerClaim(createSupabaseClaimStore(supabase), id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(item);
}
