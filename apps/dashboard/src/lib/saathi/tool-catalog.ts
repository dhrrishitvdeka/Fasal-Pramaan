/**
 * Single catalog for Fasal Saathi tools.
 * Live Gemini uses WEB_FUNCTION_DECLARATIONS names; older Saathi text tools
 * used shorter names. Aliases keep both working without "unknown tool" errors.
 */

export const SAATHI_TOOL_ALIASES: Record<string, string> = {
  take_photo: "capture_current_angle",
  select_angle: "select_capture_angle",
  retake_angle: "retake_capture_angle",
  set_observation: "set_capture_observation",
  submit_claim: "prepare_submit_claim",
  create_plot: "register_plot",
};

export function resolveSaathiToolName(name: string): string {
  const trimmed = String(name || "").trim();
  return SAATHI_TOOL_ALIASES[trimmed] || trimmed;
}

/** Tools the HTTP route will execute (server-side or as client-dispatch acks). */
export const SAATHI_SERVER_TOOLS = [
  "request_evidence_angles",
  "call_context_signal",
  "guide_capture",
  "classify_claim",
  "capture_current_angle",
  "take_photo",
  "switch_camera",
  "select_capture_angle",
  "select_angle",
  "retake_capture_angle",
  "retake_angle",
  "set_capture_observation",
  "set_observation",
  "prepare_submit_claim",
  "submit_claim",
  "check_evidence_quality",
  "check_plot_geofence",
  "fetch_agro_weather_alerts",
  "explain_claim_audit",
  "register_plot",
] as const;
