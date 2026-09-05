import { describe, expect, it } from "vitest";
import {
  INDIAN_STATES,
  SOIL_TYPES,
  IRRIGATION_TYPES,
  SUPPORTED_CROPS,
  CROP_SEASONS,
  TENANCY_TYPES,
} from "../src/lib/plot-metadata";
import { PLOT_CROP_KEYS, plotSchema } from "../src/lib/schemas";
import { toKattha, katthaToHectares, getAreaBreakdown, type AreaUnit } from "../src/lib/land-units";

describe("Plot Registration & Cadastral Synchronization", () => {
  it("synchronizes all supported crops with API schema crop keys", () => {
    const cropValues = SUPPORTED_CROPS.map((c) => c.value);
    expect(cropValues).toEqual(expect.arrayContaining([...PLOT_CROP_KEYS]));
    expect(cropValues.length).toBe(PLOT_CROP_KEYS.length);

    // Each crop should have valid English and Hindi labels
    SUPPORTED_CROPS.forEach((crop) => {
      expect(crop.labelEn.length).toBeGreaterThan(0);
      expect(crop.labelHi.length).toBeGreaterThan(0);
    });
  });

  it("contains major Indian agricultural states with no duplicates", () => {
    expect(INDIAN_STATES).toContain("Bihar");
    expect(INDIAN_STATES).toContain("Uttar Pradesh");
    expect(INDIAN_STATES).toContain("Punjab");
    expect(INDIAN_STATES).toContain("Madhya Pradesh");
    expect(INDIAN_STATES).toContain("Maharashtra");

    const uniqueStates = new Set(INDIAN_STATES);
    expect(uniqueStates.size).toBe(INDIAN_STATES.length);
  });

  it("defines standard soil and irrigation options with bilingual labels", () => {
    expect(SOIL_TYPES.length).toBeGreaterThanOrEqual(5);
    SOIL_TYPES.forEach((st) => {
      expect(st.value).toBeTruthy();
      expect(st.labelEn).toBeTruthy();
      expect(st.labelHi).toBeTruthy();
    });

    expect(IRRIGATION_TYPES.length).toBeGreaterThanOrEqual(4);
    IRRIGATION_TYPES.forEach((it) => {
      expect(it.value).toBeTruthy();
      expect(it.labelEn).toBeTruthy();
      expect(it.labelHi).toBeTruthy();
    });
  });

  it("defines standard crop seasons and tenancy types", () => {
    const seasons = CROP_SEASONS.map((s) => s.value);
    expect(seasons).toEqual(["Rabi", "Kharif", "Zaid"]);

    const tenancies = TENANCY_TYPES.map((t) => t.value);
    expect(tenancies).toEqual(["owner", "tenant", "sharecropper"]);
  });

  it("validates full land revenue record payload with Zod plotSchema", () => {
    const validPayload = {
      name: "North Field / उत्तर खेत",
      khasraNumber: "125/2",
      khataNumber: "42",
      hissaNumber: "1A",
      tehsil: "Bikram",
      village: "Jagdishpur",
      district: "Patna",
      state: "Bihar",
      ownershipType: "owner",
      season: "Rabi",
      cropType: "wheat" as const,
      cropVariety: "HD-2967",
      areaKattha: 10,
      areaUnit: "kattha" as const,
      soilType: "Alluvial / Loam",
      irrigationType: "Tube-well",
      sowingDate: "2026-10-15",
      lat: 25.5941,
      lon: 85.1376,
    };

    const parsed = plotSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("North Field / उत्तर खेत");
      expect(parsed.data.khasraNumber).toBe("125/2");
      expect(parsed.data.cropType).toBe("wheat");
      expect(parsed.data.lat).toBe(25.5941);
      expect(parsed.data.lon).toBe(85.1376);
    }
  });

  it("rejects empty plot name in plotSchema", () => {
    const invalidPayload = {
      name: "   ",
      khasraNumber: "125/2",
      cropType: "wheat",
    };
    const parsed = plotSchema.safeParse(invalidPayload);
    expect(parsed.success).toBe(false);
  });

  it("converts area across Kattha, Bigha, Acre, and Hectare accurately", () => {
    // 10 Kattha = 0.5 Bigha = ~0.1265 Hectare = 0.3125 Acre
    const kattha = 10;
    const ha = katthaToHectares(kattha);
    expect(ha).toBeCloseTo(0.1265, 4);

    const breakdown = getAreaBreakdown(kattha);
    expect(breakdown.kattha).toBe(10);
    expect(breakdown.bigha).toBe(0.5);
    expect(breakdown.acres).toBe(0.313);
    expect(breakdown.sqFt).toBe(13613);

    // Bigha to Kattha
    expect(toKattha(1, "bigha" as AreaUnit)).toBe(20);

    // Acre to Kattha
    expect(toKattha(1, "acre" as AreaUnit)).toBe(32);

    // Hectare to Kattha
    expect(toKattha(0.01265, "hectare" as AreaUnit)).toBeCloseTo(1, 1);
  });

  it("handles boundary values and edge cases gracefully", () => {
    // Zero or negative values
    expect(katthaToHectares(0)).toBe(0);
    expect(katthaToHectares(-5)).toBe(0);
    expect(toKattha(0, "kattha" as AreaUnit)).toBe(0);
    expect(toKattha(-2, "acre" as AreaUnit)).toBe(0);

    // Fractional values
    expect(katthaToHectares(0.5)).toBeGreaterThan(0);
    const fractionBreakdown = getAreaBreakdown(0.5);
    expect(fractionBreakdown.kattha).toBe(0.5);
    expect(fractionBreakdown.sqFt).toBe(681);
  });
});
