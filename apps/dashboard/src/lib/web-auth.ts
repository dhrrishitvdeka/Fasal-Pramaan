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
  emailConfirmed?: boolean;
  appRoles?: unknown;
  profileRole?: string | null;
}): WebRole {
  // Only server-set app_metadata can grant administrator: web_profiles is
  // potentially client-writable, so a profile "administrator" value must never
  // self-promote (it caps at reviewer).
  const appRoles = asRoleList(input.appRoles);
  if (appRoles.some((role) => role === "administrator" || role === "admin")) {
    return "administrator";
  }
  const profileRole = String(input.profileRole || "")
    .trim()
    .toLowerCase();
  if (appRoles.includes("reviewer") || profileRole === "reviewer" || profileRole === "admin" || profileRole === "administrator") {
    return "reviewer";
  }
  // The email allowlist only counts for verified addresses: otherwise anyone
  // could register a listed email on an unverified account and inherit review.
  const email = (input.email || "").trim().toLowerCase();
  if (email && input.emailConfirmed && reviewerEmailAllowlist().has(email)) {
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
  // Intercept demo tokens ONLY in automated tests when explicitly enabled.
  // In production and live environments, authentication strictly requires Supabase user JWTs.
  const allowDemoTokens =
    process.env.NODE_ENV === "test" && process.env.ALLOW_DEMO_TOKENS === "true";
  if (
    allowDemoTokens &&
    (token.startsWith("demo-") ||
      token === "demo" ||
      token === "test-token" ||
      token.startsWith("demo-jwt-"))
  ) {
    const isReviewer =
      token.includes("reviewer") ||
      token.includes("admin") ||
      request.headers.get("x-demo-role") === "reviewer";
    return {
      ok: true,
      actor: {
        userId: isReviewer ? "demo-reviewer-id" : "demo-farmer-id",
        email: isReviewer ? "reviewer@fasalpramaan.local" : "demo@fasalpramaan.local",
        role: isReviewer ? "reviewer" : "farmer",
      },
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
    emailConfirmed: Boolean(user.email_confirmed_at),
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
