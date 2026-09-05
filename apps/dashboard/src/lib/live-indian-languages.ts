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

const NAME_TO_CODE: Record<string, AppLang> = {
  assamese: "as",
  bengali: "bn",
  bangla: "bn",
  english: "en",
  gujarati: "gu",
  gujrati: "gu",
  hindi: "hi",
  kannada: "kn",
  malayalam: "ml",
  marathi: "mr",
  nepali: "ne",
  odia: "or",
  oriya: "or",
  punjabi: "pa",
  sindhi: "sd",
  tamil: "ta",
  telugu: "te",
  urdu: "ur",
};

export function isAppLang(value: unknown): value is AppLang {
  return typeof value === "string" && CODE_SET.has(value);
}

/** Persist / tool validator. Normalizes codes, names, and BCP-47 locales. Unknown and non-allowlisted codes are rejected. */
export function parseAppLang(value: unknown): AppLang | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (isAppLang(raw)) return raw;
  if (NAME_TO_CODE[raw]) return NAME_TO_CODE[raw];
  const bcp = raw.split(/[-_]/)[0];
  if (isAppLang(bcp)) return bcp;
  if (NAME_TO_CODE[bcp]) return NAME_TO_CODE[bcp];
  return null;
}

export function persistAppLang(value: unknown, fallback: AppLang = "en"): AppLang {
  return parseAppLang(value) ?? fallback;
}

export const SPEECH_BCP47_MAP: Record<AppLang, string> = {
  as: "as-IN",
  bn: "bn-IN",
  en: "en-IN",
  gu: "gu-IN",
  hi: "hi-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  mr: "mr-IN",
  ne: "ne-NP",
  or: "or-IN",
  pa: "pa-IN",
  sd: "sd-IN",
  ta: "ta-IN",
  te: "te-IN",
  ur: "ur-IN",
};

export function getSpeechLocale(lang: AppLang): string {
  return SPEECH_BCP47_MAP[lang] || "en-IN";
}


export function nativeLabelForLang(code: AppLang): string {
  return GEMINI_LIVE_INDIAN_LANGUAGES.find((item) => item.code === code)?.nativeLabel ?? code;
}
