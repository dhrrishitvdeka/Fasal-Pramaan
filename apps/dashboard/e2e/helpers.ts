import type { Page, Route } from "@playwright/test";
import { test } from "@playwright/test";

export const E2E_CLAIM_ID = "e2e-claim-0001";

/**
 * All specs skip unless a staging Supabase URL is provided for the run —
 * except in CI, where a missing secret fails loudly instead of reporting a
 * false-green "passed with 0 tests" run.
 */
export function requiresStagingSupabase() {
  const missing = !process.env.E2E_SUPABASE_URL;
  if (missing && process.env.CI) {
    throw new Error(
      "E2E_SUPABASE_URL is not set in CI — configure the staging secret instead of skipping.",
    );
  }
  test.skip(missing, "E2E_SUPABASE_URL is not set — skipping browser E2E against staging.");
}

export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/** AppShell session probe — grants roles so guarded portals render. */
export async function mockMe(page: Page, role: "farmer" | "reviewer" | "administrator") {
  await page.context().addCookies([
    {
      name: "sb-e2e-auth-token",
      value: "e2e-session",
      domain: "localhost",
      path: "/",
    },
  ]);
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
