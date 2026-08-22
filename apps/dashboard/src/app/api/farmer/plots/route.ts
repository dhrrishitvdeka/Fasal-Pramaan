import { NextResponse } from "next/server";
import { buildDefaultMilestones } from "@/lib/growth-stages";
import { createServerSupabase } from "@/lib/supabase";
import { requireWebActor } from "@/lib/web-auth";

const CROPS: Record<string, { en: string; hi: string }> = {
  wheat: { en: "Wheat", hi: "गेहूँ" },
  paddy: { en: "Paddy", hi: "धान" },
  maize: { en: "Maize", hi: "मक्का" },
  potato: { en: "Potato", hi: "आलू" },
};

export async function POST(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name || "").trim();
  if (!name || name.length > 80) {
    return NextResponse.json({ error: "A plot name is required." }, { status: 400 });
  }
  const cropKey = String(body.cropType || "wheat").trim().toLowerCase();
  const crop = CROPS[cropKey] || { en: String(body.cropType || "Wheat"), hi: "" };
  const sowingDate = String(body.sowingDate || "").trim() || new Date().toISOString().slice(0, 10);
  const plotId = `plot_${crypto.randomUUID()}`;
  const area = Number(body.areaHectares);
  const row = {
    id: plotId,
    name,
    name_hi: String(body.nameHi || name),
    khasra_number: String(body.khasraNumber || "").trim(),
    area_hectares: Number.isFinite(area) && area > 0 ? area : 0,
    crop_type: crop.en,
    crop_type_hi: crop.hi,
    crop_variety: String(body.cropVariety || "").trim(),
    current_stage: "Sowing",
    current_stage_hi: "बुवाई",
    sowing_date: sowingDate,
    soil_type: String(body.soilType || "").trim(),
    irrigation_type: String(body.irrigationType || "").trim(),
    village: String(body.village || "").trim(),
    district: String(body.district || "").trim(),
    state: String(body.state || "").trim(),
    created_by: auth.actor.userId,
  };
  const inserted = await supabase.from("web_plots").insert(row).select("*").single();
  if (inserted.error) {
    console.error("plot insert failed:", inserted.error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }

  const milestones = buildDefaultMilestones({
    plotId,
    cropName: crop.en,
    cropNameHi: crop.hi,
    sowingDate,
    createdBy: auth.actor.userId,
  });
  const seeded = await supabase.from("web_milestones").insert(milestones);
  if (seeded.error) {
    console.error("milestone seed failed:", seeded.error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, plotId, milestoneCount: milestones.length });
}
