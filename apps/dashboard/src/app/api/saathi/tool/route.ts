import { NextResponse } from "next/server";
import { requireWebActor } from "@/lib/web-auth";
import { executeSaathiTool, type SaathiToolResult } from "@/lib/saathi/tools-server";
import { CANONICAL_ANGLES } from "@/lib/farmerI18n";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { SAATHI_SERVER_TOOLS, resolveSaathiToolName } from "@/lib/saathi/tool-catalog";

const ALLOWED_TOOLS = new Set<string>(SAATHI_SERVER_TOOLS);
const ANGLE_IDS = new Set(CANONICAL_ANGLES.map((a) => a.id));

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_BODY_CHARS = 64 * 1024;

function clampNumber(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function sanitizeLang(value: unknown): string {
  if (typeof value !== "string") return "en";
  return value.trim().slice(0, 8) || "en";
}

/** Returns sanitized args, or null when the args are invalid for this tool. */
function sanitizeArgs(name: string, raw: unknown): Record<string, unknown> | null {
  const args = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  switch (name) {
    case "request_evidence_angles": {
      return { peril: String(args.peril ?? "") };
    }
    case "call_context_signal": {
      const lat = clampNumber(args.lat, -90, 90);
      const lon = clampNumber(args.lon, -180, 180);
      if (lat == null || lon == null) return null;
      const out: Record<string, unknown> = { lat, lon, peril: String(args.peril ?? "") };
      if (typeof args.sowingDate === "string" && args.sowingDate.trim()) {
        out.sowingDate = args.sowingDate.trim().slice(0, 32);
      }
      const plotLat = clampNumber(args.plotLat, -90, 90);
      const plotLon = clampNumber(args.plotLon, -180, 180);
      if (plotLat != null) out.plotLat = plotLat;
      if (plotLon != null) out.plotLon = plotLon;
      return out;
    }
    case "classify_claim": {
      const text = typeof args.text === "string" ? args.text.trim().slice(0, 1000) : "";
      const peril = typeof args.peril === "string" ? args.peril.trim().slice(0, 64) : "";
      if (!text && !peril) return null;
      const out: Record<string, unknown> = { lang: sanitizeLang(args.lang) };
      if (text) out.text = text;
      if (peril) out.peril = peril;
      if (args.confidence != null && Number.isFinite(Number(args.confidence))) {
        out.confidence = Number(args.confidence);
      }
      if (typeof args.reasoning === "string" && args.reasoning.trim()) {
        out.reasoning = args.reasoning.trim().slice(0, 500);
      }
      if (typeof args.contextNotes === "string" && args.contextNotes.trim()) {
        out.contextNotes = args.contextNotes.trim().slice(0, 2000);
      }
      return out;
    }
    case "take_photo":
    case "capture_current_angle":
    case "switch_camera":
    case "submit_claim":
    case "prepare_submit_claim":
    case "check_evidence_quality": {
      return {};
    }
    case "select_angle":
    case "select_capture_angle":
    case "retake_angle":
    case "retake_capture_angle":
    case "guide_capture": {
      const angle = typeof args.angle === "string" ? args.angle.trim() : "";
      if (name === "guide_capture" && !ANGLE_IDS.has(angle)) return null;
      return {
        angle: ANGLE_IDS.has(angle) ? angle : "closeup_damage",
        lang: sanitizeLang(args.lang),
      };
    }
    case "set_observation":
    case "set_capture_observation": {
      const observation = typeof args.observation === "string" ? args.observation.trim().slice(0, 1000) : "";
      return { observation };
    }
    case "register_plot": {
      const plotName = String(args.name || args.plot_name || "").trim().slice(0, 80);
      if (!plotName) return null;
      return {
        name: plotName,
        crop_type: String(args.crop_type || args.crop || "wheat").trim().slice(0, 40),
      };
    }
    case "check_plot_geofence": {
      const out: Record<string, unknown> = {};
      const lat = clampNumber(args.lat, -90, 90);
      const lon = clampNumber(args.lon, -180, 180);
      if (lat != null) out.lat = lat;
      if (lon != null) out.lon = lon;
      const accuracyM = clampNumber(args.accuracy_m, 0, 100000);
      if (accuracyM != null) out.accuracy_m = accuracyM;
      if (typeof args.plot_id === "string" && args.plot_id.trim()) {
        out.plot_id = args.plot_id.trim().slice(0, 64);
      }
      return out;
    }
    case "fetch_agro_weather_alerts": {
      const out: Record<string, unknown> = {};
      const lat = clampNumber(args.lat, -90, 90);
      const lon = clampNumber(args.lon, -180, 180);
      if (lat != null) out.lat = lat;
      if (lon != null) out.lon = lon;
      if (typeof args.plot_id === "string" && args.plot_id.trim()) {
        out.plot_id = args.plot_id.trim().slice(0, 64);
      }
      if (typeof args.location === "string" && args.location.trim()) {
        out.location = args.location.trim().slice(0, 120);
      }
      return out;
    }
    case "explain_claim_audit": {
      const claimId = typeof args.claim_id === "string" ? args.claim_id.trim().slice(0, 64) : "";
      if (!claimId) return null;
      return { claim_id: claimId };
    }
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const auth = await requireWebActor(request);
  if (!auth.ok) return auth.response;

  const limit = checkRateLimit(`saathi-tool:${auth.actor.userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many Saathi tool requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_CHARS) {
    return NextResponse.json({ ok: false, error: "Request body too large" }, { status: 413 });
  }
  let payload: { name?: unknown; args?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) {
      return NextResponse.json({ ok: false, error: "Request body too large" }, { status: 413 });
    }
    payload = JSON.parse(raw) as { name?: unknown; args?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const rawName = typeof payload.name === "string" ? payload.name : "";
  const name = resolveSaathiToolName(rawName);
  if (!ALLOWED_TOOLS.has(rawName) && !ALLOWED_TOOLS.has(name)) {
    return NextResponse.json({ ok: false, error: `Unknown tool: ${rawName || "(none)"}` }, { status: 400 });
  }

  const args = sanitizeArgs(name, payload.args);
  if (args == null) {
    return NextResponse.json({ ok: false, error: `Invalid arguments for ${name}` }, { status: 400 });
  }

  try {
    const result: SaathiToolResult = await executeSaathiTool(name, args, { userId: auth.actor.userId });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    console.error("saathi tool execution failed:", name, err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Saathi tool failed. Please retry." }, { status: 500 });
  }
}
