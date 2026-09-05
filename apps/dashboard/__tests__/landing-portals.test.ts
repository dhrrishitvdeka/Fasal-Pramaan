import { describe, expect, it } from "vitest";
import { LANDING_ACTIONS } from "../src/lib/landing-actions";

describe("landing portal actions", () => {
  it("keeps Farmer Portal and Reviewer Centre on the real hosted routes", () => {
    expect(LANDING_ACTIONS.map((item) => item.href)).toEqual(["/farmer/saathi", "/overview"]);
    expect(LANDING_ACTIONS[0].en).toBe("Start with Fasal Saathi");
    expect(LANDING_ACTIONS[1].en).toBe("Reviewer Centre");
    for (const item of LANDING_ACTIONS) {
      expect(item.en).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
      expect(item.hi).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });
});
