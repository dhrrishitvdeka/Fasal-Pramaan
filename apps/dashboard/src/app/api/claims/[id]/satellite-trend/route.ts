import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { createSupabaseClaimStore } from "@/lib/supabase-store";
import { isReviewerRole, requireWebActor } from "@/lib/web-auth";
import {
  computeTrendStats,
  fetchNdviTimeSeries,
  ndviTrendRange,
  type NdviPoint,
} from "@/lib/context/ndvi-trend";

/**
 * In-memory TTL cache: the series around a claim's created_at never changes,
 * so one computation per claim is enough for the process lifetime. Keeps
 * review-page navigation from hammering the Copernicus statistics endpoint.
 */
const CACHE_TTL_MS = 30 * 60 * 1000;
const trendCache = new Map<string, { expires: number; payload: unknown }>();

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const store = createSupabaseClaimStore(supabase);
  const claim = await store.getClaim(id);
  if (!claim) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isReviewerRole(auth.actor.role) && claim.created_by !== auth.actor.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cached = trendCache.get(id);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  // Claim creation is the loss-event proxy; chart the 90-day baseline before
  // and the 30-day response after it. Degraded shapes are still 200 — the
  // card renders "unavailable" instead of the reviewer hitting an error wall.
  const lat = Number(claim.capture_lat);
  const lon = Number(claim.capture_lon);
  const hasCoords =
    Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
  const token = process.env.SENTINEL_TOKEN || process.env.COPERNICUS_TOKEN || "";
  const eventDate = claim.created_at ? new Date(claim.created_at) : new Date();
  const range = ndviTrendRange(eventDate);

  let payload: NdviTrendResponse;
  if (!hasCoords) {
    payload = { available: false, reason: "no_gps_coordinates", eventDate: claim.created_at };
  } else if (!token) {
    payload = { available: false, reason: "satellite_credentials_missing", eventDate: claim.created_at };
  } else {
    const series = await fetchNdviTimeSeries({ lat, lon, from: range.from, to: range.to, token });
    if (!series) {
      payload = {
        available: false,
        reason: "satellite_unavailable",
        eventDate: claim.created_at,
        range,
      };
    } else {
      payload = {
        available: true,
        eventDate: claim.created_at,
        range,
        series,
        stats: computeTrendStats(series, eventDate),
      };
    }
  }

  trendCache.set(id, { expires: Date.now() + CACHE_TTL_MS, payload });
  return NextResponse.json(payload);
}

interface NdviTrendResponse {
  available: boolean;
  reason?: string;
  eventDate?: string | null;
  range?: { from: string; to: string };
  series?: NdviPoint[];
  stats?: ReturnType<typeof computeTrendStats>;
}
