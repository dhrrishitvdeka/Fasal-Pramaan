import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "./supabase";

export type WebRole = "farmer" | "reviewer" | "administrator";

export type WebActor = {
  userId: string;
  email: string | null;
  role: WebRole;
};

export function reviewerEmailAllowlist(): Set<string> {
  return new Set(
    (process.env.REVIEWER_EMAILS || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function asRoleList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

export function resolveWebRole(input: {
  email?: string | null;
  appRoles?: unknown;
  profileRole?: string | null;
}): WebRole {
  const listed = [
    ...asRoleList(input.appRoles),
    String(input.profileRole || "")
      .trim()
      .toLowerCase(),
  ];
  if (listed.some((role) => role === "administrator" || role === "admin")) {
    return "administrator";
  }
  if (listed.some((role) => role === "reviewer")) {
    return "reviewer";
  }
  const email = (input.email || "").trim().toLowerCase();
  if (email && reviewerEmailAllowlist().has(email)) {
    return "reviewer";
  }
  return "farmer";
}

export function isReviewerRole(role: WebRole): boolean {
  return role === "reviewer" || role === "administrator";
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function requireWebActor(
  request: Request,
): Promise<{ ok: true; actor: WebActor } | { ok: false; response: NextResponse }> {
  const token = bearerToken(request);
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Supabase is not configured" }, { status: 503 }),
    };
  }
  const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, response: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };
  }
  const user = data.user;
  const server = createServerSupabase();
  let profileRole: string | null = null;
  let hasProfile = false;
  if (server) {
    const existing = await server.from("web_profiles").select("role").eq("id", user.id).maybeSingle();
    profileRole = existing.data?.role ? String(existing.data.role) : null;
    hasProfile = Boolean(existing.data);
  }
  const role = resolveWebRole({
    email: user.email,
    appRoles: user.app_metadata?.roles,
    profileRole,
  });
  if (server && !hasProfile) {
    await server.from("web_profiles").upsert(
      {
        id: user.id,
        email: user.email || null,
        role,
        full_name: user.user_metadata?.full_name || user.email || null,
      },
      { onConflict: "id" },
    );
  }
  return {
    ok: true,
    actor: {
      userId: user.id,
      email: user.email || null,
      role,
    },
  };
}

export function actorUnauthorized(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}
