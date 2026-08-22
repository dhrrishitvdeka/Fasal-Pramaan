import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isReviewerRole, requireWebActor } from "@/lib/web-auth";
import {
  claimFromRow,
  imageFromRow,
  milestoneFromRow,
  plotFromRow,
  resolveImageUrl,
  type WebClaimImageRow,
  type WebClaimRow,
  type WebMilestoneRow,
  type WebPlotRow,
  type WebProfileRow,
  EMPTY_FARMER_PROFILE,
} from "@/lib/web-db";
import { sanitizeMojibake } from "@/lib/name-sanitizer";

export async function GET(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  let plotsQuery = supabase.from("web_plots").select("*").order("created_at", { ascending: true });
  let claimsQuery = supabase.from("web_claims").select("*").order("created_at", { ascending: false });
  let milestonesQuery = supabase.from("web_milestones").select("*").order("day_number", { ascending: true });
  if (!isReviewerRole(auth.actor.role)) {
    plotsQuery = plotsQuery.eq("created_by", auth.actor.userId);
    claimsQuery = claimsQuery.eq("created_by", auth.actor.userId);
    milestonesQuery = milestonesQuery.eq("created_by", auth.actor.userId);
  }

  const [plotsRes, claimsRes, milestonesRes, profileRes] = await Promise.all([
    plotsQuery,
    claimsQuery,
    milestonesQuery,
    supabase.from("web_profiles").select("*").eq("id", auth.actor.userId).maybeSingle(),
  ]);
  if (plotsRes.error) {
    console.error("plots query failed:", plotsRes.error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  if (claimsRes.error) {
    console.error("claims query failed:", claimsRes.error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  if (milestonesRes.error) {
    console.error("milestones query failed:", milestonesRes.error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }

  const claims = (claimsRes.data || []) as WebClaimRow[];
  const imageRows: WebClaimImageRow[] = [];
  if (claims.length) {
    const imagesRes = await supabase
      .from("web_claim_images")
      .select("*")
      .in(
        "claim_id",
        claims.map((claim) => claim.id),
      );
    if (imagesRes.error) {
      console.error("claim images query failed:", imagesRes.error.message);
      return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }
    imageRows.push(...((imagesRes.data || []) as WebClaimImageRow[]));
  }

  const grouped = new Map<string, Awaited<ReturnType<typeof imageFromRow>>[]>();
  for (const row of imageRows) {
    const resolved = await resolveImageUrl(row.image_url, row.storage_path, supabase);
    const list = grouped.get(row.claim_id) || [];
    list.push(imageFromRow({ ...row, image_url: resolved }));
    grouped.set(row.claim_id, list);
  }

  const profile = profileRes.data as WebProfileRow | null;
  const rawName = sanitizeMojibake(profile?.name || profile?.full_name || auth.actor.email || EMPTY_FARMER_PROFILE.name, "Farmer");
  const isEmail = rawName.includes("@");
  let rawNameHi = sanitizeMojibake(profile?.name_hi || profile?.full_name_hi || "", "");
  if (isEmail || rawNameHi === "किसान") {
    rawNameHi = "";
  }

  return NextResponse.json({
    plots: ((plotsRes.data || []) as WebPlotRow[]).map(plotFromRow),
    claims: claims.map((row) => claimFromRow(row, grouped.get(row.id) || [])),
    milestones: ((milestonesRes.data || []) as WebMilestoneRow[]).map(milestoneFromRow),
    profile: {
      name: rawName,
      nameHi: rawNameHi,
      kisanId: profile?.kisan_id || "",
      phone: profile?.phone || "",
      village: profile?.village || "",
      district: profile?.district || "",
      state: profile?.state || "",
    },
  });
}
