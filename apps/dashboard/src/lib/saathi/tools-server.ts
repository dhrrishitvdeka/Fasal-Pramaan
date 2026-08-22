import { assembleContext } from "@/lib/context/assemble";
import { normalizePeril, routeForPeril } from "@/lib/claim-routing";
import { CANONICAL_ANGLES } from "@/lib/farmerI18n";
import { classifyPerilWithLLM } from "@/lib/saathi/classify-server";

export type SaathiToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

/**
 * Server-side Fasal Saathi tool dispatcher.
 * Mirrors SAATHI_FUNCTION_DECLARATIONS in saathi-agent.ts; classify_claim runs
 * the LLM here (server-side) so GEMINI_API_KEY never reaches the browser.
 */
export async function executeSaathiTool(
  name: string,
  args: Record<string, unknown>,
): Promise<SaathiToolResult> {
  switch (name) {
    case "request_evidence_angles":
      return requestEvidenceAngles(args);
    case "call_context_signal":
      return callContextSignal(args);
    case "guide_capture":
      return guideCapture(args);
    case "classify_claim":
      return classifyClaim(args);
    case "take_photo":
      return {
        ok: true,
        data: { action: "take_photo", message: "Dispatched camera shutter capture command to active studio." },
      };
    case "switch_camera":
      return {
        ok: true,
        data: { action: "switch_camera", message: "Dispatched camera flip command to active studio." },
      };
    case "select_angle":
      return {
        ok: true,
        data: { action: "select_angle", angle: args.angle, message: `Switched active angle to ${args.angle}.` },
      };
    case "retake_angle":
      return {
        ok: true,
        data: { action: "retake_angle", angle: args.angle, message: `Cleared ${args.angle} for recapture.` },
      };
    case "set_observation":
      return {
        ok: true,
        data: { action: "set_observation", observation: args.observation, message: "Observation saved to draft." },
      };
    case "submit_claim":
      return {
        ok: true,
        data: { action: "submit_claim", message: "Dispatched claim submission command." },
      };
    case "check_evidence_quality":
      return {
        ok: true,
        data: { action: "check_evidence_quality", message: "Inspecting realtime CV metrics." },
      };
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

function requestEvidenceAngles(args: Record<string, unknown>): SaathiToolResult {
  const peril = normalizePeril(args.peril);
  const cfg = routeForPeril(peril);
  return {
    ok: true,
    data: {
      peril,
      requiredAngles: cfg.requiredAngles,
      optionalAngles: cfg.optionalAngles,
      guidanceExtraEn: cfg.guidanceExtraEn,
      guidanceExtraHi: cfg.guidanceExtraHi,
      minConfidence: cfg.minConfidence,
      needsSatellite: cfg.needsSatellite,
      contextChecks: cfg.contextChecks,
    },
  };
}

type CompactSignal = {
  source: string;
  status: string;
  labelEn: string;
  summaryEn: string;
};

async function callContextSignal(args: Record<string, unknown>): Promise<SaathiToolResult> {
  const lat = toFiniteNumber(args.lat);
  const lon = toFiniteNumber(args.lon);
  if (lat == null || lon == null) {
    return { ok: false, error: "lat and lon are required numeric coordinates" };
  }
  const context = await assembleContext({
    lat,
    lon,
    peril: normalizePeril(args.peril),
    sowingDate: typeof args.sowingDate === "string" && args.sowingDate.trim() ? args.sowingDate : undefined,
    plotLat: toFiniteNumber(args.plotLat),
    plotLon: toFiniteNumber(args.plotLon),
  });
  const signals: CompactSignal[] = (context.signals || []).map((s) => ({
    source: s.source,
    status: s.status,
    labelEn: s.labelEn,
    summaryEn: s.summaryEn,
  }));
  return {
    ok: true,
    data: {
      signals,
      overall: context.overall?.status ?? null,
      imdRainfallMm: context.imdRainfallMm ?? null,
    },
  };
}

function guideCapture(args: Record<string, unknown>): SaathiToolResult {
  const angleId = String(args.angle || "").trim();
  const lang = String(args.lang || "en").trim().toLowerCase();
  const angle = CANONICAL_ANGLES.find((a) => a.id === angleId);
  if (!angle) {
    return { ok: false, error: `Unknown angle: ${angleId}` };
  }
  const hi = lang.startsWith("hi");
  return {
    ok: true,
    data: {
      id: angle.id,
      name: hi ? angle.nameHi : angle.name,
      instructions: hi ? angle.instructionsHi : angle.instructions,
      instructionsHi: angle.instructionsHi,
      tips: hi ? angle.tipsHi : angle.tips,
      tipsHi: angle.tipsHi,
    },
  };
}

async function classifyClaim(args: Record<string, unknown>): Promise<SaathiToolResult> {
  const text = String(args.text || "").trim();
  if (!text) {
    return { ok: false, error: "text is required for classify_claim" };
  }
  const lang = String(args.lang || "en").trim().slice(0, 8) || "en";
  const contextNotes =
    typeof args.contextNotes === "string" && args.contextNotes.trim()
      ? args.contextNotes.trim().slice(0, 2000)
      : undefined;
  const result = await classifyPerilWithLLM(text, lang, { contextNotes });
  return { ok: true, data: result };
}

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
