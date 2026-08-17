import { NextResponse } from "next/server";
import { applyReviewerAction } from "@/lib/claim-pipeline";
import { createServerSupabase } from "@/lib/supabase";
import { createSupabaseClaimStore } from "@/lib/supabase-store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const payload = await request.json();
  try {
    const updated = await applyReviewerAction(createSupabaseClaimStore(supabase), id, payload);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 500 },
    );
  }
}
