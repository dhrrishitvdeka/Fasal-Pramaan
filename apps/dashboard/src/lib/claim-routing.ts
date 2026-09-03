import type { AngleGuidance } from "./farmerI18n";
import { CANONICAL_ANGLES } from "./farmerI18n";

export type Peril =
  | "normal"
  | "fire_burn"
  | "animal_damage"
  | "flood"
  | "drought"
  | "pest_disease"
  | "hailstorm"
  | "lodging";

export type ContextCheck =
  | "sentinel_fire"
  | "wildlife_proximity"
  | "imd_weather"
  | "bhuvan_landuse"
  | "nearby_fields";

export interface RouteConfig {
  peril: Peril;
  labelEn: string;
  labelHi: string;
  descriptionEn: string;
  descriptionHi: string;
  requiredAngles: string[];
  optionalAngles: string[];
  contextChecks: ContextCheck[];
  minConfidence: number;
  needsSatellite: boolean;
  guidanceExtraEn: string;
  guidanceExtraHi: string;
}

export const PERIL_OPTIONS: Array<{ value: Peril; en: string; hi: string }> = [
  { value: "normal", en: "Normal / General damage", hi: "सामान्य क्षति" },
  { value: "fire_burn", en: "Fire / Burn", hi: "आग / जलना" },
  { value: "animal_damage", en: "Animal damage / Grazing", hi: "जानवर क्षति" },
  { value: "flood", en: "Flood / Waterlogging", hi: "बाढ़ / जलभराव" },
  { value: "drought", en: "Drought / Dry spell", hi: "सूखा" },
  { value: "pest_disease", en: "Pest / Disease", hi: "कीट / रोग" },
  { value: "hailstorm", en: "Hailstorm", hi: "ओलावृष्टि" },
  { value: "lodging", en: "Lodging / Wind fall", hi: "फसल गिरना / हवा" },
];

export const ROUTE_CONFIG: Record<Peril, RouteConfig> = {
  normal: {
    peril: "normal",
    labelEn: "Normal damage",
    labelHi: "सामान्य क्षति",
    descriptionEn: "Standard multi-angle scan with real-time quality feedback.",
    descriptionHi: "सामान्य क्षति — 5-कोण साक्ष्य और गुणवत्ता जाँच।",
    requiredAngles: ["wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage"],
    optionalAngles: [],
    contextChecks: ["imd_weather", "bhuvan_landuse", "nearby_fields"],
    minConfidence: 85,
    needsSatellite: false,
    guidanceExtraEn: "Capture all 5 angles clearly. Keep crop in frame.",
    guidanceExtraHi: "सभी 5 कोण साफ़-साफ़ लें। फसल फ्रेम में रखें।",
  },
  fire_burn: {
    peril: "fire_burn",
    labelEn: "Fire / Burn",
    labelHi: "आग / जलना",
    descriptionEn: "Satellite verifies burn scar; field capture focuses on closeup + wide.",
    descriptionHi: "सैटेलाइट से जले निशान जाँच; खेत का व्यापक + नज़दीकी फोटो।",
    requiredAngles: ["wide_field", "closeup_damage"],
    optionalAngles: ["mid_canopy"],
    contextChecks: ["sentinel_fire", "imd_weather", "bhuvan_landuse"],
    minConfidence: 70,
    needsSatellite: true,
    guidanceExtraEn: "Show burnt patch + surrounding unburnt edge. Satellite will be cross-checked.",
    guidanceExtraHi: "जले हिस्से और आसपास की बिना जली सीमा दिखाएँ। सैटेलाइट से मिलान होगा।",
  },
  animal_damage: {
    peril: "animal_damage",
    labelEn: "Animal damage",
    labelHi: "जानवर क्षति",
    descriptionEn: "Wildlife proximity + trampled rows + closeup of bite/graze marks.",
    descriptionHi: "वन्यजीव निकटता + कुचली कतारें + चबाने के निशान।",
    requiredAngles: ["wide_field", "mid_canopy", "closeup_damage"],
    optionalAngles: ["left_context", "right_context"],
    contextChecks: ["wildlife_proximity", "imd_weather", "bhuvan_landuse"],
    minConfidence: 75,
    needsSatellite: false,
    guidanceExtraEn: "Include footprints/trail if visible. Capture damaged stem at 15 cm.",
    guidanceExtraHi: "पैरों के निशान दिखें तो लें। तने का घाव 15 सेमी से लें।",
  },
  flood: {
    peril: "flood",
    labelEn: "Flood",
    labelHi: "बाढ़",
    descriptionEn: "IMD rainfall + satellite water extent corroboration; wide + mid canopy essential.",
    descriptionHi: "आईएमडी वर्षा + सैटेलाइट जल-भराव मिलान।",
    requiredAngles: ["wide_field", "mid_canopy", "closeup_damage"],
    optionalAngles: ["left_context", "right_context"],
    contextChecks: ["imd_weather", "sentinel_fire", "nearby_fields"],
    minConfidence: 75,
    needsSatellite: false,
    guidanceExtraEn: "Capture standing water line + submerged base. IMD 7-day rain will be checked.",
    guidanceExtraHi: "खड़ा पानी और डूबा आधार लें। आईएमडी वर्षा जाँची जाएगी।",
  },
  drought: {
    peril: "drought",
    labelEn: "Drought",
    labelHi: "सूखा",
    descriptionEn: "Gradual stress — canopy + soil moisture context; IMD dry spell check.",
    descriptionHi: "धीरे सूखना — छत्र + मिट्टी नमी, आईएमडी शुष्क अवधि जाँच।",
    requiredAngles: ["wide_field", "mid_canopy", "closeup_damage"],
    optionalAngles: ["left_context", "right_context"],
    contextChecks: ["imd_weather", "bhuvan_landuse", "nearby_fields"],
    minConfidence: 80,
    needsSatellite: false,
    guidanceExtraEn: "Show wilting canopy + soil cracks if any.",
    guidanceExtraHi: "मुरझाई पत्तियाँ + दरकी मिट्टी दिखाएँ।",
  },
  pest_disease: {
    peril: "pest_disease",
    labelEn: "Pest / Disease",
    labelHi: "कीट / रोग",
    descriptionEn: "Primary peril for AI screening — closeup critical; canopy spread matters.",
    descriptionHi: "एआई स्क्रीनिंग — नज़दीकी घाव महत्वपूर्ण।",
    requiredAngles: ["closeup_damage", "mid_canopy", "wide_field"],
    optionalAngles: ["left_context", "right_context"],
    contextChecks: ["imd_weather", "nearby_fields", "bhuvan_landuse"],
    minConfidence: 85,
    needsSatellite: false,
    guidanceExtraEn: "Closeup must fill frame with lesions. Keep leaf steady.",
    guidanceExtraHi: "धब्बों को फ्रेम भर दिखाएँ। पत्ती स्थिर रखें।",
  },
  hailstorm: {
    peril: "hailstorm",
    labelEn: "Hailstorm",
    labelHi: "ओलावृष्टि",
    descriptionEn: "IMD hail + physical impact evidence.",
    descriptionHi: "आईएमडी ओला + भौतिक टूटन।",
    requiredAngles: ["wide_field", "closeup_damage", "mid_canopy"],
    optionalAngles: ["left_context", "right_context"],
    contextChecks: ["imd_weather", "nearby_fields", "bhuvan_landuse"],
    minConfidence: 75,
    needsSatellite: false,
    guidanceExtraEn: "Show shredded leaves + scattered hail if present.",
    guidanceExtraHi: "फटे पत्ते + बिखरे ओले दिखाएँ।",
  },
  lodging: {
    peril: "lodging",
    labelEn: "Lodging",
    labelHi: "गिराव",
    descriptionEn: "Wind lodging — wide field + canopy structure to assess area affected.",
    descriptionHi: "हवा से गिराव — पूरे खेत + छत्र संरचना।",
    requiredAngles: ["wide_field", "mid_canopy", "closeup_damage"],
    optionalAngles: ["left_context", "right_context"],
    contextChecks: ["imd_weather", "nearby_fields", "bhuvan_landuse"],
    minConfidence: 75,
    needsSatellite: false,
    guidanceExtraEn: "Stand 10 m back; include lodged vs standing boundary.",
    guidanceExtraHi: "10 मीटर पीछे से गिरी और खड़ी सीमा दिखाएँ।",
  },
};

export function normalizePeril(raw: unknown): Peril {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "fire" || v === "fire_burn" || v === "burn") return "fire_burn";
  if (v === "animal" || v === "animal_damage" || v === "grazing") return "animal_damage";
  if (v === "flood" || v === "waterlogging") return "flood";
  if (v === "drought" || v === "dry") return "drought";
  if (v === "pest" || v === "disease" || v === "pest_disease") return "pest_disease";
  if (v === "hail" || v === "hailstorm") return "hailstorm";
  if (v === "lodging" || v === "lodging_wind" || v === "wind") return "lodging";
  if ((Object.keys(ROUTE_CONFIG) as Peril[]).includes(v as Peril)) return v as Peril;
  return "normal";
}

export function routeForPeril(peril: Peril): RouteConfig {
  return ROUTE_CONFIG[peril] || ROUTE_CONFIG.normal;
}

export function anglesForPeril(peril: Peril): AngleGuidance[] {
  const cfg = routeForPeril(peril);
  const all = new Map(CANONICAL_ANGLES.map((a) => [a.id, a]));
  const req = cfg.requiredAngles.map((id) => all.get(id)).filter(Boolean) as AngleGuidance[];
  // Keep canonical order but filter to required+optional
  const want = new Set([...cfg.requiredAngles, ...cfg.optionalAngles]);
  return CANONICAL_ANGLES.filter((a) => want.has(a.id));
}

export type ClaimIntent = {
  id: string;
  peril: Peril;
  perilLabelEn: string;
  perilLabelHi: string;
  crop?: string;
  cropHi?: string;
  village?: string;
  district?: string;
  plotId?: string;
  sowingDate?: string;
  farmerNote?: string;
  createdAt: string;
  source: "saathi_voice" | "saathi_text" | "manual";
};

export function newIntentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `intent-${crypto.randomUUID()}`;
  return `intent-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function classifyPerilHeuristic(text: string): { peril: Peril; confidence: number } {
  const t = text.toLowerCase();
  if (/(fire|burn|jalna|aag|jala|आग|जलना|जला)/.test(t)) return { peril: "fire_burn", confidence: 0.92 };
  if (/(animal|wild|boar|nilgai|jaanwar|pashu|graz|जानवर|नीलगाय|जंगली|पशु)/.test(t)) return { peril: "animal_damage", confidence: 0.88 };
  if (/(flood|waterlog|paani|bharav|inund|बाढ़|जलभराव|पानी भर)/.test(t)) return { peril: "flood", confidence: 0.87 };
  if (/(drought|sukha|sookha|dry|सूखा|मुरझा)/.test(t)) return { peril: "drought", confidence: 0.82 };
  if (/(pest|keet|disease|rog|fung|spot|lesion|कीट|रोग|फफूंद|इल्ली|कीड़े)/.test(t)) return { peril: "pest_disease", confidence: 0.85 };
  if (/(hail|ola|olavrishti|ओला|ओलावृष्टि)/.test(t)) return { peril: "hailstorm", confidence: 0.9 };
  if (/(lodg|gira|gir gaya|wind|hawa|tufan|गिरा|हवा से गिर|तूफान)/.test(t)) return { peril: "lodging", confidence: 0.84 };
  return { peril: "normal", confidence: 0.2 };
}

export const INTENT_STORAGE_KEY = "fp_active_claim_intent_v1";
