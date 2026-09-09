import { NextResponse, type NextRequest } from "next/server";
import { refreshAuthCookies } from "@/lib/auth-cookies";
import { safeInternalPath } from "@/lib/safe-path";
import {
  SITE_LOCK_COOKIE,
  isSiteLockActive,
  isValidSiteLockToken,
} from "@/lib/site-lock";

const AUTH_GATED_PREFIXES = [
  "/farmer",
  "/review",
  "/overview",
  "/map",
  "/alerts",
  "/admin",
  "/audit",
  "/health",
];

function isAuthGatedPath(pathname: string): boolean {
  return AUTH_GATED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(
    (cookie) => Boolean(cookie.value) && cookie.name.includes("-auth-token"),
  );
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/unlock" || pathname === "/api/unlock") {
    return NextResponse.next();
  }
  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  if (pathname !== "/api/auth/callback") {
    response = await refreshAuthCookies(request, response);
  }

  if (isSiteLockActive()) {
    const token = request.cookies.get(SITE_LOCK_COOKIE)?.value;
    if (!(await isValidSiteLockToken(token))) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Site locked" }, { status: 401 });
      }
      const unlock = request.nextUrl.clone();
      unlock.pathname = "/unlock";
      unlock.search = "";
      const next = safeInternalPath(pathname + request.nextUrl.search, "");
      if (next && next !== "/" && next !== "/unlock") {
        unlock.searchParams.set("next", next);
      }
      return NextResponse.redirect(unlock);
    }
  }

  if (isAuthGatedPath(pathname) && !pathname.startsWith("/api/") && !hasAuthCookie(request)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    const next = safeInternalPath(pathname + request.nextUrl.search, pathname.startsWith("/farmer") ? "/farmer" : "/overview");
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
