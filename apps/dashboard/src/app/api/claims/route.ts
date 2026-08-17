import { NextResponse } from "next/server";
import { persistAndInfer, listReviewerQueue, type PersistClaimInput } from "@/lib/claim-pipeline";
import { inferCropDisease } from "@/lib/hf-infer";
import { createServerSupabase } from "@/lib/supabase";
import { createSupabaseClaimStore } from "@/lib/supabase-store";

function decodeDataUrl(value: string): { bytes: Uint8Array; contentType: string } {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Image must be a data URL");
  }
  return {
    contentType: match[1],
    bytes: Uint8Array.from(Buffer.from(match[2], "base64")),
  };
}

export async function GET() {
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ items: [] });
  }
  const items = await listReviewerQueue(createSupabaseClaimStore(supabase));
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const supabase = createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const body = await request.json();
  const images = (body.images || []).map(
    (img: { imageDataUrl: string; angleType: string; sha256?: string; lat?: number; lon?: number; accuracyM?: number }) => {
      const decoded = decodeDataUrl(img.imageDataUrl);
      return {
        angleType: img.angleType,
        bytes: decoded.bytes,
        contentType: decoded.contentType,
        sha256: img.sha256,
        lat: img.lat,
        lon: img.lon,
        accuracyM: img.accuracyM,
      };
    },
  );
  const input: PersistClaimInput = {
    id: body.id,
    plotId: body.plotId,
    plotName: body.plotName,
    plotNameHi: body.plotNameHi,
    khasraNumber: body.khasraNumber,
    cropType: body.cropType,
    cropTypeHi: body.cropTypeHi,
    cropVariety: body.cropVariety,
    farmerObservations: body.farmerObservations,
    captureLat: body.captureLat,
    captureLon: body.captureLon,
    captureAccuracyM: body.captureAccuracyM,
    gpsStatus: body.gpsStatus,
    images,
  };
  try {
    const result = await persistAndInfer(
      createSupabaseClaimStore(supabase),
      input,
      inferCropDisease,
      { apiToken: process.env.HF_TOKEN || process.env.HUGGINGFACE_API_TOKEN },
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Persist failed" },
      { status: 500 },
    );
  }
}
