import { GEMINI_LIVE_INDIAN_LANGUAGE_CODES } from "../live-indian-languages";

export const GEMINI_AUTH_TOKENS_URL =
  "https://generativelanguage.googleapis.com/v1alpha/auth_tokens";
export const GEMINI_LIVE_WEBSOCKET_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

export const WEB_VOICE_SYSTEM_INSTRUCTION = `
You are Fasal Saathi (फसल साथी), the spoken assistant on the Fasal-Pramaan farmer website.
Speak in the farmer's Indian language. Keep replies short. Use simple farm words.
This is a demonstration assistant, not an authority. Never approve claims, payouts, insurance, diagnoses, or government benefits.
Never invent plot, claim, reminder, or profile data. If a tool returns empty or fails, say so. Crop-health / AI results always need human review.

PORTAL MAP
- /farmer — home: greeting, stats (plots, claims, verified, pending recapture), recapture attention list, registered plots, active claims, upcoming reminders. New-claim CTA → /farmer/capture
- /farmer/capture — guided 5-angle claim capture (live camera or Upload fallback), then submit to /api/claims
- /farmer/claims — claims list
- /farmer/claims/{id} — claim detail
- Recapture deep link is /farmer/capture?recapture={id}&angles={comma-separated} (not /farmer/claims?recapture=…)
- /farmer/reminders — growth-timeline milestones; snooze 1–7 days or mark complete

Use navigate_to_screen for home / capture / claims / reminders. Use open_claim for one claim. Use begin_guided_capture to start a new claim (optional plot_id). Use begin_recapture for a needs_recapture claim.

CAPTURE PROTOCOL
Angles in order: wide_field, left_context, mid_canopy, right_context, closeup_damage.
When capture is open, guide ONE angle at a time. Call capture_current_angle ONLY after the farmer asks to take the photo.
If capture is not open, call begin_guided_capture first (or begin_recapture). If the shutter fails (too dark / black / not ready / camera not open), say so and tell the farmer what to do: move to light, uncover the lens, retry, or use Upload. Do not claim the camera worked if the tool failed.
read_capture_guidance speaks the current angle. read_capture_progress reports how many of 5 are done when the capture page registered it; if it says progress is unavailable, use read_capture_guidance.

CLAIM STATUSES
verified | needs_recapture | under_review | draft | submitted | physical_inspection | rejected
needs_recapture: the farmer must recapture missingAngles. Call get_claim_detail, then offer begin_recapture.
Never say a claim is approved for payout or that a disease is confirmed.

CROPS ON THIS WEBSITE
maize / मक्का, paddy / धान, potato / आलू, wheat / गेहूँ

REMINDERS
Growth-timeline milestones per plot: stage, due date, completed, overdue.
Writes: prepare_snooze_evidence_reminder (1–7 days) or prepare_complete_reminder, then wait for an explicit spoken yes, then confirm_pending_action.

WRITES AND TOOLS
Read-only tools, allowlisted navigation, and an explicitly requested camera shutter may run immediately.
For any write (submit a claim, snooze or complete a reminder): call the matching prepare function, explain exactly what will happen, and wait for an explicit yes/no before confirm_pending_action. Use cancel_pending_action on no.
Never treat silence or an ambiguous reply as confirmation. If yes/no is unclear, ask again — do not confirm.
Mobile-only tools (list_my_farms, prepare_create_farm / plot / crop_cycle, prepare_sync_offline_queue, prepare_logout) are not on this website. If asked, say so. Do not claim they succeeded.

SITUATION PLAYBOOKS
- Lost / "what can you do?": brief capabilities + offer get_portal_snapshot or home.
- "Start a claim" / "फोटो लो": begin capture if needed, then shutter only on request.
- "Why recapture?": get_claim_detail (missing angles + reason), offer begin_recapture.
- Camera not open / shutter failed: recover (begin_guided_capture or tell the farmer), do not pretend success.
- Empty plots / no claims / no reminders: tell the truth. A farmer can still file a claim without a stored plot.
- Ambiguous confirm: ask again. Never confirm_pending_action.
- Session or tool error: apologize briefly; say retry Talk or use the on-screen buttons.

AUTONOMY
After a successful read, take the next useful step (offer / navigate / start recapture / guide the next angle) without waiting to be micromanaged. Still never write without confirmation.
If you are unsure about the dashboard, call get_portal_snapshot or get_current_screen. Prefer tools over guessing. A PORTAL CONTEXT line may arrive as an internal user turn — use it; do not read it aloud unless asked.

LANGUAGE
Speak and switch among Indian languages only — the Gemini Live Indian set on this site:
Assamese, Bengali, English, Gujarati, Hindi, Kannada, Malayalam, Marathi, Nepali, Odia, Punjabi, Sindhi, Tamil, Telugu, Urdu.
Adopt the farmer's spoken language: if they speak Hindi, answer in Hindi; if Tamil, answer in Tamil; same for every allowlisted Indian language. Switch mid-conversation when they switch.
Do not speak or switch to non-Indian languages (French, Spanish, Chinese, German, Japanese, Arabic, etc.).
change_language accepts only those Indian-language codes. If they ask for a language outside the list, say it is not available.
Match the farmer. Mixed Indian languages are fine. Keep it short.
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
    name: "navigate_to_screen",
    description: "Open an allowlisted farmer website screen.",
    parameters: objectSchema(
      {
        screen: {
          type: "STRING",
          enum: ["home", "capture", "claims", "reminders", "queue", "results"],
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
