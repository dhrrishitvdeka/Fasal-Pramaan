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
  // Default heuristic is 0.2 ("normal"). Do not lock a peril on short prompts
  // like "बताइए" or on the canned greeting that lists example perils.
  if (confidence >= 0.7 && text.trim().length >= 8) {
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

export type AgentAction =
  | { type: "open_camera"; peril?: string; plotId?: string; crop?: string; angles?: string[] }
  | { type: "navigate"; url: string; label: string; labelHi?: string }
  | { type: "switch_language"; lang: AppLang }
  | { type: "filter_claims"; status: "verified" | "needs_recapture" | "under_review" | "all" }
  | { type: "snooze_reminder"; reminderId?: string; days: number }
  | { type: "show_plots" }
  | { type: "show_claims" }
  | { type: "show_timeline" };

export type AgentResolution = {
  replyMessage: SaathiMessage;
  action?: AgentAction | null;
  actionSummary?: string;
  actionSummaryHi?: string;
  slots: SaathiSlot;
};

export function resolveAgenticAction(
  text: string,
  currentSlots: SaathiSlot,
  plots: Array<{ id: string; name: string; nameHi: string; cropType: string; cropTypeHi: string; village: string }>,
  currentLang: string,
): AgentResolution {
  const t = text.toLowerCase().trim();
  const extracted = extractSlotsFromText(text, plots);
  const nextSlots = mergeSlots(currentSlots, extracted);

  // 1. Language switch orders
  if (/(हिंदी|hindi|switch to hindi|talk in hindi|hindi me)/i.test(t)) {
    return {
      replyMessage: newMsg("saathi", "जी, अब मैं हिंदी में बात करूँगा। आपकी फसल में क्या समस्या है?", "जी, अब मैं हिंदी में बात करूँगा। आपकी फसल में क्या समस्या है?"),
      action: { type: "switch_language", lang: "hi" },
      actionSummary: "Language switched to Hindi",
      actionSummaryHi: "भाषा हिंदी में बदली गई",
      slots: nextSlots,
    };
  }
  if (/(english|switch to english|talk in english)/i.test(t)) {
    return {
      replyMessage: newMsg("saathi", "Sure, I will assist you in English now. What issue did you face with your crop?"),
      action: { type: "switch_language", lang: "en" },
      actionSummary: "Language switched to English",
      actionSummaryHi: "भाषा अंग्रेज़ी में बदली गई",
      slots: nextSlots,
    };
  }
  if (/(gujarati|ગુજરાતી|gujrati)/i.test(t)) {
    return {
      replyMessage: newMsg("saathi", "હા, હું હવે ગુજરાતીમાં વાત કરીશ. તમારા પાકમાં શું સમસ્યા છે?"),
      action: { type: "switch_language", lang: "gu" },
      actionSummary: "Language switched to Gujarati",
      actionSummaryHi: "ભાષા ગુજરાતીમાં બદલી",
      slots: nextSlots,
    };
  }
  if (/(tamil|தமிழ்)/i.test(t)) {
    return {
      replyMessage: newMsg("saathi", "சரி, நான் இப்போது தமிழில் பேசுகிறேன். உங்கள் பயிரில் என்ன பிரச்சனை?"),
      action: { type: "switch_language", lang: "ta" },
      actionSummary: "Language switched to Tamil",
      actionSummaryHi: "மொழி தமிழில் மாற்றப்பட்டது",
      slots: nextSlots,
    };
  }

  // 2. Direct Camera / Photo capture orders
  const hasPhotoOrder = /(कैमरा खोलो|फोटो खींच|फोटो ले|फोटो खींचनी|camera|take photo|open camera|start capture|photo kheechna|tasveer)/i.test(t);
  if (hasPhotoOrder || (nextSlots.peril && /(हाँ|yes|sure|khol|kholo|open|chalo|ready)/i.test(t))) {
    const peril = nextSlots.peril || "normal";
    const cfg = routeForPeril(peril);
    return {
      replyMessage: newMsg(
        "saathi",
        currentLang === "hi"
          ? `कैमरा खोला जा रहा है — ${cfg.labelHi} के लिए ${cfg.requiredAngles.length} आवश्यक कोण तैयार हैं।`
          : `Opening camera studio — ${cfg.requiredAngles.length} angles protocol ready for ${cfg.labelEn}.`,
        `कैमरा खोला जा रहा है — ${cfg.labelHi} के लिए ${cfg.requiredAngles.length} आवश्यक कोण तैयार हैं।`
      ),
      action: {
        type: "open_camera",
        peril,
        plotId: nextSlots.plotId,
        crop: nextSlots.crop,
        angles: cfg.requiredAngles,
      },
      actionSummary: `Opening Camera Studio with ${cfg.requiredAngles.length}-Angle Protocol (${cfg.labelEn})`,
      actionSummaryHi: `कैमरा स्टूडियो खोला जा रहा है (${cfg.labelHi})`,
      slots: nextSlots,
    };
  }

  // 3. Claims Navigation & Filtering Orders
  if (/(सत्यापित दावे|verified claim|approved claim|स्वीकृत दावे|verified claims)/i.test(t)) {
    return {
      replyMessage: newMsg(
        "saathi",
        currentLang === "hi" ? "सत्यापित दावों की सूची खोली जा रही है…" : "Opening verified claims list…",
        "सत्यापित दावों की सूची खोली जा रही है…"
      ),
      action: { type: "navigate", url: "/farmer/claims?status=verified", label: "Opening Verified Claims" },
      actionSummary: "Navigating to Verified Claims",
      actionSummaryHi: "सत्यापित दावों पर ले जाया जा रहा है",
      slots: nextSlots,
    };
  }
  if (/(दावे दिखाओ|मेरे दावे|show claims|my claims|claim list|claims)/i.test(t)) {
    return {
      replyMessage: newMsg(
        "saathi",
        currentLang === "hi" ? "आपके सभी दावों की सूची खोली जा रही है…" : "Opening your claims list…",
        "आपके सभी दावों की सूची खोली जा रही है…"
      ),
      action: { type: "navigate", url: "/farmer/claims", label: "Opening Claims List" },
      actionSummary: "Navigating to Claims List",
      actionSummaryHi: "दावों की सूची पर ले जाया जा रहा है",
      slots: nextSlots,
    };
  }

  // 4. Registered Plots Navigation
  if (/(पंजीकृत खेत|खेत दिखाओ|मेरे खेत|registered plots|my plots|show plots|plot details)/i.test(t)) {
    return {
      replyMessage: newMsg(
        "saathi",
        currentLang === "hi" ? "पंजीकृत खेतों का विवरण खोला जा रहा है…" : "Opening registered plot details…",
        "पंजीकृत खेतों का विवरण खोला जा रहा है…"
      ),
      action: { type: "navigate", url: "/farmer#registered-plots", label: "Opening Registered Plots" },
      actionSummary: "Navigating to Registered Plots",
      actionSummaryHi: "पंजीकृत खेतों पर ले जाया जा रहा है",
      slots: nextSlots,
    };
  }

  // 5. Timeline / Reminders
  if (/(समयसीमा|रिमाइंडर|timeline|reminders|milestones|tasks)/i.test(t)) {
    return {
      replyMessage: newMsg(
        "saathi",
        currentLang === "hi" ? "समयसीमा एवं रिमाइंडर पृष्ठ खोला जा रहा है…" : "Opening reminders & timeline…",
        "समयसीमा एवं रिमाइंडर पृष्ठ खोला जा रहा है…"
      ),
      action: { type: "navigate", url: "/farmer/reminders", label: "Opening Reminders" },
      actionSummary: "Navigating to Reminders",
      actionSummaryHi: "रिमाइंडर पर ले जाया जा रहा है",
      slots: nextSlots,
    };
  }

  // 6. Default Multi-turn Reply
  const reply = buildSaathiReply(nextSlots, currentLang);
  return {
    replyMessage: reply,
    slots: nextSlots,
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
    "CONVERSATION RULES:\n" +
    "- PRECISE & SHORT BY DEFAULT: Form complete, natural sentences, but answer ONLY what was asked directly without unprompted lectures. Keep default answers to 1-2 crisp sentences.\n" +
    "- EXPLAIN IN DETAIL WHEN ASKED: If the farmer asks for details or says 'samajh nahi aaya' ('didn't understand') or expresses confusion, acknowledge warmly and give a patient, thorough, step-by-step explanation.\n" +
    "- SELF-AWARE & GROUNDED: Be self-aware of your role; guide evidence collection, but never invent payout/insurance approvals.";
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

// Gemini Live uses WEB_FUNCTION_DECLARATIONS (voice/function-declarations.ts).
// This list is the text-intake / overlay catalog. Names are aliased to Live tools
// in saathi/tool-catalog.ts so take_photo === capture_current_angle, etc.
// classify_claim is also used server-side by classifyPerilWithLLM.
