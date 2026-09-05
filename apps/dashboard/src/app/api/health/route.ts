import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Quiet liveness probe — no secret presence, claim counts, or vendor URLs. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
