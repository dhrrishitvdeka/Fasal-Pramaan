import { NextResponse } from "next/server";
import { heuristicGate, geminiGate } from "@/lib/vision/gate-shared";
import { requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { normalizePeril } from "@/lib/claim-routing";
import { REQUIRED_ANGLES, hammingDistance } from "@/lib/evidence";

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_IMAGE_CHARS = 18 * 1024 * 1024;
const ANGLE_TYPES = new Set<string>([
  ...REQUIRED_ANGLES,
  "photo_1",
  "photo_2",
  "photo_3",
  "wide_field",
  "left_context",
  "mid_canopy",
  "right_context",
  "closeup_damage",
  "angle",
]);

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
  const angleType = String(body.angleType || "photo_1").trim();
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

  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : undefined;

  // Duplicate check across already captured slots (SHA-256 byte digest or perceptual hash)
  const incomingHash = String(body.sha256 || metadata?.sha256 || "").trim();
  const existingHashes: string[] = Array.isArray(body.existingHashes) ? body.existingHashes : [];
  if (incomingHash && existingHashes.some((h) => h && String(h).trim().toLowerCase() === incomingHash.toLowerCase())) {
    return NextResponse.json({
      usable: false,
      reason: "duplicate_angle",
      crop_detected: expectedCrop || null,
      visual_reason: "Exact duplicate photo or angle already uploaded in another slot.",
      warnings: ["duplicate_angle"],
      confidence: 0.1,
      fallback: true,
    });
  }

  const incomingPHash = String(metadata?.pHash || body.pHash || "").trim();
  const existingPHashes: string[] = Array.isArray(body.existingPHashes) ? body.existingPHashes : [];
  if (
    incomingPHash.length === 16 &&
    existingPHashes.some((ph) => ph && String(ph).trim().length === 16 && hammingDistance(incomingPHash, String(ph).trim()) <= 6)
  ) {
    return NextResponse.json({
      usable: false,
      reason: "duplicate_angle",
      crop_detected: expectedCrop || null,
      visual_reason: "Near-identical perceptual hash indicates duplicate photo or exact same angle view.",
      warnings: ["duplicate_angle"],
      confidence: 0.1,
      fallback: true,
    });
  }

  try {
    const gemini = await geminiGate(imageDataUrl, angleType, expectedCrop, peril, metadata);
    if (gemini) {
      return NextResponse.json(gemini);
    }
    const fallback = heuristicGate(imageDataUrl, expectedCrop, peril, metadata);
    return NextResponse.json({ ...fallback, fallback: true });
  } catch (err) {
    console.error("vision gate failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Gate check failed. Please retry." }, { status: 500 });
  }
}
