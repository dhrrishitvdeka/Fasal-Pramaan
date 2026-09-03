import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";

describe("next.config.mjs redirects", () => {
  it("includes redirect from /analytics to /overview#analytics", async () => {
    expect(nextConfig.redirects).toBeDefined();
    if (typeof nextConfig.redirects === "function") {
      const redirects = await nextConfig.redirects();
      const analyticsRedirect = redirects.find((r: { source: string }) => r.source === "/analytics");
      expect(analyticsRedirect).toBeDefined();
      expect(analyticsRedirect?.destination).toBe("/overview#analytics");
      expect(analyticsRedirect?.permanent).toBe(false);
    }
  });
});
