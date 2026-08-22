import { NextResponse } from "next/server";
import { assembleContext } from "@/lib/context/assemble";
import { requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { normalizePeril } from "@/lib/claim-routing";

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

function toCoordinate(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : value != null && String(value).trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

export async function POST(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;

  const limit = checkRateLimit(`context-assemble:${auth.actor.userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const lat = toCoordinate(body.lat ?? body.capture_lat ?? body.captureLat, -90, 90);
  const lon = toCoordinate(body.lon ?? body.capture_lon ?? body.captureLon, -180, 180);
  const captureLat = toCoordinate(body.captureLat ?? body.capture_lat ?? lat, -90, 90);
  const captureLon = toCoordinate(body.captureLon ?? body.capture_lon ?? lon, -180, 180);
  const plotLat = toCoordinate(body.plotLat ?? body.plot_lat, -90, 90);
  const plotLon = toCoordinate(body.plotLon ?? body.plot_lon, -180, 180);
  const plotProximityMeters = typeof body.plotProximityMeters === "number" ? body.plotProximityMeters : undefined;
  const peril = normalizePeril(body.peril || body.claim_type || "normal");
  const rawSowingDate = typeof body.sowingDate === "string" ? body.sowingDate.trim() : "";
  const sowingDate = /^\d{4}-\d{2}-\d{2}$/.test(rawSowingDate) ? rawSowingDate : undefined;

  try {
    const out = await assembleContext({
      lat,
      lon,
      peril,
      sowingDate,
      captureLat,
      captureLon,
      plotLat,
      plotLon,
      plotProximityMeters,
    });
    return NextResponse.json(out);
  } catch (err) {
    console.error("context assemble failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Context assembly failed. Please retry." }, { status: 500 });
  }
}

// Re-export for internal use without HTTP (claim-pipeline uses @/lib/context/assemble directly)
export { assembleContext } from "@/lib/context/assemble";
