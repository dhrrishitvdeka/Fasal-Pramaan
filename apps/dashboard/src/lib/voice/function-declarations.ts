import { GEMINI_LIVE_INDIAN_LANGUAGE_CODES } from "../live-indian-languages";

export const GEMINI_AUTH_TOKENS_URL =
  "https://generativelanguage.googleapis.com/v1alpha/auth_tokens";
export const GEMINI_LIVE_WEBSOCKET_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

export const WEB_VOICE_SYSTEM_INSTRUCTION = `
You are Fasal Saathi (फसल साथी), the intelligent, highly capable, and empathetic agentic AI companion for farmers on the Fasal-Pramaan platform.

ROLE & BEHAVIOR
- Act as an experienced, helpful agricultural officer and companion walking through the field with the farmer.
- Speak in the farmer's Indian language only. Keep replies clear, warm, and helpful. Use simple farm words.
- Adopt the farmer's spoken language: if they speak Hindi, answer in Hindi; if Tamil, answer in Tamil. Switch mid-conversation when they switch.
- Do not speak or switch to non-Indian languages.
- Indian languages only: Assamese, Bengali, English, Gujarati, Hindi, Kannada, Malayalam, Marathi, Nepali, Odia, Punjabi, Sindhi, Tamil, Telugu, Urdu.
- change_language accepts only allowlisted Indian language codes.
- You can actively perform actions: registering plots, opening guided claims, snapping camera photos, flipping camera, checking claim statuses, checking reminders, and navigating anywhere on the website.

PORTAL MAP & SCREEN CONTEXT
- /farmer — home: greeting, stats (plots, claims, verified, pending recapture), registered plots, active claims, upcoming reminders.
- /farmer/capture — guided 5-angle claim capture (wide_field, left_context, mid_canopy, right_context, closeup_damage).
- /farmer/claims — claims list
- /farmer/claims/{id} — claim detail
- Recapture deep link is /farmer/capture?recapture={id}&angles={comma-separated}
- /farmer/reminders — growth-timeline milestones; snooze or mark complete

CAPTURE PROTOCOL
- Angles in order: wide_field, left_context, mid_canopy, right_context, closeup_damage.
- When capture is open, guide ONE angle at a time. Call capture_current_angle when the farmer asks.
- If capture is not open, call begin_guided_capture first (or begin_recapture).

CLAIM STATUSES & AUDIT
- verified | needs_recapture | under_review | draft | submitted | physical_inspection | rejected
- needs_recapture: the farmer must recapture missingAngles. Call get_claim_detail, then offer begin_recapture.
- Use confirm_pending_action before executing sensitive submissions.

AGENTIC CAPABILITIES & TOOLS
1. Plot Registration:
   - When the farmer asks to register or add a plot, collect details (name, crop_type, khasra_number, area, village) and call register_plot.
2. Camera & Shutter Control:
   - Call capture_current_angle, switch_camera, select_capture_angle, retake_capture_angle, or set_capture_observation.
   - If the farmer names a peril, call request_evidence_angles then begin_guided_capture with that peril.
3. Navigation:
   - Use navigate_to_screen or open_claim.
4. Information Retrieval:
   - Use list_plots, list_my_submissions, get_claim_detail, list_due_reminders, check_plot_geofence, fetch_agro_weather_alerts, explain_claim_audit, classify_claim, call_context_signal, guide_capture.
`.trim();

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
      "Register a new agricultural plot on the farmer's account with plot name, crop type, khasra number, area in hectares, and village.",
    parameters: objectSchema(
      {
        name: { type: "STRING", description: "Name of the plot (e.g. North Wheat Field, Khasra 402, Plot 1)" },
        crop_type: {
          type: "STRING",
          enum: ["wheat", "paddy", "maize", "potato"],
          description: "Crop type grown on this plot",
        },
        khasra_number: { type: "STRING", description: "Land record Khasra / Survey number" },
        area_hectares: { type: "NUMBER", description: "Area in hectares (e.g. 1.2)" },
        village: { type: "STRING", description: "Village where the plot is located" },
      },
      ["name", "crop_type"],
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
      "Switch the farmer website language to an allowlisted Gemini Live Indian language (as, bn, en, gu, hi, kn, ml, mr, ne, or, pa, sd, ta, te, ur).",
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
    description: "Open guided capture for a new claim. Pass peril when known (fire_burn, flood, drought, …).",
    parameters: objectSchema({
      plot_id: { type: "STRING", description: "Optional exact plot identifier." },
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
    description: "Switch the active camera viewfinder to a specific angle (wide_field, left_context, mid_canopy, right_context, closeup_damage).",
    parameters: objectSchema(
      {
        angle: {
          type: "STRING",
          enum: ["wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage"],
          description: "Target canonical angle",
        },
      },
      ["angle"],
    ),
  },
  {
    name: "retake_capture_angle",
    description: "Clear and retake a specific capture angle.",
    parameters: objectSchema(
      {
        angle: {
          type: "STRING",
          enum: ["wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage"],
          description: "Angle to clear and retake",
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
    description: "Spoken step-by-step guidance for one capture angle (wide_field, closeup_damage, …).",
    parameters: objectSchema(
      {
        angle: {
          type: "STRING",
          enum: ["wide_field", "left_context", "mid_canopy", "right_context", "closeup_damage"],
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
