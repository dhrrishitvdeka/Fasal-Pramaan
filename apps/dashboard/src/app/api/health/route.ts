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
        if (error) console.error("health: supabase probe failed:", error.message);
        supabase = error ? { ok: false, error: "unavailable" } : { ok: true };
      }
    } catch (error) {
      console.error("health: supabase probe threw:", error instanceof Error ? error.message : error);
      supabase = { ok: false, error: "unavailable" };
    }
  }

  const spaceUrl = getHfSpaceUrl();
  let space: { ok: boolean; error?: string } = { ok: false };
  try {
    const response = await fetch(`${spaceUrl}/gradio_api/call/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [] }),
      signal: AbortSignal.timeout(5000),
    });
    space = {
      ok: response.ok,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    console.error("health: space probe failed:", error instanceof Error ? error.message : error);
    space = { ok: false, error: "probe failed" };
  }

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const status =
    supabase.ok && (space.ok || !spaceUrl)
      ? "ok"
      : supabaseConfigured
        ? "degraded"
        : "not_configured";

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
      gemini: { configured: geminiConfigured },
    },
  });
}
