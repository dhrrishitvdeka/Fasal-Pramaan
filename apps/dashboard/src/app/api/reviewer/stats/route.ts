import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { actorUnauthorized, isReviewerRole, requireWebActor } from "@/lib/web-auth";
import {
  alertsFromClaims,
  analyticsFromClaims,
  claimFromRow,
  imageFromRow,
  markersFromClaims,
  overviewFromClaims,
  resolveImageUrl,
  type WebClaimImageRow,
  type WebClaimRow,
  type WebReviewActionRow,
} from "@/lib/web-db";

export async function GET(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  if (!isReviewerRole(auth.actor.role)) {
    return actorUnauthorized("Reviewer role required");
  }
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const { data: claimRows, error } = await supabase
    .from("web_claims")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("reviewer claims query failed:", error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  const claims = (claimRows || []) as WebClaimRow[];
  const ids = claims.map((claim) => claim.id);
  const imageRows: WebClaimImageRow[] = [];
  if (ids.length) {
    const imagesRes = await supabase.from("web_claim_images").select("*").in("claim_id", ids);
    if (imagesRes.error) {
      console.error("reviewer images query failed:", imagesRes.error.message);
      return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }
    imageRows.push(...((imagesRes.data || []) as WebClaimImageRow[]));
  }
  const grouped = new Map<string, ReturnType<typeof imageFromRow>[]>();
  for (const row of imageRows) {
    const resolved = await resolveImageUrl(row.image_url, row.storage_path, supabase);
    const list = grouped.get(row.claim_id) || [];
    list.push(imageFromRow({ ...row, image_url: resolved }));
    grouped.set(row.claim_id, list);
  }
  const mapped = claims.map((row) => claimFromRow(row, grouped.get(row.id) || []));
  const { data: actions, error: actionError } = await supabase
    .from("web_review_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (actionError) {
    console.error("reviewer actions query failed:", actionError.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({
    overview: overviewFromClaims(mapped),
    markers: markersFromClaims(mapped),
    alerts: alertsFromClaims(mapped),
    analytics: analyticsFromClaims(mapped),
    actions: (actions || []) as WebReviewActionRow[],
  });
}
