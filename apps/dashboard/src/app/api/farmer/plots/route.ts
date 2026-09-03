import { NextResponse } from "next/server";
import { buildDefaultMilestones } from "@/lib/growth-stages";
import { createServerSupabase } from "@/lib/supabase";
import { requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { katthaToHectares, toKattha } from "@/lib/land-units";

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

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name || "").trim();
  if (!name || name.length > 80) {
    return NextResponse.json({ error: "A plot name is required." }, { status: 400 });
  }
  const cropKey = String(body.cropType || "wheat").trim().toLowerCase();
  const crop = CROPS[cropKey] || { en: String(body.cropType || "Wheat"), hi: String(body.cropTypeHi || "") };
  const sowingDate = String(body.sowingDate || "").trim() || new Date().toISOString().slice(0, 10);
  const plotId = `plot_${crypto.randomUUID()}`;

  // Area calculation: prefer areaKattha if supplied or convert unit
  let areaHa = 0;
  if (body.areaKattha !== undefined && body.areaKattha !== null && body.areaKattha !== "") {
    areaHa = katthaToHectares(Number(body.areaKattha));
  } else if (body.areaHectares !== undefined && body.areaHectares !== null && body.areaHectares !== "") {
    areaHa = Number(body.areaHectares);
  } else if (body.areaValue && body.areaUnit) {
    const k = toKattha(Number(body.areaValue), body.areaUnit as any);
    areaHa = katthaToHectares(k);
  }

  const lat = Number(body.lat);
  const lon = Number(body.lon);

  const row = {
    id: plotId,
    name,
    name_hi: String(body.nameHi || name),
    khasra_number: String(body.khasraNumber || "").trim(),
    khata_number: String(body.khataNumber || "").trim(),
    hissa_number: String(body.hissaNumber || "").trim(),
    tehsil: String(body.tehsil || "").trim(),
    ownership_type: String(body.ownershipType || "owner").trim(),
    season: String(body.season || "").trim(),
    area_hectares: Number.isFinite(areaHa) && areaHa > 0 ? Number(areaHa.toFixed(4)) : 0,
    crop_type: crop.en,
    crop_type_hi: crop.hi || crop.en,
    crop_variety: String(body.cropVariety || "").trim(),
    current_stage: "Sowing",
    current_stage_hi: "बुवाई",
    sowing_date: sowingDate,
    soil_type: String(body.soilType || "").trim(),
    irrigation_type: String(body.irrigationType || "").trim(),
    village: String(body.village || "").trim(),
    district: String(body.district || "").trim(),
    state: String(body.state || "").trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
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
