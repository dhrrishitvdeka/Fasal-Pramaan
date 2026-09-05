import { NextResponse, type NextRequest } from "next/server";
import {
  SITE_LOCK_COOKIE,
  isSiteLockActive,
  isValidSiteLockToken,
} from "@/lib/site-lock";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/unlock" || pathname === "/api/unlock") {
    return NextResponse.next();
  }
  // Liveness probes and API clients must never get an HTML redirect:
  // Docker HEALTHCHECK hits /api/health and would restart-loop under lock.
  if (pathname === "/api/health") {
    return NextResponse.next();
  }
  if (!isSiteLockActive()) {
    return NextResponse.next();
  }
  const token = request.cookies.get(SITE_LOCK_COOKIE)?.value;
  if (await isValidSiteLockToken(token)) {
    return NextResponse.next();
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
