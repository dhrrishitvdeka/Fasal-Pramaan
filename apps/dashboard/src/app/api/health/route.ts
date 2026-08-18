import { NextResponse } from "next/server";
import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { getHfModelId, getHfSpaceId, getHfSpaceUrl } from "@/lib/hf-model";

export async function GET() {
  const supabaseConfigured = isSupabaseConfigured();
  let supabase: { ok: boolean; error?: string } = { ok: false };
  if (supabaseConfigured) {
    try {
      const client = createServerSupabase();
      if (!client) {
        supabase = { ok: false, error: "service role key missing" };
      } else {
        const { error } = await client.from("web_claims").select("id").limit(1);
        supabase = error ? { ok: false, error: error.message } : { ok: true };
      }
    } catch (error) {
      supabase = { ok: false, error: error instanceof Error ? error.message : "supabase probe failed" };
    }
  }

  const spaceUrl = getHfSpaceUrl();
  let space: { ok: boolean; error?: string; payload?: unknown } = { ok: false };
  try {
    const response = await fetch(`${spaceUrl}/gradio_api/call/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [] }),
    });
    space = {
      ok: response.ok,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    space = { ok: false, error: error instanceof Error ? error.message : "space probe failed" };
  }

  const dockerApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  let dockerApi: { ok: boolean; error?: string; payload?: unknown } | null = null;
  if (dockerApiBase && dockerApiBase !== "/backend") {
    try {
      const response = await fetch(`${dockerApiBase.replace(/\/$/, "")}/health`);
      dockerApi = {
        ok: response.ok,
        payload: await response.json().catch(() => null),
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      dockerApi = { ok: false, error: error instanceof Error ? error.message : "docker api unreachable" };
    }
  }

  const status =
    supabase.ok && (space.ok || !spaceUrl)
      ? "ok"
      : supabaseConfigured
        ? "degraded"
        : "local_only";

  return NextResponse.json({
    ok: status === "ok" || status === "degraded",
    status,
    mode: supabaseConfigured ? "hosted" : "no_supabase",
    checks: {
      next: { ok: true },
      supabase,
      huggingface_space: {
        ...space,
        model_id: getHfModelId(),
        space_id: getHfSpaceId(),
        space_url: spaceUrl,
      },
      voice: {
        configured: Boolean(process.env.GEMINI_API_KEY) && process.env.VOICE_ASSISTANT_ENABLED !== "false",
      },
      docker_api: dockerApi,
    },
  });
}
