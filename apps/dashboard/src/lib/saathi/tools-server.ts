import { assembleContext } from "@/lib/context/assemble";
import { normalizePeril, routeForPeril } from "@/lib/claim-routing";
import { CANONICAL_ANGLES, LEGACY_CANONICAL_ANGLES } from "@/lib/farmerI18n";
import { getLocalizedAngleInfo } from "@/lib/help-i18n";
import { classifyPerilWithLLM } from "@/lib/saathi/classify-server";
import { createServerSupabase } from "@/lib/supabase";
import { resolveSaathiToolName } from "@/lib/saathi/tool-catalog";

export type SaathiToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

export type SaathiToolContext = {
  /** Authenticated farmer id — used to scope plot/claim lookups. */
  userId: string;
};

/**
 * Server-side Fasal Saathi tool dispatcher.
 * Mirrors SAATHI_FUNCTION_DECLARATIONS in saathi-agent.ts; classify_claim runs
 * the LLM here (server-side) so GEMINI_API_KEY never reaches the browser.
 */
export async function executeSaathiTool(
  name: string,
  args: Record<string, unknown>,
  context: SaathiToolContext,
): Promise<SaathiToolResult> {
  try {
    switch (resolveSaathiToolName(name)) {
      case "request_evidence_angles":
        return requestEvidenceAngles(args);
      case "call_context_signal":
        return callContextSignal(args);
      case "guide_capture":
        return guideCapture(args);
      case "classify_claim":
        return classifyClaim(args);
      case "capture_current_angle":
      case "take_photo":
        return {
          ok: true,
          data: { action: "capture_current_angle", message: "Dispatched camera shutter capture command to active studio." },
        };
      case "switch_camera":
        return {
          ok: true,
          data: { action: "switch_camera", message: "Dispatched camera flip command to active studio." },
        };
      case "select_capture_angle":
      case "select_angle":
        return {
          ok: true,
          data: { action: "select_capture_angle", angle: args.angle, message: `Switched active angle to ${args.angle}.` },
        };
      case "retake_capture_angle":
      case "retake_angle":
        return {
          ok: true,
          data: { action: "retake_capture_angle", angle: args.angle, message: `Cleared ${args.angle} for recapture.` },
        };
      case "set_capture_observation":
      case "set_observation":
        return {
          ok: true,
          data: { action: "set_capture_observation", observation: args.observation, message: "Observation saved to draft." },
        };
      case "prepare_submit_claim":
      case "submit_claim":
        return {
          ok: true,
          data: { action: "prepare_submit_claim", message: "Claim submit is ready — confirm in the app." },
        };
      case "register_plot":
      case "create_plot":
        return registerPlotServer(args, context);
      case "check_plot_geofence":
        return checkPlotGeofence(args, context);
      case "fetch_agro_weather_alerts":
        return fetchAgroWeatherAlerts(args, context);
      case "explain_claim_audit":
        return explainClaimAudit(args, context);
      case "check_evidence_quality":
        return {
          ok: true,
          data: {
            action: "check_evidence_quality",
            message: "Open the camera studio — live crop quality is measured on the viewfinder.",
          },
        };
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[saathi-tool] ${name} threw:`, msg);
    return { ok: false, error: msg };
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
      message: `${cfg.labelEn}: ${cfg.requiredAngles.length} required angles (${cfg.requiredAngles.join(", ")}).`,
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
  const lang = String(args.lang || "hi").trim().toLowerCase();
  const hi = !lang.startsWith("en");
  const canonical = CANONICAL_ANGLES.find((a) => a.id === angleId);
  if (canonical) {
    return {
      ok: true,
      data: {
        id: canonical.id,
        name: hi ? canonical.nameHi : canonical.name,
        instructions: hi ? canonical.instructionsHi : canonical.instructions,
        instructionsHi: canonical.instructionsHi,
        tips: hi ? canonical.tipsHi : canonical.tips,
        tipsHi: canonical.tipsHi,
      },
    };
  }
  if (LEGACY_CANONICAL_ANGLES.includes(angleId)) {
    const info = getLocalizedAngleInfo(angleId, hi ? "hi" : "en");
    return {
      ok: true,
      data: {
        id: angleId,
        name: info.name,
        instructions: info.instructions,
        instructionsHi: info.instructions,
        tips: info.tips,
        tipsHi: info.tips,
      },
    };
  }
  return { ok: false, error: `Unknown angle: ${angleId}` };
}

async function classifyClaim(args: Record<string, unknown>): Promise<SaathiToolResult> {
  const text = String(args.text || "").trim();
  if (!text) {
    if (args.peril) {
      return {
        ok: true,
        data: {
          peril: normalizePeril(args.peril),
          // Suggestion only — do not rubber-stamp a model-chosen peril with no farmer words.
          confidence: Math.min(0.35, Number.isFinite(Number(args.confidence)) ? Number(args.confidence) : 0.35),
          reasoning: "No farmer text provided; peril is a model suggestion, not a confirmed classification.",
        },
      };
    }
    return { ok: false, error: "text is required for classify_claim" };
  }
  const lang = String(args.lang || "hi").trim().slice(0, 8) || "hi";
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

type PlotLocationRow = {
  id: string;
  name: string;
  khasra_number: string | null;
  crop_type: string | null;
  lat: number | null;
  lon: number | null;
  village: string | null;
  district: string | null;
};

async function listFarmerPlots(userId: string): Promise<PlotLocationRow[]> {
  const client = createServerSupabase();
  if (!client) return [];
  const { data, error } = await client
    .from("web_plots")
    .select("id, name, khasra_number, crop_type, lat, lon, village, district")
    .eq("created_by", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as PlotLocationRow[];
}

function pickPlot(plots: PlotLocationRow[], plotId: unknown): PlotLocationRow | null {
  const raw = String(plotId || "").trim().toLowerCase();
  if (raw) {
    const exact = plots.find((p) => p.id.toLowerCase() === raw);
    if (exact) return exact;
    const prefixed = plots.filter((p) => p.id.toLowerCase().startsWith(raw));
    if (prefixed.length === 1) return prefixed[0];
  }
  return plots[0] ?? null;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const GEOFENCE_RADIUS_M = 500;

async function checkPlotGeofence(
  args: Record<string, unknown>,
  context: SaathiToolContext,
): Promise<SaathiToolResult> {
  const plots = await listFarmerPlots(context.userId);
  const plot = pickPlot(plots, args.plot_id);
  if (!plot) {
    return {
      ok: true,
      data: {
        action: "check_plot_geofence",
        geofence_status: "no_plot",
        message: "No registered plot found to verify against. You can register a plot or file without one.",
      },
    };
  }
  const lat = toFiniteNumber(args.lat);
  const lon = toFiniteNumber(args.lon);
  if (lat == null || lon == null || plot.lat == null || plot.lon == null) {
    return {
      ok: true,
      data: {
        action: "check_plot_geofence",
        plot_id: plot.id,
        plot_name: plot.name,
        geofence_status: "no_position",
        plot_lat: plot.lat,
        plot_lon: plot.lon,
        message: `Registered plot '${plot.name}' is stored at (${plot.lat ?? "?"}, ${plot.lon ?? "?"}). No current GPS position was available, so a boundary check could not run.`,
      },
    };
  }
  const distanceM = Math.round(haversineMeters(lat, lon, plot.lat, plot.lon));
  const accuracyM = toFiniteNumber(args.accuracy_m) ?? 0;
  const inside = distanceM <= Math.max(accuracyM, GEOFENCE_RADIUS_M);
  return {
    ok: true,
    data: {
      action: "check_plot_geofence",
      plot_id: plot.id,
      plot_name: plot.name,
      village: plot.village,
      khasra: plot.khasra_number,
      geofence_status: inside ? "verified_inside" : "outside",
      distance_m: distanceM,
      radius_m: Math.max(accuracyM, GEOFENCE_RADIUS_M),
      message: inside
        ? `Position is ${distanceM} m from the centre of plot '${plot.name}' — within the ${Math.max(accuracyM, GEOFENCE_RADIUS_M)} m parcel radius.`
        : `Position is ${distanceM} m from plot '${plot.name}' — outside the ${Math.max(accuracyM, GEOFENCE_RADIUS_M)} m parcel radius.`,
    },
  };
}

async function fetchAgroWeatherAlerts(
  args: Record<string, unknown>,
  context: SaathiToolContext,
): Promise<SaathiToolResult> {
  let lat = toFiniteNumber(args.lat);
  let lon = toFiniteNumber(args.lon);
  let location = "local area";
  if (lat == null || lon == null) {
    const plots = await listFarmerPlots(context.userId);
    const plot = pickPlot(plots, args.plot_id);
    if (plot?.lat != null && plot?.lon != null) {
      lat = plot.lat;
      lon = plot.lon;
      location = plot.village || plot.district || plot.name;
    }
  } else {
    location = typeof args.location === "string" && args.location.trim() ? args.location.trim() : location;
  }
  if (lat == null || lon == null) {
    return { ok: false, error: "No coordinates available — register a plot or provide lat/lon." };
  }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&past_days=3&forecast_days=1&daily=precipitation_sum,temperature_2m_max,wind_gust_10m_max&timezone=auto";
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`open-meteo returned ${res.status}`);
  const json = (await res.json()) as {
    daily?: {
      time?: string[];
      precipitation_sum?: Array<number | null>;
      temperature_2m_max?: Array<number | null>;
      wind_gust_10m_max?: Array<number | null>;
    };
  };
  const daily = json.daily || {};
  const precip = (daily.precipitation_sum || []).filter((v): v is number => typeof v === "number");
  const temps = (daily.temperature_2m_max || []).filter((v): v is number => typeof v === "number");
  const gusts = (daily.wind_gust_10m_max || []).filter((v): v is number => typeof v === "number");
  const precip72 = Math.round(precip.slice(-3).reduce((sum, v) => sum + v, 0) * 10) / 10;
  const tempMax = temps.length ? temps[temps.length - 1] : null;
  const gustMax = gusts.length ? Math.round(Math.max(...gusts)) : null;
  const alerts: string[] = [];
  if (precip72 >= 60) alerts.push("heavy rainfall");
  else if (precip72 >= 10) alerts.push("moderate rainfall");
  if (tempMax != null && tempMax >= 38) alerts.push("heat stress");
  if (gustMax != null && gustMax >= 60) alerts.push("high wind");
  return {
    ok: true,
    data: {
      action: "fetch_agro_weather_alerts",
      location,
      precipitation_72h_mm: precip72,
      temp_max_celsius: tempMax,
      wind_gust_max_kmh: gustMax,
      alerts,
      source: "open-meteo",
      message: alerts.length
        ? `72-hour precipitation ${precip72} mm for ${location}; alerts: ${alerts.join(", ")}.`
        : `72-hour precipitation ${precip72} mm for ${location}; no destructive weather alerts.`,
    },
  };
}

async function explainClaimAudit(
  args: Record<string, unknown>,
  context: SaathiToolContext,
): Promise<SaathiToolResult> {
  const claimId = String(args.claim_id || "").trim();
  if (!claimId) return { ok: false, error: "claim_id is required for explain_claim_audit" };
  const client = createServerSupabase();
  if (!client) return { ok: false, error: "Supabase is not configured" };
  const { data: claim, error } = await client
    .from("web_claims")
    .select(
      "id, status, gate_result, context_signals, integrity_score, overall_confidence, severity_grade, model_confidence, model_id, recapture_reason, missing_angles",
    )
    .eq("id", claimId)
    .eq("created_by", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!claim) return { ok: false, error: "No claim found with that id." };

  const gate = claim.gate_result as { gateFailed?: boolean; usable?: boolean } | null;
  const stage1 = gate
    ? gate.gateFailed
      ? "failed"
      : "passed"
    : "pending";
  const stage2 = claim.severity_grade || (claim.model_confidence != null && claim.model_id)
    ? "verified"
    : "pending";
  const stage3 = claim.context_signals ? "completed" : "pending";
  const overall =
    typeof claim.overall_confidence === "number" ? Math.round(claim.overall_confidence * 10) / 10 : null;
  const stages = [stage1, stage2, stage3];
  const message =
    claim.status === "needs_recapture"
      ? `Claim ${claim.id} needs recapture for missing angle(s): ${(claim.missing_angles || []).join(", ") || "unspecified"}. Reason: ${claim.recapture_reason || "Angle clarity needed"}.`
      : `Claim ${claim.id}: Stage 1 Vision Gate ${stage1}, Stage 2 Gemini analysis ${stage2}, Stage 3 satellite cross-check ${stage3}. Overall confidence ${overall == null ? "pending" : `${overall}%`}.`;
  return {
    ok: true,
    data: {
      action: "explain_claim_audit",
      claim_id: claim.id,
      status: claim.status,
      stage_1_gate: stage1,
      stage_2_gemini_analysis: stage2,
      stage_3_sentinel_crosscheck: stage3,
      all_stages_complete: stages.every((s) => s !== "pending" && s !== "failed"),
      integrity_score: claim.integrity_score ?? null,
      overall_confidence: overall,
      recapture_reason: claim.recapture_reason ?? null,
      missing_angles: claim.missing_angles || [],
      message,
    },
  };
}

async function registerPlotServer(
  args: Record<string, unknown>,
  context: SaathiToolContext,
): Promise<SaathiToolResult> {
  const client = createServerSupabase();
  if (!client) return { ok: false, error: "Supabase is not configured" };
  const name = String(args.name || args.plot_name || "Farm Plot").trim();
  const cropType = String(args.crop_type || args.crop || "wheat").trim().toLowerCase();
  const khasra = args.khasra_number ? String(args.khasra_number).trim() : "";
  const area = args.area_hectares ? Number(args.area_hectares) : 1.0;
  const village = args.village ? String(args.village).trim() : "";
  const plotId = `plot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const row = {
    id: plotId,
    name,
    name_hi: name,
    khasra_number: khasra,
    area_hectares: Number.isFinite(area) && area > 0 ? Number(area.toFixed(4)) : 1.0,
    crop_type: cropType,
    crop_type_hi: cropType,
    current_stage: "Sowing",
    current_stage_hi: "बुवाई",
    sowing_date: new Date().toISOString().split("T")[0],
    village,
    created_by: context.userId,
  };
  const { error } = await client.from("web_plots").insert(row);
  if (error) {
    return { ok: false, error: error.message };
  }
  return {
    ok: true,
    data: {
      action: "register_plot",
      plot_id: plotId,
      name,
      crop_type: cropType,
      khasra_number: khasra,
      message: `Plot '${name}' with ${cropType} successfully registered in database.`,
    },
  };
}
