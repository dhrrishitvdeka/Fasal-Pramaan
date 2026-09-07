import { NextResponse, type NextRequest } from "next/server";
import { refreshAuthCookies } from "@/lib/auth-cookies";
import {
  SITE_LOCK_COOKIE,
  isSiteLockActive,
  isValidSiteLockToken,
} from "@/lib/site-lock";

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

  if (!isSiteLockActive()) {
    return response;
  }
  const token = request.cookies.get(SITE_LOCK_COOKIE)?.value;
  if (await isValidSiteLockToken(token)) {
    return response;
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Site locked" }, { status: 401 });
  }
  const unlock = request.nextUrl.clone();
  unlock.pathname = "/unlock";
  unlock.search = "";
  const next = pathname + request.nextUrl.search;
  if (next && next !== "/" && next !== "/unlock") {
    unlock.searchParams.set("next", next);
  }
  return NextResponse.redirect(unlock);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)"],
};
