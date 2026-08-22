import { NextResponse } from "next/server";
import { heuristicGate, geminiGate } from "@/lib/vision/gate-shared";
import { requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { normalizePeril } from "@/lib/claim-routing";
import { REQUIRED_ANGLES } from "@/lib/evidence";

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_IMAGE_CHARS = 18 * 1024 * 1024;
const ANGLE_TYPES = new Set<string>([...REQUIRED_ANGLES, "angle"]);

export async function POST(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;

  const limit = checkRateLimit(`vision-gate:${auth.actor.userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const imageDataUrl = String(body.imageDataUrl || body.dataUrl || "").trim();
  const angleType = String(body.angleType || "closeup_damage").trim();
  if (!ANGLE_TYPES.has(angleType)) {
    return NextResponse.json({ error: "Unsupported angleType" }, { status: 400 });
  }
  const expectedCrop = body.expectedCrop ? String(body.expectedCrop).trim().slice(0, 80) : undefined;
  const peril = normalizePeril(body.peril);

  if (!imageDataUrl || !imageDataUrl.startsWith("data:")) {
    return NextResponse.json({ error: "imageDataUrl (data:...) required" }, { status: 400 });
  }
  if (imageDataUrl.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: "Image too large" }, { status: 400 });
  }

  try {
    const gemini = await geminiGate(imageDataUrl, angleType, expectedCrop, peril);
    if (gemini) {
      return NextResponse.json(gemini);
    }
    const fallback = heuristicGate(imageDataUrl, expectedCrop, peril);
    return NextResponse.json({ ...fallback, fallback: true });
  } catch (err) {
    console.error("vision gate failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Gate check failed. Please retry." }, { status: 500 });
  }
}
