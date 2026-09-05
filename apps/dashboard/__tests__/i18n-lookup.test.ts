import { describe, expect, it } from "vitest";
import { GEMINI_LIVE_INDIAN_LANGUAGE_CODES } from "../src/lib/live-indian-languages";
import { t } from "../src/lib/i18n";
import { getFarmerT } from "../src/lib/farmerI18n";

describe("shipped language lookups", () => {
  it("returns real non-English chrome for Hindi, Tamil, Bengali, and Telugu", () => {
    expect(t("en", "pendingReview")).toBe("Pending Review");
    expect(t("en", "overview")).toMatch(/Overview/i);

    for (const lang of ["hi", "ta", "bn", "te"] as const) {
      expect(t(lang, "overview")).not.toBe(t("en", "overview"));
      expect(t(lang, "review")).not.toBe(t("en", "review"));
      expect(t(lang, "pendingReview")).not.toBe(t("en", "pendingReview"));
      expect(t(lang, "logout")).not.toBe(t("en", "logout"));
      expect(getFarmerT(lang).home).not.toBe(getFarmerT("en").home);
      expect(getFarmerT(lang).claims).not.toBe(getFarmerT("en").claims);
      expect(getFarmerT(lang).newClaim).not.toBe(getFarmerT("en").newClaim);
    }

    expect(t("ta", "overview")).toBe("சுருக்கம்");
    expect(getFarmerT("ta").home).toBe("முகப்பு");
    expect(t("bn", "pendingReview")).toMatch(/পর্যালোচনা/);
    expect(getFarmerT("te").reminders).toBe("టైమ్‌లైన్");
  });

  it("switches immediately when the language code changes", () => {
    const first = t("ta", "review");
    const second = t("bn", "review");
    expect(first).not.toBe(second);
    expect(getFarmerT("gu").home).not.toBe(getFarmerT("mr").home);
  });

  it("has a real chrome string for every allowlisted language", () => {
    for (const code of GEMINI_LIVE_INDIAN_LANGUAGE_CODES) {
      if (code === "en") {
        expect(t(code, "overview")).toBe("Overview");
        expect(getFarmerT(code).home).toBe("Home");
        expect(getFarmerT(code).saathiNav).toBe("Saathi AI");
        continue;
      }
      expect(t(code, "overview")).not.toBe(t("en", "overview"));
      expect(getFarmerT(code).home).not.toBe(getFarmerT("en").home);
      expect(getFarmerT(code).saathiNav).not.toBe(getFarmerT("en").saathiNav);
      expect(getFarmerT(code).saathiGreeting).toBeDefined();
      expect(getFarmerT(code).saathiGreeting).not.toBe(getFarmerT("en").saathiGreeting);
      expect(getFarmerT(code).perilFire).toBeDefined();
      expect(getFarmerT(code).perilFire).not.toBe(getFarmerT("en").perilFire);
      expect(getFarmerT(code).saathiCommonIssues).toBeDefined();
      expect(getFarmerT(code).saathiCommonIssues).not.toBe(getFarmerT("en").saathiCommonIssues);
    }
  });

  it("provides localized Saathi and Gujarati peril phrases properly", () => {
    const gu = getFarmerT("gu");
    expect(gu.saathiNav).toBe("સાથી (AI અવાજ)");
    expect(gu.perilFire).toBe("ખેતરમાં આગ");
    expect(gu.perilAnimals).toBe("જંગલી પ્રાણી");
    expect(gu.perilFlood).toBe("પૂર / પાણી ભરાવું");
    expect(gu.perilPest).toBe("જીવાત અને રોગ");
    expect(gu.perilHail).toBe("કરા પડવા");
    expect(gu.saathiTapToSpeak).toBe("બોલવા માટે માઇક દબાવો");
    expect(gu.saathiAssessmentConvo).toBe("સાથી સંવાદ");
    expect(gu.saathiGreeting).toContain("નમસ્તે! હું ફસલ સાથી છું");
  });
});

