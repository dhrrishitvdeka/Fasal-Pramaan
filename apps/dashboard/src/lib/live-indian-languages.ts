/** Official Gemini Live Indian languages only. Do not add French, Spanish, Chinese, etc. */
export const GEMINI_LIVE_INDIAN_LANGUAGE_CODES = [
  "as",
  "bn",
  "en",
  "gu",
  "hi",
  "kn",
  "ml",
  "mr",
  "ne",
  "or",
  "pa",
  "sd",
  "ta",
  "te",
  "ur",
] as const;

export type AppLang = (typeof GEMINI_LIVE_INDIAN_LANGUAGE_CODES)[number];

export type LiveIndianLanguage = {
  code: AppLang;
  nativeLabel: string;
};

export const GEMINI_LIVE_INDIAN_LANGUAGES: readonly LiveIndianLanguage[] = [
  { code: "as", nativeLabel: "অসমীয়া" },
  { code: "bn", nativeLabel: "বাংলা" },
  { code: "en", nativeLabel: "English" },
  { code: "gu", nativeLabel: "ગુજરાતી" },
  { code: "hi", nativeLabel: "हिन्दी" },
  { code: "kn", nativeLabel: "ಕನ್ನಡ" },
  { code: "ml", nativeLabel: "മലയാളം" },
  { code: "mr", nativeLabel: "मराठी" },
  { code: "ne", nativeLabel: "नेपाली" },
  { code: "or", nativeLabel: "ଓଡ଼ିଆ" },
  { code: "pa", nativeLabel: "ਪੰਜਾਬੀ" },
  { code: "sd", nativeLabel: "سنڌي" },
  { code: "ta", nativeLabel: "தமிழ்" },
  { code: "te", nativeLabel: "తెలుగు" },
  { code: "ur", nativeLabel: "اردو" },
];

const CODE_SET = new Set<string>(GEMINI_LIVE_INDIAN_LANGUAGE_CODES);

export function isAppLang(value: unknown): value is AppLang {
  return typeof value === "string" && CODE_SET.has(value);
}

/** Persist / tool validator. Unknown and non-allowlisted codes are rejected. */
export function parseAppLang(value: unknown): AppLang | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return isAppLang(code) ? code : null;
}

export function persistAppLang(value: unknown, fallback: AppLang = "en"): AppLang {
  return parseAppLang(value) ?? fallback;
}

export function nativeLabelForLang(code: AppLang): string {
  return GEMINI_LIVE_INDIAN_LANGUAGES.find((item) => item.code === code)?.nativeLabel ?? code;
}
