import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/server/rate-limit";
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
  // Polled frequently by dashboards; each call fans out to plots + claims +
  // images + signed URLs, so cap per-user frequency.
  const stateLimit = checkRateLimit(`farmer-state:${auth.actor.userId}`, 60, 60_000);
  if (!stateLimit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(stateLimit.retryAfterSeconds) } },
    );
  }
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

  // Signed-URL minting is network-bound: resolve concurrently instead of
  // one round trip per image (was the dominant latency on this endpoint).
  const grouped = new Map<string, Awaited<ReturnType<typeof imageFromRow>>[]>();
  const resolvedRows = await Promise.all(
    imageRows.map(async (row) => ({
      row,
      resolved: await resolveImageUrl(row.image_url, row.storage_path, supabase),
    })),
  );
  for (const { row, resolved } of resolvedRows) {
    const list = grouped.get(row.claim_id) || [];
    list.push(imageFromRow({ ...row, image_url: resolved }));
    grouped.set(row.claim_id, list);
  }

  const profile = profileRes.data as WebProfileRow | null;
  // Server role only: an email-substring heuristic here would mislabel farmers
  // whose addresses merely contain "reviewer"/"admin".
  const isReviewer = isReviewerRole(auth.actor.role);
  const rawName = sanitizeMojibake(
    profile?.name ||
      profile?.full_name ||
      (isReviewer ? EMPTY_FARMER_PROFILE.name : auth.actor.email) ||
      EMPTY_FARMER_PROFILE.name,
    "Farmer",
  );
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
