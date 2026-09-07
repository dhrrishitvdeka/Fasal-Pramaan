import { NextResponse } from "next/server";
import { buildDefaultMilestones } from "@/lib/growth-stages";
import { createServerSupabase } from "@/lib/supabase";
import { requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { katthaToHectares, toKattha } from "@/lib/land-units";
import { plotSchema } from "@/lib/schemas";

const CROPS: Record<string, { en: string; hi: string }> = {
  wheat: { en: "Wheat", hi: "गेहूँ" },
  paddy: { en: "Paddy", hi: "धान" },
  maize: { en: "Maize", hi: "मक्का" },
  mustard: { en: "Mustard", hi: "सरसों" },
  potato: { en: "Potato", hi: "आलू" },
  sugarcane: { en: "Sugarcane", hi: "गन्ना" },
  cotton: { en: "Cotton", hi: "कपास" },
  soybean: { en: "Soybean", hi: "सोयाबीन" },
  gram: { en: "Gram (Chickpea)", hi: "चना" },
  groundnut: { en: "Groundnut", hi: "मूंगफली" },
  onion: { en: "Onion", hi: "प्याज़" },
  pulses: { en: "Pulses", hi: "दालें" },
};

export async function POST(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  const limit = checkRateLimit(`plots-create:${auth.actor.userId}`, 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  const supabase = createServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const rawBody: unknown = await request.json().catch(() => ({}));
  const parsed = plotSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid plot details" },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const name = body.name;
  const crop = CROPS[body.cropType] || CROPS.wheat;
  const sowingDate = body.sowingDate || new Date().toISOString().slice(0, 10);
  const plotId = `plot_${crypto.randomUUID()}`;

  // Area calculation: prefer areaKattha if supplied or convert unit
  let areaHa = 0;
  if (body.areaKattha != null) {
    areaHa = katthaToHectares(body.areaKattha);
  } else if (body.areaHectares != null) {
    areaHa = body.areaHectares;
  } else if (body.areaValue != null && body.areaUnit) {
    const k = toKattha(body.areaValue, body.areaUnit);
    areaHa = katthaToHectares(k);
  }
  if (!Number.isFinite(areaHa) || areaHa < 0 || areaHa > 100000) {
    return NextResponse.json({ error: "Plot area is out of range." }, { status: 400 });
  }

  const row = {
    id: plotId,
    name,
    name_hi: body.nameHi || name,
    khasra_number: body.khasraNumber || "",
    khata_number: body.khataNumber || "",
    hissa_number: body.hissaNumber || "",
    tehsil: body.tehsil || "",
    ownership_type: body.ownershipType || "owner",
    season: body.season || "",
    area_hectares: areaHa > 0 ? Number(areaHa.toFixed(4)) : 0,
    crop_type: crop.en,
    crop_type_hi: crop.hi || crop.en,
    crop_variety: body.cropVariety || "",
    current_stage: "Sowing",
    current_stage_hi: "बुवाई",
    sowing_date: sowingDate,
    soil_type: body.soilType || "",
    irrigation_type: body.irrigationType || "",
    village: body.village || "",
    district: body.district || "",
    state: body.state || "",
    lat: body.lat ?? null,
    lon: body.lon ?? null,
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

  return NextResponse.json({ ok: true, plotId, plot: inserted.data, milestoneCount: milestones.length });
}
