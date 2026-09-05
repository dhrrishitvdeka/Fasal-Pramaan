import { describe, expect, it } from "vitest";
import { getFarmerT } from "../src/lib/farmerI18n";
import { t } from "../src/lib/i18n";
import {
  GEMINI_LIVE_INDIAN_LANGUAGE_CODES,
  GEMINI_LIVE_INDIAN_LANGUAGES,
  parseAppLang,
  persistAppLang,
} from "../src/lib/live-indian-languages";
import {
  WEB_FUNCTION_DECLARATIONS,
  WEB_VOICE_SYSTEM_INSTRUCTION,
} from "../src/lib/voice/function-declarations";
import { WebVoiceBroker, type WebVoiceGateway } from "../src/lib/voice/web-voice-broker";
import { buildAuthTokenRequest } from "../src/lib/voice/gemini-session";

function voiceGateway() {
  const langs: string[] = [];
  const gateway: WebVoiceGateway = {
    plots: [],
    claims: [],
    reminders: [],
    navigate: () => undefined,
    changeLanguage: (code) => {
      langs.push(code);
    },
    snoozeReminder: () => undefined,
    completeReminder: () => undefined,
    capture: {
      captureCurrentAngle: async () => ({ ok: true, message: "ok" }),
      readGuidance: async () => ({ ok: true, message: "ok" }),
      setObservation: async () => ({ ok: true, message: "ok" }),
      submitDraft: async () => ({ ok: true, message: "ok" }),
    },
  };
  return { gateway, langs };
}

describe("Gemini Live Indian language allowlist", () => {
  it("contains the required Indian Live codes and excludes non-Indian Live languages", () => {
    expect(GEMINI_LIVE_INDIAN_LANGUAGE_CODES).toEqual(
      expect.arrayContaining(["hi", "ta", "te", "bn", "mr", "en", "gu", "kn", "ml", "pa", "ur"]),
    );
    for (const forbidden of ["fr", "de", "es", "zh", "ja"] as const) {
      expect(GEMINI_LIVE_INDIAN_LANGUAGE_CODES).not.toContain(forbidden);
    }
  });

  it("labels every allowlisted option in its own script", () => {
    const codes = GEMINI_LIVE_INDIAN_LANGUAGES.map((item) => item.code);
    expect(codes).toEqual([...GEMINI_LIVE_INDIAN_LANGUAGE_CODES]);
    const tamil = GEMINI_LIVE_INDIAN_LANGUAGES.find((item) => item.code === "ta");
    const hindi = GEMINI_LIVE_INDIAN_LANGUAGES.find((item) => item.code === "hi");
    const telugu = GEMINI_LIVE_INDIAN_LANGUAGES.find((item) => item.code === "te");
    expect(tamil?.nativeLabel).toBe("தமிழ்");
    expect(hindi?.nativeLabel).toBe("हिन्दी");
    expect(telugu?.nativeLabel).toBe("తెలుగు");
  });

  it("translates allowlisted UI lookups instead of leaving English leftovers", () => {
    expect(getFarmerT("ta").home).not.toBe(getFarmerT("en").home);
    expect(t("bn", "logout")).not.toBe(t("en", "logout"));
    expect(t("hi", "logout")).toBeTruthy();
    expect(t("hi", "logout")).not.toBe(t("en", "logout"));
  });

  it("rejects unknown or non-allowlisted codes on persist", () => {
    expect(parseAppLang("ta")).toBe("ta");
    expect(parseAppLang("BN")).toBe("bn");
    expect(parseAppLang("fr")).toBeNull();
    expect(parseAppLang("xyz")).toBeNull();
    expect(parseAppLang("")).toBeNull();
    expect(persistAppLang("fr", "en")).toBe("en");
    expect(persistAppLang("ta", "en")).toBe("ta");
  });

  it("normalizes language names and BCP-47 tags to allowlisted AppLang codes", () => {
    expect(parseAppLang("hindi")).toBe("hi");
    expect(parseAppLang("Hindi")).toBe("hi");
    expect(parseAppLang("hi-IN")).toBe("hi");
    expect(parseAppLang("english")).toBe("en");
    expect(parseAppLang("English")).toBe("en");
    expect(parseAppLang("en-US")).toBe("en");
    expect(parseAppLang("bengali")).toBe("bn");
    expect(parseAppLang("bangla")).toBe("bn");
    expect(parseAppLang("tamil")).toBe("ta");
    expect(parseAppLang("gujarati")).toBe("gu");
    expect(parseAppLang("marathi")).toBe("mr");
    expect(parseAppLang("punjabi")).toBe("pa");
    expect(parseAppLang("telugu")).toBe("te");
    expect(parseAppLang("french")).toBeNull();
    expect(parseAppLang("spanish")).toBeNull();
  });
});

describe("shipped change_language action", () => {
  it("uses the same allowlist as the dropdown", () => {
    const tool = WEB_FUNCTION_DECLARATIONS.find((item) => item.name === "change_language");
    expect(tool).toBeTruthy();
    const params = tool?.parameters as {
      properties?: { language_code?: { enum?: string[] } };
    };
    expect(params.properties?.language_code?.enum).toEqual([...GEMINI_LIVE_INDIAN_LANGUAGE_CODES]);
  });

  it("accepts Tamil and Bengali and rejects French and unknown codes", async () => {
    const { gateway, langs } = voiceGateway();
    const broker = new WebVoiceBroker(gateway);

    const tamil = await broker.execute("change_language", { language_code: "ta" }, 1);
    const bengali = await broker.execute("change_language", { language_code: "bn" }, 2);
    expect(tamil.outcome).toBe("succeeded");
    expect(tamil.data?.language_code).toBe("ta");
    expect(bengali.outcome).toBe("succeeded");
    expect(bengali.data?.language_code).toBe("bn");
    expect(langs).toEqual(["ta", "bn"]);

    const french = await broker.execute("change_language", { language_code: "fr" }, 3);
    const unknown = await broker.execute("change_language", { language_code: "xyz" }, 4);
    expect(french.outcome).toBe("failed");
    expect(unknown.outcome).toBe("failed");
    expect(langs).toEqual(["ta", "bn"]);
  });
});

describe("Gemini Live Indian-language instruction", () => {
  it("tells the model to speak and switch among Indian languages only and adopt the farmer's spoken language", () => {
    expect(WEB_VOICE_SYSTEM_INSTRUCTION).toMatch(/Indian languages only/i);
    expect(WEB_VOICE_SYSTEM_INSTRUCTION).toMatch(/Adopt the farmer's spoken language/i);
    expect(WEB_VOICE_SYSTEM_INSTRUCTION).toMatch(/Switch mid-conversation/i);
    expect(WEB_VOICE_SYSTEM_INSTRUCTION).toMatch(/Do not speak or switch to non-Indian languages/i);
    expect(WEB_VOICE_SYSTEM_INSTRUCTION).toMatch(/Tamil/);
    expect(WEB_VOICE_SYSTEM_INSTRUCTION).not.toMatch(/French, Spanish, and Chinese are allowed/);
  });

  it("ships that instruction in the minted Live session body", () => {
    const body = JSON.stringify(buildAuthTokenRequest().body);
    expect(body).toContain("Indian languages only");
    expect(body).toContain("Adopt the farmer's spoken language");
    expect(body).toContain("change_language");
  });
});
