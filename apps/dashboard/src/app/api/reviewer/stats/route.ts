import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/server/rate-limit";
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
  // Full-table scan + per-image signed URLs per call: throttle bulk export.
  const statsLimit = checkRateLimit(`reviewer-stats:${auth.actor.userId}`, 30, 60_000);
  if (!statsLimit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(statsLimit.retryAfterSeconds) } },
    );
  }
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const { data: claimRows, error } = await supabase
    .from("web_claims")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    console.error("reviewer claims query failed:", error.message);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  const claims = (claimRows || []) as WebClaimRow[];
  const ids = claims.map((claim) => claim.id);
  const imageRows: WebClaimImageRow[] = [];
  if (ids.length) {
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const imagesRes = await supabase.from("web_claim_images").select("*").in("claim_id", chunk);
      if (imagesRes.error) {
        console.error("reviewer images query failed:", imagesRes.error.message);
        return NextResponse.json({ error: "Request failed" }, { status: 500 });
      }
      imageRows.push(...((imagesRes.data || []) as WebClaimImageRow[]));
    }
  }
  // Signed-URL minting is network-bound: resolve concurrently instead of
  // one round trip per image (was the dominant latency on this endpoint).
  const grouped = new Map<string, ReturnType<typeof imageFromRow>[]>();
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
  const mapped = claims.map((row) => claimFromRow(row, grouped.get(row.id) || []));
  // The review-action trail is an admin audit log: reviewers get aggregates,
  // administrators additionally get the actor-attributed action history.
  let actions: WebReviewActionRow[] = [];
  if (auth.actor.role === "administrator") {
    const { data, error: actionError } = await supabase
      .from("web_review_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (actionError) {
      console.error("reviewer actions query failed:", actionError.message);
      return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }
    actions = (data || []) as WebReviewActionRow[];
  }
  return NextResponse.json({
    overview: overviewFromClaims(mapped),
    markers: markersFromClaims(mapped),
    alerts: alertsFromClaims(mapped),
    analytics: analyticsFromClaims(mapped),
    actions,
  });
}
