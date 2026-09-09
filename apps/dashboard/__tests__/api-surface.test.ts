import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveClaimClientPath } from "../src/lib/claim-routes";
import * as Api from "../src/lib/api";

/**
 * End-to-end wiring contract: every hosted API that touches farmer/reviewer
 * data must go through a Next.js route (no leftover /backend) and map onto
 * the six web_* tables + one private bucket.
 */
const DATA_PLANE: Array<{ route: string; tables: string[]; storage?: boolean }> = [
  { route: "/api/auth/login", tables: ["web_profiles"] },
  { route: "/api/auth/signup", tables: ["web_profiles"] },
  { route: "/api/auth/logout", tables: [] },
  { route: "/api/auth/forgot", tables: [] },
  { route: "/api/auth/callback", tables: [] },
  { route: "/api/me", tables: ["web_profiles"] },
  { route: "/api/farmer/state", tables: ["web_plots", "web_claims", "web_claim_images", "web_milestones", "web_profiles"], storage: true },
  { route: "/api/farmer/plots", tables: ["web_plots", "web_milestones"] },
  { route: "/api/farmer/plots/[id]/timeline", tables: ["web_plots", "web_milestones"] },
  { route: "/api/milestones/[id]", tables: ["web_milestones"] },
  { route: "/api/claims", tables: ["web_claims", "web_claim_images", "web_plots"], storage: true },
  { route: "/api/claims/[id]", tables: ["web_claims", "web_claim_images"], storage: true },
  { route: "/api/claims/[id]/action", tables: ["web_claims", "web_review_actions"] },
  { route: "/api/claims/[id]/actions", tables: ["web_claims", "web_review_actions"] },
  { route: "/api/claims/[id]/reanalyze", tables: ["web_claims", "web_claim_images"], storage: true },
  { route: "/api/reviewer/stats", tables: ["web_claims", "web_claim_images", "web_review_actions"], storage: true },
  { route: "/api/saathi/tool", tables: ["web_plots", "web_claims", "web_milestones"] },
  { route: "/api/vision/gate", tables: [] },
  { route: "/api/context/assemble", tables: [] },
  { route: "/api/voice/session", tables: [] },
  { route: "/api/health", tables: [] },
  { route: "/api/system/status", tables: [] },
];

const APP_TABLES = [
  "web_plots",
  "web_claims",
  "web_claim_images",
  "web_milestones",
  "web_review_actions",
  "web_profiles",
];

function listRouteFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listRouteFiles(full, `${prefix}/${name}`));
    } else if (name === "route.ts") {
      out.push(prefix || "/");
    }
  }
  return out;
}

describe("hosted data-plane surface", () => {
  const apiRoot = join(process.cwd(), "src/app/api");
  const onDisk = listRouteFiles(apiRoot).map((p) => `/api${p}`.replace(/\\/g, "/"));

  it("has a route module for every data-plane path", () => {
    for (const entry of DATA_PLANE) {
      expect(onDisk, `missing ${entry.route}`).toContain(entry.route);
    }
  });

  it("does not grow a seventh data table", () => {
    const used = new Set(DATA_PLANE.flatMap((e) => e.tables));
    expect([...used].sort()).toEqual([...APP_TABLES].sort());
  });

  it("only the evidence bucket is referenced for storage", () => {
    const storageRoutes = DATA_PLANE.filter((e) => e.storage).map((e) => e.route);
    expect(storageRoutes.length).toBeGreaterThan(0);
    expect(storageRoutes.every((r) => r.startsWith("/api/"))).toBe(true);
  });

  it("claim client resolver is hosted-only and never offers retired paths", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/claim-routes.ts"), "utf8");
    expect(source).not.toContain('"/submissions"');
    expect(source).not.toContain('"/review/queue"');
    expect(source).not.toContain('"/backend"');
    expect(resolveClaimClientPath(true, "list").path).toBe("/api/claims");
    expect(resolveClaimClientPath(false, "submit").path).toBe("/api/claims");
    expect(resolveClaimClientPath(true, "get", "abc").path).toBe("/api/claims/abc");
    expect(resolveClaimClientPath(false, "action", "abc").path).toBe("/api/claims/abc/action");
    expect(onDisk).toContain("/api/claims");
    expect(onDisk).not.toContain("/submissions");
    expect(onDisk).not.toContain("/review/queue");
  });

  it("does not export unused analytics wrappers from the live API client", () => {
    expect("analyticsByCategory" in Api).toBe(false);
    expect("analyticsBySeverity" in Api).toBe(false);
    expect("analyticsByCrop" in Api).toBe(false);
    expect(typeof Api.listClaims).toBe("function");
    expect(typeof Api.overviewStats).toBe("function");
  });
});
