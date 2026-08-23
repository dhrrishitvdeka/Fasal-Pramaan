import {
  PERIL_OPTIONS,
  classifyPerilHeuristic,
  normalizePeril,
  routeForPeril,
  type Peril,
  type ClaimIntent,
  newIntentId,
} from "./claim-routing";
import { CANONICAL_ANGLES, getFarmerT } from "./farmerI18n";
import type { AppLang } from "./live-indian-languages";

export type SaathiSlot = {
  peril?: Peril;
  perilConfidence?: number;
  crop?: string;
  sowingDate?: string;
  village?: string;
  district?: string;
  plotId?: string;
  farmerNote?: string;
};

export type SaathiMessage = {
  id: string;
  role: "saathi" | "farmer";
  text: string;
  textHi?: string;
  at: string;
};

function newMsg(role: SaathiMessage["role"], text: string, textHi?: string): SaathiMessage {
  return { id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text, textHi, at: new Date().toISOString() };
}

export function initialSaathiGreeting(lang: string): SaathiMessage {
  const t = getFarmerT(lang as AppLang);
  const greeting = t.saathiGreeting || "Hi, I am Fasal Saathi. What happened to your crop? Tell me in your words — e.g., fire/burn, animal grazing, flood, pest/disease, hail, lodging.";
  return newMsg("saathi", greeting, greeting);
}

export function extractSlotsFromText(text: string, plots: Array<{ id: string; name: string; nameHi: string; cropType: string; cropTypeHi: string; village: string }>): Partial<SaathiSlot> {
  const t = text.toLowerCase();
  const slots: Partial<SaathiSlot> = {};
  const { peril, confidence } = classifyPerilHeuristic(text);
  if (confidence >= 0.55) {
    slots.peril = peril;
    slots.perilConfidence = confidence;
  }
  // naive crop mention
  for (const p of plots) {
    const cropEn = (p.cropType || "").toLowerCase();
    const cropHi = (p.cropTypeHi || "").toLowerCase();
    if (cropEn && t.includes(cropEn)) slots.crop = p.cropType;
    if (cropHi && t.includes(cropHi)) slots.crop = p.cropType;
  }
  if (!slots.crop) {
    if (/(wheat|gehu|gehun)/.test(t)) slots.crop = "Wheat";
    if (/(paddy|dhaan|rice)/.test(t)) slots.crop = "Paddy";
    if (/(mustard|sarson)/.test(t)) slots.crop = "Mustard";
    if (/(cotton|kapas)/.test(t)) slots.crop = "Cotton";
    if (/(maize|makka)/.test(t)) slots.crop = "Maize";
  }
  // village hint
  for (const p of plots) {
    if (p.village && t.includes(p.village.toLowerCase())) slots.village = p.village;
  }
  if (text.length > 20) slots.farmerNote = text.slice(0, 400);
  return slots;
}

export function mergeSlots(a: SaathiSlot, b: Partial<SaathiSlot>): SaathiSlot {
  return { ...a, ...b, farmerNote: b.farmerNote || a.farmerNote };
}

export function buildSaathiReply(slots: SaathiSlot, lang: string): SaathiMessage {
  const peril = slots.peril || "normal";
  const cfg = routeForPeril(peril);
  if (!slots.peril) {
    return newMsg(
      "saathi",
      lang === "hi"
        ? "समझ गया। क्या यह आग/जलना, जानवर क्षति, बाढ़, ओलावृष्टि, कीट/रोग या सामान्य क्षति है? एक शब्द में बताएँ।"
        : "Got it. Is this fire/burn, animal grazing, flood, hail, pest/disease, or general damage? One word is enough.",
      "समझ गया। क्या यह आग/जलना, जानवर क्षति, बाढ़, ओलावृष्टि, कीट/रोग या सामान्य क्षति है? एक शब्द में बताएँ।"
    );
  }
  const angles = cfg.requiredAngles.join(", ");
  if (lang === "hi") {
    return newMsg(
      "saathi",
      `समझ गया — ${cfg.labelHi}। मैं ${cfg.requiredAngles.length} कोणों की गाइड तैयार कर रहा हूँ: ${angles}। ${cfg.guidanceExtraHi} क्या अब कैमरा खोलें?`,
      `समझ गया — ${cfg.labelHi}। मैं ${cfg.requiredAngles.length} कोणों की गाइड तैयार कर रहा हूँ: ${angles}। ${cfg.guidanceExtraHi} क्या अब कैमरा खोलें?`
    );
  }
  return newMsg(
    "saathi",
    `Understood — ${cfg.labelEn}. I'll guide you for ${cfg.requiredAngles.length} angles: ${angles}. ${cfg.guidanceExtraEn} Ready to open camera?`,
    `समझ गया — ${cfg.labelHi}। मैं ${cfg.requiredAngles.length} कोणों की गाइड तैयार कर रहा हूँ: ${angles}। ${cfg.guidanceExtraHi} क्या अब कैमरा खोलें?`
  );
}

export function nextQuestion(slots: SaathiSlot, lang: string): SaathiMessage | null {
  if (!slots.crop) {
    return newMsg(
      "saathi",
      lang === "hi" ? "कौन सी फसल प्रभावित है? जैसे: गेहूँ, धान, सरसों।" : "Which crop is affected? e.g., Wheat, Paddy, Mustard.",
      "कौन सी फसल प्रभावित है? जैसे: गेहूँ, धान, सरसों。"
    );
  }
  return null;
}

export function slotsToIntent(slots: SaathiSlot, source: ClaimIntent["source"] = "saathi_text"): ClaimIntent {
  const peril = normalizePeril(slots.peril || "normal");
  const cfg = routeForPeril(peril);
  return {
    id: newIntentId(),
    peril,
    perilLabelEn: cfg.labelEn,
    perilLabelHi: cfg.labelHi,
    crop: slots.crop,
    village: slots.village,
    district: slots.district,
    plotId: slots.plotId,
    sowingDate: slots.sowingDate,
    farmerNote: slots.farmerNote,
    createdAt: new Date().toISOString(),
    source,
  };
}

// ---------------------------------------------------------------------------
// Frontier LLM autonomous helpers
// NOTE: LLM calls live in src/lib/saathi/classify-server.ts (server-only).
// This module stays client-safe: no API keys are read here.
// ---------------------------------------------------------------------------

export function buildSystemPrompt(intent: ClaimIntent | null, lang: string = "en"): string {
  const base =
    "You are Fasal Saathi (फसल साथी), a frontier autonomous agent for Fasal-Pramaan. " +
    "You route crop-damage claims to evidence capture, call context signals, and guide the farmer angle-by-angle. " +
    "Keep replies short, in the farmer's language, and never invent payout/insurance approvals.";
  const langLine =
    `ALWAYS reply ONLY in ${lang === "hi" ? "Hindi (Devanagari script, simple village-friendly Hindi)" : "simple English"}. Never mix scripts.`;
  if (!intent) {
    return (
      `${base}\n` +
      `${langLine}\n` +
      `No active intent yet (lang=${lang}). First step: classify the farmer's free-text into a peril ` +
      `and ask one clarifying question if confidence is low. ` +
      `Available perils: ${PERIL_OPTIONS.map((o) => o.value).join(", ")}.\n` +
      `Tools you may call: request_evidence_angles(peril), call_context_signal({lat,lon,peril,sowingDate}), guide_capture({angle, lang}).`
    );
  }
  const cfg = routeForPeril(intent.peril);
  return (
    `${base}\n` +
    `${langLine}\n` +
    `Active intent ${intent.id} · peril=${intent.peril} (${cfg.labelEn}/${cfg.labelHi}) · lang=${lang}\n` +
    `Crop: ${intent.crop || "unspecified"}${intent.cropHi ? ` (${intent.cropHi})` : ""} · Village: ${intent.village || "unknown"} · District: ${intent.district || "unknown"} · Plot: ${intent.plotId || "none"} · Sowing: ${intent.sowingDate || "unknown"}\n` +
    `Farmer note: ${(intent.farmerNote || "").slice(0, 300) || "(none)"}\n` +
    `Required angles (${cfg.requiredAngles.length}): ${cfg.requiredAngles.join(", ")}\n` +
    `Optional angles: ${cfg.optionalAngles.join(", ") || "none"}\n` +
    `Context checks: ${cfg.contextChecks.join(", ")}\n` +
    `Needs satellite: ${cfg.needsSatellite ? "yes" : "no"} · Min confidence: ${cfg.minConfidence}\n` +
    `Guidance EN: ${cfg.guidanceExtraEn}\nGuidance HI: ${cfg.guidanceExtraHi}\n` +
    `Next actions: request_evidence_angles -> call_context_signal -> guide_capture. Use farmer's language.`
  );
}

function objectSchema(properties: Record<string, unknown> = {}, required?: string[]): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: "OBJECT", properties };
  if (required?.length) schema.required = required;
  return schema;
}

export const SAATHI_FUNCTION_DECLARATIONS = [
  {
    name: "request_evidence_angles",
    description: "Return the required and optional evidence angles for a peril, plus context checks and satellite need.",
    parameters: objectSchema(
      {
        peril: { type: "STRING", enum: PERIL_OPTIONS.map((o) => o.value), description: "Peril identifier" },
      },
      ["peril"],
    ),
  },
  {
    name: "call_context_signal",
    description: "Fetch multi-signal context (IMD weather, Sentinel, Bhuvan, wildlife, nearby fields, GPS) for a location and peril.",
    parameters: objectSchema({
      lat: { type: "NUMBER", description: "Latitude of the plot or capture" },
      lon: { type: "NUMBER", description: "Longitude of the plot or capture" },
      peril: { type: "STRING", enum: PERIL_OPTIONS.map((o) => o.value) },
      sowingDate: { type: "STRING", description: "Optional sowing date ISO" },
      plotLat: { type: "NUMBER", description: "Optional registered plot center latitude for containment check" },
      plotLon: { type: "NUMBER", description: "Optional registered plot center longitude for containment check" },
    }),
  },
  {
    name: "guide_capture",
    description: "Provide step-by-step capture guidance for a single canonical angle in the farmer's language.",
    parameters: objectSchema(
      {
        angle: { type: "STRING", enum: CANONICAL_ANGLES.map((a) => a.id), description: "Canonical angle id" },
        lang: { type: "STRING", description: "Farmer language code (en, hi, etc.)" },
      },
      ["angle"],
    ),
  },
  {
    name: "classify_claim",
    description: "Classify farmer free-text into a peril with confidence and reasoning.",
    parameters: objectSchema(
      {
        peril: { type: "STRING", enum: PERIL_OPTIONS.map((o) => o.value) },
        confidence: { type: "NUMBER", description: "0 to 1 confidence" },
        reasoning: { type: "STRING", description: "Short reasoning for the classification" },
      },
      ["peril", "confidence"],
    ),
  },
  {
    name: "take_photo",
    description: "Trigger the camera shutter to capture a photo for the currently active angle.",
    parameters: objectSchema({}),
  },
  {
    name: "switch_camera",
    description: "Switch between back (environment) camera and front camera.",
    parameters: objectSchema({}),
  },
  {
    name: "select_angle",
    description: "Switch the active camera viewfinder to a specific canonical angle in the capture studio.",
    parameters: objectSchema(
      {
        angle: { type: "STRING", enum: CANONICAL_ANGLES.map((a) => a.id), description: "Target angle identifier" },
      },
      ["angle"],
    ),
  },
  {
    name: "retake_angle",
    description: "Clear an existing photo and set the viewfinder to retake that specific angle.",
    parameters: objectSchema(
      {
        angle: { type: "STRING", enum: CANONICAL_ANGLES.map((a) => a.id), description: "Angle identifier to retake" },
      },
      ["angle"],
    ),
  },
  {
    name: "set_observation",
    description: "Save or update the farmer's verbal observations/damage description on the claim draft.",
    parameters: objectSchema(
      {
        observation: { type: "STRING", description: "Farmer damage description or notes" },
      },
      ["observation"],
    ),
  },
  {
    name: "submit_claim",
    description: "Submit the drafted evidence claim for neural loss evaluation and verification.",
    parameters: objectSchema({}),
  },
  {
    name: "check_evidence_quality",
    description: "Inspect live computer vision metrics, canopy coverage %, exposure, and focus sharpness.",
    parameters: objectSchema({}),
  },
] as const;

// For Gemini Live bidiGenerateContentSetup.tools you can pass SAATHI_FUNCTION_DECLARATIONS directly.
// The classify_claim tool is also used server-side by classifyPerilWithLLM in
// src/lib/saathi/classify-server.ts for one-shot classification.
