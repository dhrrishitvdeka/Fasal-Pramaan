import { NextResponse } from "next/server";
import {
  persistAndInfer,
  recaptureAndInfer,
  claimToSubmission,
  type PersistClaimInput,
} from "@/lib/claim-pipeline";
import { inferCropDisease } from "@/lib/hf-infer";
import { createServerSupabase } from "@/lib/supabase";
import { createSupabaseClaimStore } from "@/lib/supabase-store";
import { isReviewerRole, requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { claimSubmissionSchema } from "@/lib/schemas";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES = 6;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function decodeDataUrl(value: string): { bytes: Uint8Array; contentType: string } {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Image must be a data URL");
  }
  const contentType = match[1].toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error("Only JPEG, PNG, and WebP images are allowed");
  }
  const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    throw new Error("Each image must be between 1 byte and 15 MB");
  }
  return { contentType, bytes };
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

export async function GET(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ items: [] });
  }
  const store = createSupabaseClaimStore(supabase);
  const claims = await store.listClaims();
  const visible = isReviewerRole(auth.actor.role)
    ? claims
    : claims.filter((claim) => claim.created_by === auth.actor.userId);
  const items = [];
  for (const claim of visible) {
    items.push(claimToSubmission(claim, await store.listImages(claim.id)));
  }
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;
  const limit = checkRateLimit(`claims:${auth.actor.userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many claim submissions. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const body = await request.json().catch(() => ({}));
  const parsedBody = claimSubmissionSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message || "Invalid request body" },
      { status: 400 },
    );
  }
  const rawImages = Array.isArray(body.images) ? body.images : [];
  const claimId =
    typeof body.id === "string" && body.id.trim().length > 0 ? body.id.trim() : undefined;
  if (!rawImages.length || rawImages.length > MAX_IMAGES) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_IMAGES} images` }, { status: 400 });
  }
  let images: PersistClaimInput["images"];
  try {
    images = rawImages
      .filter((img: { imageDataUrl?: string }) => String(img.imageDataUrl || "").startsWith("data:"))
      .map(
        (img: {
          imageDataUrl: string;
          angleType: string;
          sha256?: string;
          lat?: number;
          lon?: number;
          accuracyM?: number;
          lightingScore?: number | null;
          qualityPassed?: boolean | null;
          blurScore?: number | null;
          greenPct?: number | null;
          facing?: string | null;
          dimensions?: { width: number; height: number } | null;
          capturedAt?: string | null;
        }) => {
          const decoded = decodeDataUrl(String(img.imageDataUrl || ""));
          return {
            angleType: String(img.angleType || "closeup_damage"),
            bytes: decoded.bytes,
            contentType: decoded.contentType,
            sha256: img.sha256,
            lat: img.lat,
            lon: img.lon,
            accuracyM: img.accuracyM,
            lightingScore: img.lightingScore,
            qualityPassed: img.qualityPassed,
            blurScore: img.blurScore,
            greenPct: img.greenPct,
            facing: img.facing,
            dimensions: img.dimensions,
            capturedAt: img.capturedAt || undefined,
            farmerObservation: typeof body.farmerObservations === "string" ? body.farmerObservations : undefined,
          };
        },
      );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid image" },
      { status: 400 },
    );
  }
  if (!images.length) {
    return NextResponse.json({ error: "Send at least one new image as a data URL" }, { status: 400 });
  }
  const store = createSupabaseClaimStore(supabase);
  const inferOptions = { apiToken: process.env.HF_TOKEN || process.env.HUGGINGFACE_API_TOKEN };
  try {
    if (claimId) {
      const existing = await store.getClaim(claimId);
      if (!existing) {
        return NextResponse.json({ error: "Claim not found" }, { status: 404 });
      }
      if (!isReviewerRole(auth.actor.role) && existing.created_by !== auth.actor.userId) {
        return NextResponse.json({ error: "Claim not found" }, { status: 404 });
      }
      const result = await recaptureAndInfer(
        store,
        {
          claimId,
          farmerObservations: body.farmerObservations,
          captureLat: clampNumber(body.captureLat, -90, 90) ?? null,
          captureLon: clampNumber(body.captureLon, -180, 180) ?? null,
          captureAccuracyM: clampNumber(body.captureAccuracyM, 0, 100000) ?? null,
          gpsStatus: body.gpsStatus,
          images,
        },
        inferCropDisease,
        inferOptions,
      );
      return NextResponse.json(result);
    }
    const input: PersistClaimInput = {
      plotId: body.plotId,
      plotName: body.plotName,
      plotNameHi: body.plotNameHi,
      khasraNumber: body.khasraNumber,
      cropType: body.cropType,
      cropTypeHi: body.cropTypeHi,
      cropVariety: body.cropVariety,
      farmerObservations: body.farmerObservations,
      captureLat: clampNumber(body.captureLat, -90, 90) ?? null,
      captureLon: clampNumber(body.captureLon, -180, 180) ?? null,
      captureAccuracyM: clampNumber(body.captureAccuracyM, 0, 100000) ?? null,
      gpsStatus: body.gpsStatus,
      peril: typeof body.peril === "string" ? body.peril.trim().toLowerCase() : undefined,
      intentId: typeof body.intentId === "string" ? body.intentId.trim() : undefined,
      plotLat: clampNumber(body.plotLat, -90, 90) ?? null,
      plotLon: clampNumber(body.plotLon, -180, 180) ?? null,
      sowingDate:
        typeof body.sowingDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.sowingDate.trim())
          ? body.sowingDate.trim()
          : undefined,
      createdBy: auth.actor.userId,
      images,
    };
    const result = await persistAndInfer(store, input, inferCropDisease, inferOptions);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Persist failed";
    const status = message === "Claim not found" ? 404 : 500;
    return NextResponse.json({ error: status === 404 ? "Claim not found" : "Persist failed" }, { status });
  }
}
