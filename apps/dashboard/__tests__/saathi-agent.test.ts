import { describe, expect, it } from "vitest";
import { routeForPeril } from "../src/lib/claim-routing";
import {
  SAATHI_FUNCTION_DECLARATIONS,
  buildSystemPrompt,
  buildSaathiReply,
  extractSlotsFromText,
  initialSaathiGreeting,
  mergeSlots,
  slotsToIntent,
  type SaathiSlot,
} from "../src/lib/saathi-agent";

const emptyPlots: Parameters<typeof extractSlotsFromText>[1] = [];

describe("saathi agent", () => {
  it("extracts peril and crop slots from farmer free text", () => {
    const slots = extractSlotsFromText("fire burnt my wheat field", emptyPlots);
    expect(slots.peril).toBe("fire_burn");
    expect(slots.crop).toBe("Wheat");
    expect(slots.farmerNote).toBe("fire burnt my wheat field");
  });

  it("mergeSlots keeps the newest farmer note from b over a", () => {
    const a: SaathiSlot = { peril: "fire_burn", farmerNote: "older note" };
    const merged = mergeSlots(a, { crop: "Wheat", farmerNote: "newer note" });
    expect(merged.farmerNote).toBe("newer note");
    expect(merged.crop).toBe("Wheat");
    expect(merged.peril).toBe("fire_burn");
  });

  it("slotsToIntent produces a ClaimIntent wired to the route config", () => {
    const intent = slotsToIntent(
      { peril: "fire_burn", crop: "Wheat", village: "Rampur" },
      "saathi_text",
    );
    expect(intent.source).toBe("saathi_text");
    expect(intent.peril).toBe("fire_burn");
    expect(intent.perilLabelEn).toBe(routeForPeril("fire_burn").labelEn);
    expect(intent.perilLabelHi).toBe(routeForPeril("fire_burn").labelHi);
    expect(intent.crop).toBe("Wheat");
    expect(intent.village).toBe("Rampur");
    expect(intent.id).toMatch(/^intent-/);
  });

  it("initial greeting differs between hi and en", () => {
    const hi = initialSaathiGreeting("hi");
    const en = initialSaathiGreeting("en");
    expect(hi.text).not.toBe(en.text);
    expect(hi.role).toBe("saathi");
  });

  it("buildSystemPrompt lists required angles for an active intent", () => {
    const intent = slotsToIntent({ peril: "animal_damage" });
    const cfg = routeForPeril("animal_damage");
    const prompt = buildSystemPrompt(intent, "hi");
    expect(prompt).toContain(intent.id);
    expect(prompt).toContain(cfg.requiredAngles.join(", "));
    expect(prompt).toContain(`Required angles (${cfg.requiredAngles.length})`);
    expect(buildSaathiReply({ peril: "animal_damage" }, "en").text).toContain(
      cfg.requiredAngles.join(", "),
    );
  });

  it("declares exactly the four autonomous tools", () => {
    expect(SAATHI_FUNCTION_DECLARATIONS.map((fn) => fn.name)).toEqual([
      "request_evidence_angles",
      "call_context_signal",
      "guide_capture",
      "classify_claim",
    ]);
  });
});
