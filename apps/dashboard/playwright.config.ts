import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";

// The dev webServer is only booted when PLAYWRIGHT_E2E=1 is set explicitly
// (e.g. `PLAYWRIGHT_E2E=1 npm run e2e`). Plain `npm run e2e` / `npm test`
// against an already-running server never spawns a second Next.js process.
const bootWebServer = process.env.PLAYWRIGHT_E2E === "1";

const webServerConfig = bootWebServer
  ? {
      webServer: {
        // Production build + start — tests must exercise the shipped artifact,
        // not the dev server (different bundle, different error surfaces).
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        timeout: 300_000,
        reuseExistingServer: true,
        env: {
          // Point the client bundle at a staging project so pages take the
          // "Supabase configured" code paths; every network call is mocked via
          // page.route in the specs themselves.
          ...(process.env.E2E_SUPABASE_URL
            ? {
                NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL,
                NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
                  process.env.E2E_SUPABASE_ANON_KEY || "e2e-anon-key",
              }
            : {}),
        },
      },
    }
  : {};

const config: PlaywrightTestConfig = defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mobile-pixel-7",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        userAgent:
          "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      },
    },
  ],
  ...webServerConfig,
});

export default config;
