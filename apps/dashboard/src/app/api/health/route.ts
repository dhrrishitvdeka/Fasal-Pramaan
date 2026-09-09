import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Quiet liveness probe. Dependency booleans live on administrator-only
 * GET /api/system/status — this path is excluded from the site lock.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
