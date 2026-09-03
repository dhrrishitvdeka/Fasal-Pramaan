import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import {
  persistAndInfer,
  recaptureAndInfer,
  inferAndAttachToClaim,
  claimToSubmission,
  type PersistClaimInput,
} from "@/lib/claim-pipeline";
import { inferCropDisease } from "@/lib/gemini-analyze";
import { createServerSupabase } from "@/lib/supabase";
import { createSupabaseClaimStore } from "@/lib/supabase-store";
import { isReviewerRole, requireWebActor } from "@/lib/web-auth";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { claimSubmissionSchema } from "@/lib/schemas";

export const maxDuration = 60;

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
  const data = parsedBody.data;
  const rawImages = data.images;
  const claimId = data.id?.trim() || undefined;
  if (!rawImages.length || rawImages.length > MAX_IMAGES) {
    return NextResponse.json({ error: `Send between 1 and ${MAX_IMAGES} images` }, { status: 400 });
  }
  let images: PersistClaimInput["images"];
  try {
    images = rawImages
      .filter((img) => String(img.imageDataUrl || "").startsWith("data:"))
      .map((img) => {
        const decoded = decodeDataUrl(String(img.imageDataUrl || ""));
        // Always recompute the digest from the actual bytes — a client-sent
        // sha256 is untrusted and would let stale gate results be replayed.
        const sha256 = createHash("sha256").update(decoded.bytes).digest("hex");
        return {
          angleType: String(img.angleType || "closeup_damage"),
          bytes: decoded.bytes,
          contentType: decoded.contentType,
          sha256,
          lat: img.lat,
          lon: img.lon,
          accuracyM: img.accuracyM,
          lightingScore: img.lightingScore,
          qualityPassed: img.qualityPassed,
          blurScore: img.blurScore,
          greenPct: img.greenPct,
          luma: img.luma,
          cropScore: img.cropScore,
          facing: img.facing,
          dimensions: img.dimensions ?? undefined,
          capturedAt: img.capturedAt || undefined,
          farmerObservation: data.farmerObservations?.trim() || undefined,
        };
      });
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
  // Reject claims referencing a plot the caller does not own (cross-tenant guard).
  const requestedPlotId = data.plotId?.trim() || null;
  if (requestedPlotId) {
    const plotRow = await supabase
      .from("web_plots")
      .select("id, created_by")
      .eq("id", requestedPlotId)
      .maybeSingle();
    if (plotRow.error) {
      console.error("plot lookup failed:", plotRow.error.message);
      return NextResponse.json({ error: "Persist failed" }, { status: 500 });
    }
    if (!plotRow.data || plotRow.data.created_by !== auth.actor.userId) {
      return NextResponse.json({ error: "Unknown plot" }, { status: 400 });
    }
  }
  const inferOptions = {};
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
          farmerObservations: data.farmerObservations,
          captureLat: clampNumber(data.captureLat, -90, 90) ?? null,
          captureLon: clampNumber(data.captureLon, -180, 180) ?? null,
          captureAccuracyM: clampNumber(data.captureAccuracyM, 0, 100000) ?? null,
          gpsStatus: data.gpsStatus,
          images,
        },
        inferCropDisease,
        { ...inferOptions, skipInference: true },
      );
      if (result.pendingInference) {
        const cropType = existing.crop_type || undefined;
        after(() =>
          inferAndAttachToClaim(store, result.claimId, images, cropType, inferCropDisease, inferOptions).then(
            () => undefined,
            (err) => {
              console.error("deferred recapture inference failed:", err instanceof Error ? err.message : err);
            },
          ),
        );
      }
      return NextResponse.json({ claimId: result.claimId, prediction: result.prediction ?? null });
    }
    const input: PersistClaimInput = {
      plotId: data.plotId,
      plotName: data.plotName,
      plotNameHi: data.plotNameHi,
      khasraNumber: data.khasraNumber,
      cropType: data.cropType,
      cropTypeHi: data.cropTypeHi,
      cropVariety: data.cropVariety,
      farmerObservations: data.farmerObservations,
      captureLat: clampNumber(data.captureLat, -90, 90) ?? null,
      captureLon: clampNumber(data.captureLon, -180, 180) ?? null,
      captureAccuracyM: clampNumber(data.captureAccuracyM, 0, 100000) ?? null,
      gpsStatus: data.gpsStatus,
      peril: typeof data.peril === "string" ? data.peril.trim().toLowerCase() : undefined,
      intentId: typeof data.intentId === "string" ? data.intentId.trim() : undefined,
      plotLat: clampNumber(data.plotLat, -90, 90) ?? null,
      plotLon: clampNumber(data.plotLon, -180, 180) ?? null,
      sowingDate: data.sowingDate,
      createdBy: auth.actor.userId,
      images,
    };
    const result = await persistAndInfer(store, input, inferCropDisease, {
      ...inferOptions,
      skipInference: true,
    });
    if (result.pendingInference) {
      after(() =>
        inferAndAttachToClaim(
          store,
          result.claimId,
          images,
          input.cropType,
          inferCropDisease,
          inferOptions,
        ).then(
          () => undefined,
          (err) => {
            console.error("deferred claim inference failed:", err instanceof Error ? err.message : err);
          },
        ),
      );
    }
    return NextResponse.json({ claimId: result.claimId, prediction: result.prediction ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Persist failed";
    if (message === "Claim not found") {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }
    if (message === "Claim already exists") {
      return NextResponse.json({ error: "Claim already exists" }, { status: 409 });
    }
    if (/Cannot recapture|status changed/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: "Persist failed" }, { status: 500 });
  }
}
