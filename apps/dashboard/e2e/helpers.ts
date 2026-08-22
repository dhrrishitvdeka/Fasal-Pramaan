import type { Page, Route } from "@playwright/test";
import { deflateSync } from "node:zlib";
import { test } from "@playwright/test";

export const E2E_CLAIM_ID = "e2e-claim-0001";

/** All specs skip unless a staging Supabase URL is provided for the run. */
export function requiresStagingSupabase() {
  test.skip(
    !process.env.E2E_SUPABASE_URL,
    "E2E_SUPABASE_URL is not set — skipping browser E2E against staging.",
  );
}

export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** AppShell session probe — grants roles so guarded portals render. */
export async function mockMe(page: Page, role: "farmer" | "reviewer" | "administrator") {
  await page.route("**/api/me", (route) =>
    json(route, {
      userId: "e2e-user-1",
      email: `${role}@e2e.fasalpramaan.test`,
      role,
      roles: [role],
    }),
  );
}

export function farmerPlotFixture() {
  return {
    id: "plot-e2e-1",
    name: "E2E Wheat Plot",
    nameHi: "ई2ई गेहूं खेत",
    khasraNumber: "123/4",
    areaHectares: 1.5,
    cropType: "Wheat",
    cropTypeHi: "गेहूं",
    cropVariety: "HD-3086",
    currentStage: "grain_fill",
    currentStageHi: "दाना भरना",
    sowingDate: "2026-11-15",
    soilType: "Loam",
    soilTypeHi: "दोमट",
    irrigationType: "Canal",
    irrigationTypeHi: "नहर",
    lat: 28.61,
    lon: 77.21,
    village: "E2EVillage",
    district: "E2EDistrict",
    state: "E2EState",
  };
}

export function submissionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: E2E_CLAIM_ID,
    crop_cycle_id: "plot-e2e-1",
    status: "submitted",
    capture_lat: 28.61,
    capture_lon: 77.21,
    capture_accuracy_m: 8,
    farmer_observations: "Fire burned part of the field",
    severity: "high",
    peril: "normal",
    images: [
      {
        id: "img-e2e-1",
        angle_type: "wide_field",
        upload_status: "uploaded",
        download_url: null,
        sha256: "a".repeat(64),
        quality_flags: { lighting_score: 90 },
      },
      {
        id: "img-e2e-2",
        angle_type: "closeup_damage",
        upload_status: "uploaded",
        download_url: null,
        sha256: "b".repeat(64),
        quality_flags: { lighting_score: 85 },
      },
    ],
    latest_prediction: {
      model_version: "e2e-model",
      adapter_type: "none",
      is_production_validated: true,
      predicted_crop: "Wheat",
      crop_confidence: 0.91,
      primary_damage: "leaf_blight",
      severity: "moderate",
      overall_confidence: 0.88,
      quality_warnings: [],
      anomaly_flags: [],
    },
    latest_evaluation: {
      quality: { score: 90, available: true, details: null },
      coverage: { score: 92, available: true, details: null },
      context: { score: 100, available: true, details: null },
      integrity: { score: 100, available: true, details: null },
      confidence: { final: 93, threshold: 85 },
      created_at: "2026-08-01T10:00:00.000Z",
    },
    ...overrides,
  };
}

/**
 * Build a 1x1 opaque white PNG at runtime (no binary fixtures in the repo).
 * Used to exercise the gallery/file-upload fallback path in headless runs
 * where camera permission prompts are unavailable.
 */
export function whitePngBuffer(): Buffer {
  const width = 1;
  const height = 1;

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // zlib stream wrapping the filtered scanlines (filter byte + white RGB).
  const raw = new Uint8Array([0x00, 0xff, 0xff, 0xff]);
  const zlib = new Uint8Array(deflateSync(Buffer.from(raw)));

  function chunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const iend = new Uint8Array(0);

  const parts = [signature, chunk("IHDR", ihdr), chunk("IDAT", zlib), chunk("IEND", iend)];
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return Buffer.from(png);
}
