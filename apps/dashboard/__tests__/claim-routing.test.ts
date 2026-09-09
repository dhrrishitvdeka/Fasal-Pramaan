import { describe, expect, it } from "vitest";
import * as ClaimRouting from "../src/lib/claim-routing";
import {
  anglesForPeril,
  classifyPerilHeuristic,
  normalizePeril,
  PERIL_OPTIONS,
  routeForPeril,
} from "../src/lib/claim-routing";

describe("peril routing", () => {
  it("normalizePeril maps common aliases onto canonical perils", () => {
    expect(normalizePeril("fire")).toBe("fire_burn");
    expect(normalizePeril("animal")).toBe("animal_damage");
    expect(normalizePeril("waterlogging")).toBe("flood");
    expect(normalizePeril("inundation")).toBe("flood");
    expect(normalizePeril("hail")).toBe("hailstorm");
    expect(normalizePeril("something-else-entirely")).toBe("normal");
    expect(normalizePeril(undefined)).toBe("normal");
  });

  it("routeForPeril applies per-peril thresholds and satellite need", () => {
    expect(routeForPeril("normal").minConfidence).toBe(85);
    expect(routeForPeril("fire_burn").minConfidence).toBe(70);
    expect(routeForPeril("animal_damage").minConfidence).toBe(75);
    expect(routeForPeril("fire_burn").needsSatellite).toBe(true);
    expect(routeForPeril("animal_damage").needsSatellite).toBe(false);
    expect(routeForPeril("flood").needsSatellite).toBe(true);
    expect(routeForPeril("drought").needsSatellite).toBe(true);
    expect(routeForPeril("flood").contextChecks).toContain("sentinel_water");
    expect(routeForPeril("drought").contextChecks).toContain("sentinel_ndvi");
    expect(routeForPeril("normal").needsSatellite).toBe(false);
  });

  it("anglesForPeril keeps canonical order filtered to the peril's angle set", () => {
    // Perils route through the 3-screen evidence photo set in CANONICAL_ANGLES order
    const fireIds = anglesForPeril("fire_burn").map((a) => a.id);
    expect(fireIds).toEqual(["photo_1", "photo_2", "photo_3"]);
    expect(anglesForPeril("normal").map((a) => a.id)).toEqual([
      "photo_1",
      "photo_2",
      "photo_3",
    ]);
  });

  it("exposes PERIL_OPTIONS as the live peril list and does not export PERIL_TYPES", () => {
    expect("PERIL_TYPES" in ClaimRouting).toBe(false);
    expect(PERIL_OPTIONS.map((p) => p.value)).toEqual([
      "normal",
      "fire_burn",
      "animal_damage",
      "flood",
      "drought",
      "pest_disease",
      "hailstorm",
      "lodging",
    ]);
    expect(PERIL_OPTIONS.every((p) => routeForPeril(p.value).peril === p.value)).toBe(true);
  });

  it("classifyPerilHeuristic reads farmer free text into peril + confidence", () => {
    const fire = classifyPerilHeuristic("aag lag gayi khet me");
    expect(fire.peril).toBe("fire_burn");
    expect(fire.confidence).toBeGreaterThan(0.8);

    const animal = classifyPerilHeuristic("wild boar ate paddy");
    expect(animal.peril).toBe("animal_damage");

    const unknown = classifyPerilHeuristic("kuch khaas nahi hua aaj");
    expect(unknown.peril).toBe("normal");
    expect(unknown.confidence).toBeLessThan(0.55);
  });
});
