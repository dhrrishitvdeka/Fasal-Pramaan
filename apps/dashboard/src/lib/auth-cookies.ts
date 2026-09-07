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
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function publicOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}
