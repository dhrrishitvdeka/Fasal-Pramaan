import { NextResponse } from "next/server";
import { buildDefaultMilestones } from "@/lib/growth-stages";
import { createServerSupabase } from "@/lib/supabase";
import { isReviewerRole, requireWebActor } from "@/lib/web-auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const plotRes = await supabase.from("web_plots").select("*").eq("id", id).maybeSingle();
  if (plotRes.error) {
    console.error("plot lookup failed:", plotRes.error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  if (!plotRes.data) return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  if (!isReviewerRole(auth.actor.role) && plotRes.data.created_by !== auth.actor.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await supabase.from("web_milestones").select("id").eq("plot_id", id);
  if (existing.error) {
    console.error("milestone lookup failed:", existing.error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  if ((existing.data || []).length > 0) {
    return NextResponse.json({ ok: true, seeded: false, milestoneCount: existing.data.length });
  }

  const milestones = buildDefaultMilestones({
    plotId: id,
    cropName: plotRes.data.crop_type || "Wheat",
    cropNameHi: plotRes.data.crop_type_hi || "गेहूँ",
    sowingDate: plotRes.data.sowing_date || undefined,
    createdBy: auth.actor.userId,
  });
  const seeded = await supabase.from("web_milestones").insert(milestones);
  if (seeded.error) {
    console.error("milestone seed failed:", seeded.error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, seeded: true, milestoneCount: milestones.length });
}
