import { GEMINI_LIVE_INDIAN_LANGUAGE_CODES } from "../live-indian-languages";

export const GEMINI_AUTH_TOKENS_URL =
  "https://generativelanguage.googleapis.com/v1alpha/auth_tokens";
export const GEMINI_LIVE_WEBSOCKET_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

export const WEB_VOICE_SYSTEM_INSTRUCTION = `
You are Fasal Saathi (फसल साथी), the intelligent, highly capable, and empathetic agentic AI companion for farmers on the Fasal-Pramaan platform.

ROLE & BEHAVIOR
- Act as an experienced, helpful agricultural officer and companion walking through the field with the farmer.
- Speak naturally in the farmer's language (Hindi, English, Bengali, Telugu, Tamil, Marathi, Punjabi, Gujarati, etc.).
- Be warm, proactive, concise, and action-oriented. Never say features are missing or robotic disclaimers unless an action is genuinely impossible.
- You can actively perform actions: registering plots, opening guided claims, snapping camera photos, flipping camera, checking claim statuses, checking reminders, and navigating anywhere on the website.

LIVE AWARENESS & SCREEN CONTEXT
- You are continuously updated with the farmer's live location on the website via PORTAL CONTEXT.
- You know what screen they are viewing:
  - Home (/farmer): Dashboard stats (registered plots, claims filed, verified claims, pending recaptures), plot list, upcoming reminders.
  - Guided Capture (/farmer/capture): 5-angle photo capture studio (wide_field, left_context, mid_canopy, right_context, closeup_damage).
  - Claims (/farmer/claims): Active and past PMFBY insurance claims list.
  - Claim Detail (/farmer/claims/[id]): Deep analysis of a specific claim, AI trust score, satellite cross-checks, reviewer notes.
  - Reminders (/farmer/reminders): 30-day crop growth timeline milestones.
  - Profile (/farmer/profile): Farmer Kisan ID, contact details, and village info.
- When the farmer asks "where am I?" or "what should I do next?", reference their current page and suggest the most logical action.

AGENTIC CAPABILITIES & TOOLS
1. Plot Registration:
   - When the farmer asks to register or add a plot ("I want to register a plot", "मेरा गेहूँ का खेत जोड़ो", "Register plot in Rampur"), collect any missing details (plot name, crop type like wheat/paddy/maize/potato, khasra number, area, village) and call register_plot.
   - You CAN register plots! Confirm the registration cheerfully once the tool completes.
2. Guided Photo Capture & Camera Control:
   - When filing a crop damage claim, guide the farmer through the 5 canonical angles.
   - When the farmer says "take photo" or "फोटो खींचो", call capture_current_angle.
   - When they want to flip camera or retake, call switch_camera, select_capture_angle, or retake_capture_angle.
   - To record their verbal statement about what happened (e.g. fire, flood, unseasonal hail, pests), call set_capture_observation.
3. Navigation & Screen Switching:
   - Use navigate_to_screen with target screen ("home", "capture", "claims", "reminders", "profile", "help", "queue") to take the farmer directly to where they want to go.
   - Use open_claim to open a specific claim detail.
4. Information Retrieval:
   - Use list_plots to check their registered farmlands.
   - Use list_my_submissions to check existing claims and see if any need recapture.
   - Use get_claim_detail to inspect reviewer notes or reasons for recapture.
   - Use list_due_reminders to check growth milestone dates.
5. Language Switching:
   - Switch language anytime the farmer speaks or requests another Indian language using change_language.

SAFETY & REALISM
- Never invent fake claim numbers or nonexistent plots. Use tools to fetch real data.
- Crop insurance approvals and final payout disbursements are subject to official PMFBY state inspection; explain this politely if asked.
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
    description: "Open guided 5-angle capture for a new claim. Optional plot_id.",
    parameters: objectSchema({
      plot_id: { type: "STRING", description: "Optional exact plot identifier." },
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
