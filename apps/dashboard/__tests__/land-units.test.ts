import { describe, expect, it } from "vitest";
import {
  katthaToHectares,
  hectaresToKattha,
  katthaToBigha,
  katthaToAcres,
  toKattha,
  getAreaBreakdown,
  formatAreaDisplay,
} from "../src/lib/land-units";

describe("land-units converter", () => {
  it("converts kattha to hectares accurately", () => {
    expect(katthaToHectares(10)).toBe(0.1265);
    expect(katthaToHectares(20)).toBe(0.253);
    expect(katthaToHectares(0)).toBe(0);
  });

  it("converts hectares to kattha accurately", () => {
    expect(hectaresToKattha(0.1265)).toBe(10);
    expect(hectaresToKattha(0.253)).toBe(20);
    expect(hectaresToKattha(0)).toBe(0);
  });

  it("converts kattha to bigha (20 Kattha = 1 Bigha)", () => {
    expect(katthaToBigha(20)).toBe(1);
    expect(katthaToBigha(10)).toBe(0.5);
  });

  it("converts kattha to acres (32 Kattha = 1 Acre)", () => {
    expect(katthaToAcres(32)).toBe(1);
    expect(katthaToAcres(16)).toBe(0.5);
  });

  it("normalizes arbitrary area units to kattha", () => {
    expect(toKattha(10, "kattha")).toBe(10);
    expect(toKattha(1, "bigha")).toBe(20);
    expect(toKattha(1, "acre")).toBe(32);
    expect(toKattha(0.1265, "hectare")).toBeCloseTo(10, 1);
  });

  it("returns full area breakdown for instant UI chips", () => {
    const breakdown = getAreaBreakdown(10);
    expect(breakdown.kattha).toBe(10);
    expect(breakdown.bigha).toBe(0.5);
    expect(breakdown.acres).toBe(0.313);
    expect(breakdown.hectares).toBe(0.1265);
    expect(breakdown.sqFt).toBe(13613);
  });

  it("formats area display cleanly in English and Hindi", () => {
    const en = formatAreaDisplay(0.1265, true, "en");
    expect(en.primary).toContain("10 Kattha");
    expect(en.secondary).toContain("Bigha");
    expect(en.secondary).toContain("Ha");

    const hi = formatAreaDisplay(0.1265, true, "hi");
    expect(hi.primary).toContain("10 कट्ठा");
    expect(hi.secondary).toContain("बीघा");
    expect(hi.secondary).toContain("हेक्टेयर");
  });
});