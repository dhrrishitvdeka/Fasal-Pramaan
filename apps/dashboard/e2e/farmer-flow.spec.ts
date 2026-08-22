import { expect, test } from "@playwright/test";
import {
  E2E_CLAIM_ID,
  farmerPlotFixture,
  json,
  mockMe,
  requiresStagingSupabase,
  submissionFixture,
  whitePngBuffer,
} from "./helpers";

test.describe("farmer capture flow", () => {
  requiresStagingSupabase();

  test("saathi intake -> peril chip -> capture via file-upload fallback -> claim detail", async ({
    page,
  }) => {
    // Slow end-to-end walk through several pages.
    test.slow();

    // Force the English locale so assertions are deterministic.
    await page.addInitScript(() => {
      window.localStorage.setItem("fp_farmer_lang_v1", "en");
    });

    // Session: farmer role lets AppShell through /farmer/* routes.
    await mockMe(page, "farmer");

    // Farmer portal data.
    await page.route("**/api/farmer/state", (route) =>
      json(route, {
        plots: [farmerPlotFixture()],
        claims: [],
        milestones: [],
        profile: {
          name: "E2E Farmer",
          nameHi: "",
          kisanId: "E2E-1234",
          phone: "",
          village: "E2EVillage",
          district: "E2EDistrict",
          state: "E2EState",
        },
      }),
    );

    // Saathi autonomous classification (Enter-key turn).
    await page.route("**/api/saathi/tool", (route) =>
      json(route, { ok: true, data: { peril: "fire_burn", confidence: 0.97 } }),
    );

    // Vision gate: every captured/uploaded frame is usable.
    await page.route("**/api/vision/gate", (route) =>
      json(route, { usable: true, crop_detected: "wheat", warnings: [] }),
    );

    // Claim persistence: create returns the fixture id; detail fetch serves the submission.
    let createdClaims = 0;
    await page.route("**/api/claims", async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        createdClaims += 1;
        return json(route, { claimId: E2E_CLAIM_ID });
      }
      return json(route, { items: [] });
    });
    await page.route(`**/api/claims/${E2E_CLAIM_ID}`, (route) =>
      json(route, submissionFixture()),
    );

    // --- Saathi intake ---
    await page.goto("/farmer/saathi");
    const intake = page.locator('input[placeholder*="Type or speak"]');
    await expect(intake).toBeVisible({ timeout: 15_000 });
    await intake.fill("Fire burned half of my wheat field near the bund");
    await intake.press("Enter");

    // Quick peril chip confirms fire_burn routing.
    await page.getByRole("button", { name: /Fire/ }).first().click();
    await expect(page.getByText(/Fire \/ Burn/, { exact: false })).toBeVisible();

    // Proceed to guided capture.
    await page.getByRole("button", { name: /Open Capture/ }).click();
    await expect(page).toHaveURL(/\/farmer\/capture\?.*peril=fire_burn/);

    // --- Camera permission fails headless -> gallery/file-upload fallback ---
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 15_000 });
    const png = whitePngBuffer();
    // fire_burn route: wide_field, mid_canopy, closeup_damage — three angles,
    // auto-advancing after each successful upload.
    for (let i = 0; i < 3; i += 1) {
      await fileInput.setInputFiles({
        name: `e2e-crop-${i}.png`,
        mimeType: "image/png",
        buffer: png,
      });
      await expect(page.getByText(/captured successfully/i).first()).toBeVisible({
        timeout: 15_000,
      });
    }

    // All angles ready -> submit becomes enabled.
    const submit = page.getByRole("button", { name: /Submit Verified Claim/ });
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    await submit.click();

    // Redirect to the freshly created claim detail.
    await expect(page).toHaveURL(
      new RegExp(`/farmer/claims/${E2E_CLAIM_ID}\\?submitted=true`),
      { timeout: 20_000 },
    );
    await expect(page.getByText("Claim Record Not Found")).toHaveCount(0);
    expect(createdClaims).toBe(1);
  });
});
