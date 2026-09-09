import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase";

export type CookieToSet = { name: string; value: string; options?: CookieOptions };

export const AUTH_COOKIE_BASE: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.VERCEL === "1" || process.env.NODE_ENV === "production",
};

export function parseCookieHeader(header: string | null): { name: string; value: string }[] {
  if (!header) return [];
  const out: { name: string; value: string }[] = [];
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out.push({ name, value: decodeURIComponent(value) });
    } catch {
      out.push({ name, value });
    }
  }
  return out;
}

export function applyAuthCookies(response: NextResponse, cookiesToSet: CookieToSet[]): void {
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, {
      ...options,
      ...AUTH_COOKIE_BASE,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }
}

/** Request-scoped user client. Session lives in cookies, never in localStorage. */
export function createAuthClientFromRequest(
  request: Request,
  onSet?: (cookies: CookieToSet[]) => void,
) {
  const url = supabaseUrl();
  const anon = supabaseAnonKey();
  if (!url || !anon) return null;
  const bag = parseCookieHeader(request.headers.get("cookie"));
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => bag,
      setAll: (cookiesToSet) => {
        onSet?.(cookiesToSet);
      },
    },
  });
}

/** Refresh the Auth cookies on every navigation (token rotation). */
export async function refreshAuthCookies(request: NextRequest, response: NextResponse): Promise<NextResponse> {
  const url = supabaseUrl();
  const anon = supabaseAnonKey();
  if (!url || !anon) return response;

  let out = response;
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        const next = NextResponse.next({ request });
        out.headers.forEach((value, key) => {
          if (key.toLowerCase() === "set-cookie") return;
          next.headers.set(key, value);
        });
        applyAuthCookies(next, cookiesToSet);
        out.cookies.getAll().forEach((cookie) => {
          if (!cookiesToSet.some((item) => item.name === cookie.name)) {
            next.cookies.set(cookie.name, cookie.value);
          }
        });
        out = next;
      },
    },
  });
  try {
    await supabase.auth.getUser();
  } catch {
    // refresh is best-effort; invalid cookies fall through as signed-out
  }
  return out;
}

export function clientIp(request: Request): string {
  // Prefer the platform-owned header. Client-supplied X-Forwarded-For is last resort.
  const vercel = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

function originFromEnv(raw: string): string | null {
  const value = raw.trim().replace(/\/$/, "");
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Canonical public origin for auth email redirects. Never trust
 * X-Forwarded-Host — that is password-reset poisoning.
 */
export function publicOrigin(request: Request): string {
  const configured =
    originFromEnv(process.env.APP_ORIGIN || "") ||
    originFromEnv(process.env.NEXT_PUBLIC_SITE_URL || "");
  if (configured) return configured;
  const vercelProd = originFromEnv(process.env.VERCEL_PROJECT_PRODUCTION_URL || "");
  if (vercelProd) return vercelProd;
  const vercelUrl = originFromEnv(process.env.VERCEL_URL || "");
  if (vercelUrl) return vercelUrl;
  const hostRaw = (request.headers.get("host") || "localhost:3000").split(",")[0].trim();
  const host = /^[a-zA-Z0-9.-]+(?::\d+)?$/.test(hostRaw) ? hostRaw : "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${proto}://${host}`;
}
