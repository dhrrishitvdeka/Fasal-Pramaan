import { expect, test } from "@playwright/test";
import {
  E2E_CLAIM_ID,
  farmerPlotFixture,
  json,
  mockMe,
  requiresStagingSupabase,
  submissionFixture,
} from "./helpers";

test.describe("farmer capture flow", () => {
  requiresStagingSupabase();

  test("saathi intake -> peril chip -> camera-only capture studio", async ({
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

    // Claim persistence stub (camera-only: no headless capture, so no POST expected).
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
    const intake = page.locator('input[placeholder*="Type your crop issue"]');
    await expect(intake).toBeVisible({ timeout: 15_000 });
    await intake.fill("Fire burned half of my wheat field near the bund");
    await intake.press("Enter");

    // Quick peril chip confirms fire_burn routing.
    await page.getByRole("button", { name: /Fire/ }).first().click();
    await expect(page.getByText(/Fire \/ Burn/, { exact: false })).toBeVisible();

    // Proceed to guided capture.
    await page.getByRole("button", { name: /Open Camera Studio/ }).click();
    await expect(page).toHaveURL(/\/farmer\/capture\?.*peril=fire_burn/);

    // --- Camera-only studio: no gallery/file-upload fallback ---
    // Upload path was removed (fraud + authenticity): studio must not expose
    // any file picker, demo toggle, or upload affordance headless or otherwise.
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(
      page.getByText(/Live Camera — verified capture only/),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Upload|Demo/ })).toHaveCount(0);

    // With 0/3 live captures, submit stays blocked and explains what remains.
    const submit = page.getByRole("button", { name: /Submit Verified Claim/ });
    await expect(submit).toBeDisabled({ timeout: 15_000 });
    await expect(page.getByText(/Capture .* more photo/i).first()).toBeVisible();
    expect(createdClaims).toBe(0);
  });
});
