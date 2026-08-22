import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { json, mockMe, requiresStagingSupabase, submissionFixture } from "./helpers";

test.describe("reviewer triage flow", () => {
  requiresStagingSupabase();

  test("queue renders rows, peril filter narrows, CSV downloads", async ({ page }) => {
    // Session: reviewer role unlocks the command centre.
    await mockMe(page, "reviewer");

    const fireClaim = submissionFixture({
      id: "e2e-fire-0002",
      peril: "fire_burn",
      status: "under_review",
      severity: "high",
      farmer_observations: "Burnt patch along the northern edge",
      latest_prediction: {
        model_version: "e2e-model",
        adapter_type: "none",
        is_production_validated: true,
        predicted_crop: "Wheat",
        crop_confidence: 0.9,
        primary_damage: "burn_scar",
        severity: "high",
        overall_confidence: 0.83,
        quality_warnings: [],
        anomaly_flags: [],
      },
    });
    const normalClaim = submissionFixture({ id: "e2e-rev-0001", peril: "normal" });

    // Queue data source.
    await page.route("**/api/claims", (route) => json(route, { items: [normalClaim, fireClaim] }));

    // Reviewer stats aggregate (as served to overview/analytics surfaces).
    await page.route("**/api/reviewer/stats", (route) =>
      json(route, {
        overview: {
          total_submissions: 2,
          submissions_today: 2,
          pending_ai_processing: 0,
          pending_human_review: 2,
          approved_claims: 0,
          rejected_claims: 0,
          total_area_affected: 1.5,
          estimated_loss_inr: 42000,
          avg_confidence: 0.9,
        },
        markers: [],
        alerts: [],
        analytics: {
          byCategory: [],
          bySeverity: [],
          byCrop: [{ crop: "Wheat", count: 2 }],
        },
        actions: [],
        claims: [normalClaim, fireClaim],
      }),
    );

    // The Export CSV control sits behind the md: breakpoint; normalize the
    // mobile project so the same assertions run everywhere.
    if (!test.info().project.name.includes("desktop")) {
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    await page.goto("/review");
    await expect(page.getByText(/Review Queue|All Cases/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // Both fixture rows render.
    await expect(page.getByText("e2e-rev…")).toBeVisible();
    await expect(page.getByText("e2e-fire…")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(2);

    // Peril filter narrows to the single fire_burn case.
    await page.locator("select").first().selectOption({ label: "Fire / Burn" });
    await expect(page.getByText("e2e-fire…")).toBeVisible();
    await expect(page.getByText("e2e-rev…")).toHaveCount(0);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    // CSV export emits a browser download with the expected payload.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export CSV/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^fasal-pramaan-review-\d{8}-\d{4}\.csv$/);
    const csv = readFileSync(await download.path(), "utf8");
    expect(csv).toContain("e2e-fire-0002");
    expect(csv).not.toContain("e2e-rev-0001");
  });
});
