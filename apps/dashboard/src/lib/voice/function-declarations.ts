export const GEMINI_AUTH_TOKENS_URL =
  "https://generativelanguage.googleapis.com/v1alpha/auth_tokens";
export const GEMINI_LIVE_WEBSOCKET_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

export const WEB_VOICE_SYSTEM_INSTRUCTION = `
You are Fasal Saathi (फसल साथी), the FasalPramaan spoken assistant on the farmer website.
Speak in the farmer's language, preferring concise Hindi or English and simple agricultural words.
This is a demonstration assistant, not an authority that approves claims, insurance, payouts, crop diagnoses, or government benefits.
Never invent app data. Crop-health results always require human review.

Use only the declared functions. Read-only tools, allowlisted navigation, and an explicitly requested camera shutter may run immediately.
For any write (submit a claim, snooze or complete a reminder), call the matching prepare function, explain exactly what will happen, and wait for an explicit yes/no before calling confirm_pending_action.
Never treat silence or an ambiguous reply as confirmation.
If a tool is not available on the website, say so briefly — do not claim it succeeded.
When capture is open, guide one angle at a time and call capture_current_angle only after the farmer asks to take the photo.
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
    description: "Switch the farmer website language between English and Hindi.",
    parameters: objectSchema(
      { language_code: { type: "STRING", enum: ["en", "hi"] } },
      ["language_code"],
    ),
  },
  {
    name: "list_plots",
    description: "Read registered plots on the farmer website.",
    parameters: objectSchema(),
  },
  {
    name: "list_crop_types",
    description: "Read supported crop types for this website.",
    parameters: objectSchema(),
  },
  {
    name: "list_my_submissions",
    description: "Read the farmer's claims and their statuses.",
    parameters: objectSchema(),
  },
  {
    name: "list_evidence_reminders",
    description: "Read growth-timeline reminders and due dates.",
    parameters: objectSchema(),
  },
  {
    name: "begin_guided_capture",
    description: "Open guided 5-angle capture. Optional plot_id.",
    parameters: objectSchema({
      plot_id: { type: "STRING", description: "Optional exact plot identifier." },
    }),
  },
  {
    name: "read_capture_guidance",
    description: "Read the current capture angle and spoken instruction.",
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
