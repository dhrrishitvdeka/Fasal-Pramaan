import { expect, test } from "@playwright/test";
import { json, mockMe, requiresStagingSupabase } from "./helpers";

test.describe("smoke", () => {
  requiresStagingSupabase();

  test("landing page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Fasal-Pramaan").first()).toBeVisible();
  });

  test("/login renders the sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("unauthenticated /review is redirected to login", async ({ page }) => {
    // No session mocks: AppShell probes /api/me and bounces to /login.
    await page.goto("/review");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.locator("#email")).toBeVisible();
  });

  test("health page renders liveness", async ({ page }) => {
    await mockMe(page, "reviewer");
    await page.route("**/api/health", (route) =>
      json(route, {
        ok: true,
        status: "ok",
        timestamp: new Date().toISOString(),
      }),
    );
    await page.goto("/health");
    await expect(page.getByText("System health")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Liveness")).toBeVisible();
    await expect(page.getByText(/is up/i)).toBeVisible();
  });
});
