import { describe, expect, it } from "vitest";
import {
  anglesForPeril,
  classifyPerilHeuristic,
  normalizePeril,
  routeForPeril,
} from "../src/lib/claim-routing";

describe("peril routing", () => {
  it("normalizePeril maps common aliases onto canonical perils", () => {
    expect(normalizePeril("fire")).toBe("fire_burn");
    expect(normalizePeril("animal")).toBe("animal_damage");
    expect(normalizePeril("waterlogging")).toBe("flood");
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
    expect(routeForPeril("flood").needsSatellite).toBe(false);
    expect(routeForPeril("normal").needsSatellite).toBe(false);
  });

  it("anglesForPeril keeps canonical order filtered to the peril's angle set", () => {
    // fire_burn required [wide_field, closeup_damage] + optional [mid_canopy],
    // returned in CANONICAL_ANGLES order.
    const fireIds = anglesForPeril("fire_burn").map((a) => a.id);
    expect(fireIds).toEqual(["wide_field", "mid_canopy", "closeup_damage"]);
    expect(anglesForPeril("normal").map((a) => a.id)).toEqual([
      "wide_field",
      "left_context",
      "mid_canopy",
      "right_context",
      "closeup_damage",
    ]);
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
