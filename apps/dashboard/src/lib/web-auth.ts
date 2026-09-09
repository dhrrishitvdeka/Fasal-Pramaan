import { NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import { createAuthClientFromRequest } from "./auth-cookies";
import { createServerSupabase, supabaseAnonKey, supabaseUrl } from "./supabase";

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
  // web_profiles.role is display-only. Authorisation comes from server-set
  // app_metadata and the verified REVIEWER_EMAILS allowlist so a stale
  // profile row cannot keep reviewer access after revocation.
  if (appRoles.includes("reviewer")) {
    return "reviewer";
  }
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

async function userFromBearer(request: Request): Promise<User | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const url = supabaseUrl();
  const anon = supabaseAnonKey();
  if (!url || !anon) return null;
  const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function userFromCookies(request: Request): Promise<User | null> {
  const authClient = createAuthClientFromRequest(request);
  if (!authClient) return null;
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function actorFromUser(user: User): Promise<WebActor> {
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
  if (server && (!hasProfile || profileRole !== role)) {
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
    userId: user.id,
    email: user.email || null,
    role,
  };
}

export async function requireWebActor(
  request: Request,
): Promise<{ ok: true; actor: WebActor } | { ok: false; response: NextResponse }> {
  const token = bearerToken(request);
  // Intercept demo tokens ONLY in automated tests when explicitly enabled.
  // In production and live environments, authentication strictly requires Supabase user JWTs.
  const allowDemoTokens =
    process.env.NODE_ENV === "test" && process.env.ALLOW_DEMO_TOKENS === "true";
  if (
    allowDemoTokens &&
    token &&
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

  const url = supabaseUrl();
  const anon = supabaseAnonKey();
  if (!url || !anon) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Supabase is not configured" }, { status: 503 }),
    };
  }

  const user = (await userFromCookies(request)) || (await userFromBearer(request));
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  }
  return { ok: true, actor: await actorFromUser(user) };
}

export function actorUnauthorized(message = "Forbidden"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}
