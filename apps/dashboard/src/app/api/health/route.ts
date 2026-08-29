import { NextResponse } from "next/server";
import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { getHfModelId, getHfSpaceId, getHfSpaceUrl } from "@/lib/hf-model";

export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = performance.now();
  const services: Record<string, any> = {};

  // 1. Next.js Web Application Server
  services.app_server = {
    id: "app_server",
    name: "Next.js Edge & App Gateway",
    category: "Core Gateway",
    status: "healthy",
    ok: true,
    latencyMs: Math.round(performance.now() - t0),
    runtime: "Node.js (Next.js 16 App Router)",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime ? process.uptime() : 0),
  };

  // 2. Supabase Cloud Postgres & Storage
  const supabaseConfigured = isSupabaseConfigured();
  if (supabaseConfigured) {
    const sStart = performance.now();
    try {
      const client = createServerSupabase();
      if (!client) {
        services.supabase = {
          id: "supabase",
          name: "Supabase Cloud Database",
          category: "Storage & Persistence",
          status: "misconfigured",
          ok: false,
          error: "SUPABASE_SERVICE_ROLE_KEY missing",
          latencyMs: Math.round(performance.now() - sStart),
        };
      } else {
        const { error, count } = await client.from("web_claims").select("id", { count: "exact", head: true });
        const latencyMs = Math.round(performance.now() - sStart);
        if (error) {
          services.supabase = {
            id: "supabase",
            name: "Supabase Cloud Database",
            category: "Storage & Persistence",
            status: "degraded",
            ok: false,
            error: error.message,
            latencyMs,
          };
        } else {
          services.supabase = {
            id: "supabase",
            name: "Supabase Cloud Database",
            category: "Storage & Persistence",
            status: "healthy",
            ok: true,
            latencyMs,
            details: `${count ?? 0} claims indexed`,
          };
        }
      }
    } catch (err) {
      services.supabase = {
        id: "supabase",
        name: "Supabase Cloud Database",
        category: "Storage & Persistence",
        status: "unreachable",
        ok: false,
        error: err instanceof Error ? err.message : "Connection failed",
        latencyMs: Math.round(performance.now() - sStart),
      };
    }
  } else {
    services.supabase = {
      id: "supabase",
      name: "Supabase Cloud Database",
      category: "Storage & Persistence",
      status: "unconfigured",
      ok: false,
      note: "Local demo state active without Supabase credentials",
      latencyMs: 0,
    };
  }

  // 3. Hugging Face Space ML Inference (DINOv2 / Crop Classifier)
  const spaceUrl = getHfSpaceUrl();
  if (spaceUrl) {
    const hfStart = performance.now();
    try {
      const resp = await fetch(`${spaceUrl}/gradio_api/call/health`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [] }),
        signal: AbortSignal.timeout(6000),
      });
      const latencyMs = Math.round(performance.now() - hfStart);
      services.huggingface_space = {
        id: "huggingface_space",
        name: "Hugging Face ML Inference Space",
        category: "Computer Vision Models",
        modelId: getHfModelId(),
        spaceId: getHfSpaceId(),
        spaceUrl,
        status: resp.ok ? "healthy" : resp.status === 503 ? "cold_sleeping" : "degraded",
        ok: resp.ok,
        httpStatus: resp.status,
        latencyMs,
        details: resp.ok ? "DINOv2 & Crop Classifier ready" : `Status: HTTP ${resp.status}`,
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - hfStart);
      services.huggingface_space = {
        id: "huggingface_space",
        name: "Hugging Face ML Inference Space",
        category: "Computer Vision Models",
        modelId: getHfModelId(),
        spaceId: getHfSpaceId(),
        spaceUrl,
        status: "unreachable",
        ok: false,
        error: err instanceof Error ? err.message : "Probe timeout",
        latencyMs,
        details: "Space is waking up or unreachable",
      };
    }
  } else {
    services.huggingface_space = {
      id: "huggingface_space",
      name: "Hugging Face ML Inference Space",
      category: "Computer Vision Models",
      status: "unconfigured",
      ok: false,
      note: "HF_SPACE_URL unconfigured",
      latencyMs: 0,
    };
  }

  // 4. Google Gemini Live Multimodal AI — key present ≠ a live round-trip
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    services.gemini_ai = {
      id: "gemini_ai",
      name: "Google Gemini Live Voice & Vision Gate",
      category: "Multimodal AI & Voice",
      status: "healthy",
      ok: true,
      provider: "Google AI",
      details: "API key present — Live voice and vision gate enabled (not live-probed)",
    };
  } else {
    services.gemini_ai = {
      id: "gemini_ai",
      name: "Google Gemini Live Voice & Vision Gate",
      category: "Multimodal AI & Voice",
      status: "unconfigured",
      ok: false,
      note: "GEMINI_API_KEY not configured (heuristic vision gate; no spoken Live session)",
      latencyMs: 0,
    };
  }

  // 5. Agro-Meteorological Weather Gateway (IMD / Open-Meteo)
  const wStart = performance.now();
  try {
    const wResp = await fetch("https://api.open-meteo.com/v1/forecast?latitude=28.61&longitude=77.20&current=temperature_2m", {
      signal: AbortSignal.timeout(4000),
    });
    const latencyMs = Math.round(performance.now() - wStart);
    services.weather_gateway = {
      id: "weather_gateway",
      name: "Agro-Meteorological Telemetry (IMD)",
      category: "Environmental Data",
      status: wResp.ok ? "healthy" : "degraded",
      ok: wResp.ok,
      latencyMs,
      details: wResp.ok ? "Live weather & rainfall telemetry active" : "Service degraded",
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - wStart);
    services.weather_gateway = {
      id: "weather_gateway",
      name: "Agro-Meteorological Telemetry (IMD)",
      category: "Environmental Data",
      status: "degraded",
      ok: false,
      error: err instanceof Error ? err.message : "Timeout",
      latencyMs,
    };
  }

  // 6. Copernicus Sentinel-2 & ISRO Bhuvan — token presence only, not a live NDVI probe
  const sentinelToken = process.env.SENTINEL_TOKEN || process.env.COPERNICUS_TOKEN;
  if (sentinelToken) {
    services.satellite_engine = {
      id: "satellite_engine",
      name: "Sentinel-2 & ISRO Bhuvan Engine",
      category: "Earth Observation",
      status: "healthy",
      ok: true,
      details: "SENTINEL_TOKEN present — fire claims request Sentinel-2 NDVI burn-scar (not live-probed here)",
    };
  } else {
    services.satellite_engine = {
      id: "satellite_engine",
      name: "Sentinel-2 & ISRO Bhuvan Engine",
      category: "Earth Observation",
      status: "unconfigured",
      ok: false,
      note: "No SENTINEL_TOKEN — fire claims use an Open-Meteo extreme-heat proxy, not live NDVI",
      latencyMs: 0,
    };
  }

  const isCoreOk = services.app_server.ok && (services.supabase.ok || !supabaseConfigured);
  const overallStatus = isCoreOk
    ? services.huggingface_space.ok && services.gemini_ai.ok ? "healthy" : "degraded"
    : "critical";

  return NextResponse.json({
    ok: isCoreOk,
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalDurationMs: Math.round(performance.now() - t0),
    checks: services,
  });
}
