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
  resolveAgenticAction,
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

  it("does not lock a peril on a short prompt such as बताइए", () => {
    expect(extractSlotsFromText("बताइए।", emptyPlots).peril).toBeUndefined();
    expect(extractSlotsFromText("ok", emptyPlots).peril).toBeUndefined();
    expect(extractSlotsFromText("hello", emptyPlots).peril).toBeUndefined();
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
    expect(hi.text).toContain("नमस्ते! मैं फसल साथी हूँ।");
    expect(hi.textHi).toBe(hi.text);
    expect(en.text).toContain("Hi, I am Fasal Saathi");
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

  it("declares the complete autonomous agent tool suite", () => {
    expect(SAATHI_FUNCTION_DECLARATIONS.map((fn) => fn.name)).toEqual([
      "request_evidence_angles",
      "call_context_signal",
      "guide_capture",
      "classify_claim",
      "take_photo",
      "switch_camera",
      "select_angle",
      "retake_angle",
      "set_observation",
      "submit_claim",
      "check_evidence_quality",
    ]);
  });

  describe("Autonomous Agentic Intent Resolution", () => {
    it("resolves direct camera capture order with peril angles", () => {
      const res = resolveAgenticAction("खेत में आग लग गई है, फोटो खींचनी है", {}, emptyPlots, "hi");
      expect(res.action).toBeDefined();
      expect(res.action?.type).toBe("open_camera");
      expect(res.slots.peril).toBe("fire_burn");
      expect(res.actionSummaryHi).toContain("कैमरा");
    });

    it("resolves navigation orders for verified claims and plots", () => {
      const resClaims = resolveAgenticAction("सत्यापित दावे दिखाओ", {}, emptyPlots, "hi");
      expect(resClaims.action?.type).toBe("navigate");
      if (resClaims.action?.type === "navigate") {
        expect(resClaims.action.url).toBe("/farmer/claims?status=verified");
      }

      const resPlots = resolveAgenticAction("मेरे पंजीकृत खेत दिखाओ", {}, emptyPlots, "hi");
      expect(resPlots.action?.type).toBe("navigate");
      if (resPlots.action?.type === "navigate") {
        expect(resPlots.action.url).toBe("/farmer#registered-plots");
      }
    });

    it("resolves language switching orders autonomously", () => {
      const resHi = resolveAgenticAction("हिंदी में बात करो", {}, emptyPlots, "en");
      expect(resHi.action?.type).toBe("switch_language");
      if (resHi.action?.type === "switch_language") {
        expect(resHi.action.lang).toBe("hi");
      }

      const resGu = resolveAgenticAction("ગુજરાતીમાં વાત કરો", {}, emptyPlots, "hi");
      expect(resGu.action?.type).toBe("switch_language");
      if (resGu.action?.type === "switch_language") {
        expect(resGu.action.lang).toBe("gu");
      }
    });
  });
});
