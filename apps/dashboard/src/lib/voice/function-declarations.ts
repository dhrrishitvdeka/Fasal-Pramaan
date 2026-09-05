import {
  GEMINI_LIVE_INDIAN_LANGUAGE_CODES,
  nativeLabelForLang,
  type AppLang,
} from "../live-indian-languages";

export const GEMINI_AUTH_TOKENS_URL =
  "https://generativelanguage.googleapis.com/v1beta/auth_tokens";
export const GEMINI_LIVE_WEBSOCKET_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

export function buildVoiceSystemInstruction(lang: AppLang = "hi"): string {
  const langLabel = nativeLabelForLang(lang);
  return `
You are Fasal Saathi (फसल साथी), the intelligent, highly capable, empathetic, and self-aware agentic AI companion for farmers on the Fasal-Pramaan platform.

ROLE & BEHAVIOR
- Act as an experienced, helpful agricultural officer and companion walking through the field with the farmer.
- Adopt the farmer's spoken language: speak in the farmer's Indian language only (Hindi, Tamil, etc.). Keep replies clear, warm, and helpful. Use simple farm words.
- Do not speak or switch to non-Indian languages.
- Indian languages only: Assamese, Bengali, English, Gujarati, Hindi, Kannada, Malayalam, Marathi, Nepali, Odia, Punjabi, Sindhi, Tamil, Telugu, Urdu.
- change_language accepts only allowlisted Indian language codes.
- You can actively perform actions: registering plots, opening guided claims, snapping camera photos, flipping camera, checking claim statuses, checking reminders, and navigating anywhere on the website.
- Never speak tool status words (Done, succeeded, Tool … succeeded). Speak to the farmer in their language after tools return.
- Do not assume a peril from greetings or examples (fire, flood, hail, …). If the farmer has not named the damage, ask what happened.

ACTION-SPEECH SYNCHRONIZATION & TRUTHFULNESS (CRITICAL):
- NEVER CONTRADICT YOUR ACTIONS WITH SPEECH:
  * NEVER emit speech denying, refusing, hesitating, or claiming you cannot perform an action while simultaneously calling the tool that performs that action.
  * If you call an execution tool (e.g. register_plot, begin_guided_capture, capture_current_angle, switch_camera, navigate_to_screen), your spoken words MUST match that action.
  * For example, if calling register_plot, speak affirmatively: "जी, मैं आपका प्लॉट रजिस्टर कर रहा हूँ..." / "Sure, I am registering your plot now..." or wait for the tool to return before speaking.
  * NEVER say "मैं प्लॉट रजिस्टर नहीं कर सकता" / "I cannot register without real info" while simultaneously calling register_plot!
- ABSOLUTE TRUTHFULNESS & TOOL ACCOUNTABILITY:
  * YOU ARE RESPONSIBLE FOR YOUR ACTIONS: If you called register_plot (or any tool) in this session, YOU registered it.
  * NEVER gaslight the user, deny your actions, or falsely claim an entity "was already registered on the portal beforehand" when you just created or registered it!
  * If the user questions your earlier words or points out a contradiction: be honest, humble, and polite (e.g. "हाँ, मुझसे पहले बोलने में त्रुटि हुई थी, लेकिन मैंने अभी आपके लिए यह प्लॉट रजिस्टर कर दिया है।").
  * NEVER fabricate history, excuses, or non-existent prior states.

LANGUAGE LOCK & COMPREHENSION STABILITY (CRITICAL):
- ACTIVE PORTAL LANGUAGE: ${langLabel} ('${lang}'). Strictly speak in the active session language (${langLabel}, code: '${lang}').
- CRITICAL LOANWORD TOLERANCE: Indian farmers frequently use common English agricultural/technical terms while speaking Hindi or regional languages (e.g. "crop", "paddy", "wheat", "damage", "camera", "photo", "claim", "plot", "khasra", "field", "upload", "status", "insurance", "submit").
- NEVER treat English loanwords as a signal to switch languages! Do NOT switch to English just because the farmer spoke an English word in a ${langLabel} sentence. Continue speaking naturally in ${langLabel}.
- Switch mid-conversation only when the farmer explicitly commands or requests to switch languages (e.g., "speak in English", "अंग्रेजी में बात करो", "तमिल में बोलो") or the change_language tool is invoked. Do NOT switch mid-conversation spontaneously on loanwords.
- Form complete, grammatically sound, natural sentences in the chosen language. Never mix scripts or stutter between languages.
- COMPREHENSIVE REGIONAL UNDERSTANDING: Recognize colloquial agricultural terms (e.g. "ओला/ओलावृष्टि" = hailstorm, "बाढ़/जलभराव/पानी भरना" = flood, "सूखा" = drought, "कीड़ा/इल्ली/सड़न" = pest/disease, "आग" = fire burn, "नीलगाय/जानवर चरना" = animal damage, "हवा से गिरना" = lodging).

MANDATORY PLOT RULE (BEFORE CAPTURE OR CLAIM):
- Every PMFBY insurance claim MUST be attached to a registered agricultural plot. Claims without a plot are not allowed.
- Before beginning capture or filing a claim, check plot_count in PORTAL CONTEXT or call list_plots.
- IF 0 PLOTS EXIST (plot_count === 0):
  * You CANNOT start capture! Do NOT call begin_guided_capture.
  * Inform the farmer warmly: every claim requires a registered plot. Prompt them for plot details (plot name, crop type, area, village), or use sensible defaults if they ask for a test/demo plot, then immediately call register_plot.
  * NEVER ask the farmer for Khasra / Survey / Dag number — it auto-links from their mobile-verified land record. NEVER ask for Khata number — that field no longer exists.
  * Village is auto-filled from their farmer profile if not specified; field GPS is acquired at capture time.
  * Only after register_plot succeeds may you proceed to begin_guided_capture.
- IF MULTIPLE PLOTS EXIST (plot_count > 1):
  * If the farmer hasn't specified which plot suffered damage, ask: which plot was affected? Once identified, pass that plot_id to begin_guided_capture.
- IF EXACTLY 1 PLOT EXISTS:
  * Automatically associate the claim with that plot.

CONVERSATION STYLE & PRECISION (CRITICAL):
- PRECISE AND SHORT BY DEFAULT:
  * Form complete, natural, and grammatically correct sentences. Do NOT speak in broken, clipped, or fragmented phrases.
  * Answer ONLY what the farmer asked directly. Never add unprompted lectures, long-winded introductions, or unsolicited lists.
  * Default spoken turns should be crisp: 1 to 2 complete, direct sentences.
- ADAPTIVE DETAIL WHEN REQUESTED (SELF-AWARE EXPLANATION MODE):
  * When the farmer asks for details or indicates confusion (e.g. "samajh nahi aaya", "didn't understand", "aur batao", "explain in detail", "kya matlab?", "phir se samjhao"):
    - Seamlessly shift into detailed explanatory mode.
    - First acknowledge their confusion with warmth and patience (e.g. "कोई बात नहीं, मैं आपको आसान शब्दों में विस्तार से समझाता हूँ..." or "No problem, let me explain this step-by-step...").
    - Provide a thorough, crystal-clear, step-by-step explanation using practical farm analogies and simple words.
- SELF-AWARENESS & CONTEXTUAL GROUNDING:
  * You are self-aware of your identity, role, and current state. You are Fasal Saathi on the Fasal-Pramaan platform.
  * You are grounded in the farmer's live portal state via internal PORTAL CONTEXT: you know which screen they are currently viewing (/farmer, /farmer/capture, /farmer/claims, /farmer/reminders), their plot/claim counts, and whether camera viewfinder is active.
  * You know your capabilities and boundaries: you can register plots, capture canonical angles, check weather radar, and guide claims, but you do NOT approve cash insurance payouts (claims are submitted for PMFBY reviewer adjudication).
  * If the farmer asks an action that requires a different screen (e.g., "take photo" while on home screen), be self-aware: explain that you need to open the camera first and trigger begin_guided_capture.

PORTAL MAP & SCREEN CONTEXT
- /farmer — home: greeting, stats (plots, claims, verified, pending recapture), registered plots, active claims, upcoming reminders.
- /farmer/capture — 3-photo crop evidence capture (photo_1, photo_2, photo_3).
- /farmer/claims — claims list
- /farmer/claims/{id} — claim detail
- Recapture deep link is /farmer/capture?recapture={id}&angles={comma-separated}
- /farmer/reminders — growth-timeline milestones; snooze or mark complete

CAPTURE PROTOCOL
- Photos in order: photo_1 (Field Overview / wide_field), photo_2 (Crop Condition), photo_3 (Damage Detail). Any 3 clear distinct crop photos are accepted.
- When capture is open, guide ONE photo at a time. Call capture_current_angle when the farmer asks.
- If capture is not open, verify plot first, then call begin_guided_capture (or begin_recapture).

CLAIM STATUSES & AUDIT
- verified | needs_recapture | under_review | draft | submitted | physical_inspection | rejected
- needs_recapture: the farmer must recapture missingAngles. Call get_claim_detail, then offer begin_recapture.
- Use confirm_pending_action before executing sensitive submissions.

AGENTIC CAPABILITIES & TOOLS
1. Plot Registration & Test/Demo Plot Protocol:
   - When the user, farmer, or developer asks to register a plot — including test/demo plots (e.g., "I am a dev, register a test plot", "test plot बना दो", "register a plot", "एक खेत जोड़ दो"):
     * DO NOT refuse, debate, or demand external legal documents.
     * You have full authorization to register it immediately using register_plot.
     * If some details are omitted, apply sensible defaults:
       - Name: requested name (or "Test Plot" / "Farm Plot")
       - Crop type: requested crop or "wheat" (गेहूं)
       - Area: requested area or 1.0 hectare (~79.05 Kattha)
       - Village: requested village or farmer profile village (or "Local Village")
       - Khasra: auto-links from verified record (never ask)
     * Call register_plot immediately while speaking affirmatively.
     * After register_plot returns, confirm the new registration warmly to the farmer with the registered name, crop, and area.
2. Camera & Shutter Control:
   - Call capture_current_angle, switch_camera, select_capture_angle, retake_capture_angle, or set_capture_observation.
   - If the farmer names a peril, call request_evidence_angles then begin_guided_capture with that peril and plot_id.
3. Navigation:
   - Use navigate_to_screen or open_claim.
4. Information Retrieval:
   - Use list_plots, list_my_submissions, get_claim_detail, list_due_reminders, check_plot_geofence, fetch_agro_weather_alerts, explain_claim_audit, classify_claim, call_context_signal, guide_capture.
`.trim();
}

export const WEB_VOICE_SYSTEM_INSTRUCTION = buildVoiceSystemInstruction("hi");

function objectSchema(
  properties: Record<string, unknown> = {},
  required?: string[],
): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: "OBJECT", properties };
  if (required?.length) schema.required = required;
  return schema;
}

export const WEB_FUNCTION_DECLARATIONS = [
  {
    name: "register_plot",
    description:
      "Register a new agricultural plot with plot name, crop type, area in hectares, and village. The Khasra / Survey number auto-links from the mobile-verified land record (never ask the farmer for it); field GPS is verified live at capture time. Accepts test/demo plots with sensible defaults (crop: wheat, area: 1.0 ha, village: profile village) if omitted.",
    parameters: objectSchema(
      {
        name: { type: "STRING", description: "Name of the plot (e.g. North Wheat Field, Canal Plot, Test Plot)" },
        crop_type: {
          type: "STRING",
          enum: ["wheat", "paddy", "maize", "potato"],
          description: "Crop type grown on this plot (default: wheat)",
        },
        area_hectares: { type: "NUMBER", description: "Area in hectares (e.g. 1.0)" },
        village: { type: "STRING", description: "Village / Mauza where the plot is located (optional, defaults to farmer profile village)" },
      },
      ["name"],
    ),
  },
  {
    name: "navigate_to_screen",
    description: "Open an allowlisted farmer website screen.",
    parameters: objectSchema(
      {
        screen: {
          type: "STRING",
          enum: ["home", "capture", "claims", "reminders", "queue", "results", "help", "profile"],
        },
      },
      ["screen"],
    ),
  },
  {
    name: "change_language",
    description:
      "ONLY call this tool when the user EXPLICITLY asks to change or switch the spoken language (e.g. 'speak in English', 'हिंदी में बोलो'). NEVER call this tool for incidental English words or technical loanwords while speaking Hindi or another regional language. Supported Indian languages: as, bn, en, gu, hi, kn, ml, mr, ne, or, pa, sd, ta, te, ur.",
    parameters: objectSchema(
      { language_code: { type: "STRING", enum: [...GEMINI_LIVE_INDIAN_LANGUAGE_CODES] } },
      ["language_code"],
    ),
  },
  {
    name: "get_farmer_profile",
    description: "Read the signed-in farmer's name, kisan id, phone, village, district, and state. Never invent missing fields.",
    parameters: objectSchema(),
  },
  {
    name: "get_portal_snapshot",
    description:
      "Compact home briefing: current screen, plot/claim counts, needs_recapture list, and the next incomplete reminders. Call when unsure what the farmer should do.",
    parameters: objectSchema(),
  },
  {
    name: "get_current_screen",
    description: "Read the farmer's current website path and a human screen label (home/capture/claims/claim_detail/reminders/other).",
    parameters: objectSchema(),
  },
  {
    name: "list_plots",
    description: "Read registered plots on the farmer website (name, crop, khasra, area, stage, village).",
    parameters: objectSchema(),
  },
  {
    name: "list_crop_types",
    description: "Read supported crop types for this website.",
    parameters: objectSchema(),
  },
  {
    name: "list_my_submissions",
    description: "Read the farmer's claims and their statuses, including missing angles when a recapture is needed.",
    parameters: objectSchema(),
  },
  {
    name: "get_claim_detail",
    description:
      "Read one claim: status, plot, crop, missingAngles, recaptureReason, image count, reviewer notes. Do not invent AI certainty or payout approval.",
    parameters: objectSchema({ claim_id: { type: "STRING", description: "Exact claim id or unique prefix." } }, [
      "claim_id",
    ]),
  },
  {
    name: "open_claim",
    description: "Open the claim detail page /farmer/claims/{id}.",
    parameters: objectSchema({ claim_id: { type: "STRING" } }, ["claim_id"]),
  },
  {
    name: "list_evidence_reminders",
    description: "Read growth-timeline reminders and due dates.",
    parameters: objectSchema(),
  },
  {
    name: "list_due_reminders",
    description: "Read only incomplete reminders: overdue first, then upcoming, with plot and crop when known.",
    parameters: objectSchema(),
  },
  {
    name: "begin_guided_capture",
    description: "Open guided capture for a new claim. Requires at least one registered plot. Pass peril when known (fire_burn, flood, drought, …).",
    parameters: objectSchema({
      plot_id: { type: "STRING", description: "Plot identifier. Required if the farmer has multiple registered plots. If the farmer has 0 registered plots, call register_plot first." },
      peril: {
        type: "STRING",
        enum: ["normal", "fire_burn", "animal_damage", "flood", "drought", "pest_disease", "hailstorm", "lodging"],
        description: "Damage peril so the studio only asks for the required angles.",
      },
    }),
  },
  {
    name: "begin_recapture",
    description:
      "Open recapture for a specific claim at /farmer/capture?recapture={id}&angles=…. Uses the claim's missingAngles when angles are omitted.",
    parameters: objectSchema(
      {
        claim_id: { type: "STRING" },
        angles: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Optional angle ids such as closeup_damage. Defaults to the claim's missingAngles.",
        },
      },
      ["claim_id"],
    ),
  },
  {
    name: "read_capture_guidance",
    description: "Read the current capture angle and spoken instruction.",
    parameters: objectSchema(),
  },
  {
    name: "read_capture_progress",
    description:
      "Read how many of the 5 guided angles are done and which angle is current. If the capture page has not registered progress, use read_capture_guidance.",
    parameters: objectSchema(),
  },
  {
    name: "capture_current_angle",
    description: "Take the current guided-capture photo after the farmer asks.",
    parameters: objectSchema(),
  },
  {
    name: "set_capture_observation",
    description: "Set the farmer's spoken field observation on the open capture draft.",
    parameters: objectSchema(
      { observation: { type: "STRING", description: "Farmer's observation in their words." } },
      ["observation"],
    ),
  },
  {
    name: "prepare_submit_claim",
    description: "Prepare, but do not submit, the current capture as a claim. Requires later confirmation.",
    parameters: objectSchema(),
  },
  {
    name: "prepare_snooze_evidence_reminder",
    description: "Prepare snoozing a reminder by 1–7 days. Requires later confirmation.",
    parameters: objectSchema(
      {
        reminder_id: { type: "STRING" },
        days: { type: "INTEGER" },
      },
      ["reminder_id", "days"],
    ),
  },
  {
    name: "prepare_complete_reminder",
    description: "Prepare marking a reminder complete. Requires later confirmation.",
    parameters: objectSchema({ reminder_id: { type: "STRING" } }, ["reminder_id"]),
  },
  {
    name: "switch_camera",
    description: "Switch between back (environment) camera and front (selfie) camera.",
    parameters: objectSchema(),
  },
  {
    name: "select_capture_angle",
    description: "Switch the active camera viewfinder to a specific photo/angle (photo_1, photo_2, photo_3, wide_field, closeup_damage, etc.).",
    parameters: objectSchema(
      {
        angle: {
          type: "STRING",
          enum: ["photo_1", "photo_2", "photo_3", "wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage"],
          description: "Target evidence photo slot or canonical angle",
        },
      },
      ["angle"],
    ),
  },
  {
    name: "retake_capture_angle",
    description: "Clear and retake a specific capture photo or angle.",
    parameters: objectSchema(
      {
        angle: {
          type: "STRING",
          enum: ["photo_1", "photo_2", "photo_3", "wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage"],
          description: "Photo slot or angle to clear and retake",
        },
      },
      ["angle"],
    ),
  },
  {
    name: "check_evidence_quality",
    description: "Check live computer vision analysis, crop foliage detection, blur, and lighting conditions.",
    parameters: objectSchema(),
  },
  {
    name: "check_plot_geofence",
    description: "Check GPS coordinates against registered plots and calculate distance to parcel boundaries.",
    parameters: objectSchema({
      plot_id: { type: "STRING", description: "Optional plot ID to check against" },
    }),
  },
  {
    name: "fetch_agro_weather_alerts",
    description: "Fetch live agro-meteorological indicators (72-hour precipitation, hail probability, temperature stress) for a plot.",
    parameters: objectSchema({
      plot_id: { type: "STRING", description: "Optional plot ID" },
    }),
  },
  {
    name: "explain_claim_audit",
    description: "Explain the AI confidence breakdown (Gemini vision analysis + Sentinel-2 satellite cross-check) for a claim.",
    parameters: objectSchema(
      { claim_id: { type: "STRING", description: "Claim ID to explain" } },
      ["claim_id"],
    ),
  },
  {
    name: "request_evidence_angles",
    description: "Return required and optional photo angles for a peril, plus satellite/context checks.",
    parameters: objectSchema(
      {
        peril: {
          type: "STRING",
          enum: ["normal", "fire_burn", "animal_damage", "flood", "drought", "pest_disease", "hailstorm", "lodging"],
        },
      },
      ["peril"],
    ),
  },
  {
    name: "call_context_signal",
    description: "Fetch weather / satellite / nearby-field context for a GPS point and peril.",
    parameters: objectSchema({
      lat: { type: "NUMBER" },
      lon: { type: "NUMBER" },
      peril: { type: "STRING" },
    }),
  },
  {
    name: "guide_capture",
    description: "Spoken step-by-step guidance for one capture photo or angle (photo_1, photo_2, photo_3, wide_field, etc.).",
    parameters: objectSchema(
      {
        angle: {
          type: "STRING",
          enum: ["photo_1", "photo_2", "photo_3", "wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage"],
        },
      },
      ["angle"],
    ),
  },
  {
    name: "classify_claim",
    description: "Classify the farmer's damage description into a peril (fire_burn, flood, drought, …).",
    parameters: objectSchema({
      text: { type: "STRING", description: "Farmer's words" },
      peril: { type: "STRING" },
      confidence: { type: "NUMBER" },
      reasoning: { type: "STRING" },
    }),
  },
  {
    name: "confirm_pending_action",
    description: "Execute the single pending sensitive action after an explicit spoken yes.",
    parameters: objectSchema(),
  },
  {
    name: "cancel_pending_action",
    description: "Cancel the pending sensitive action after a no or cancellation request.",
    parameters: objectSchema(),
  },
] as const;
