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

  test("health page renders status blocks", async ({ page }) => {
    // The shell gates reviewer pages on a session; grant one for this page.
    await mockMe(page, "reviewer");
    await page.route("**/api/health", (route) =>
      json(route, {
        ok: true,
        status: "ok",
        mode: "hosted",
        checks: {
          next: { ok: true },
          supabase: { ok: true },
          huggingface_space: { ok: true },
          gemini: { configured: false },
        },
      }),
    );
    await page.goto("/health");
    await expect(page.getByText("System health")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Dependency checks")).toBeVisible();
    await expect(page.locator("pre").first()).toContainText("ok");
  });
});
