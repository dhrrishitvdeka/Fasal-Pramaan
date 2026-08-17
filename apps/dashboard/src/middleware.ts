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
  if (!isSiteLockActive()) {
    return NextResponse.next();
  }
  const token = request.cookies.get(SITE_LOCK_COOKIE)?.value;
  if (await isValidSiteLockToken(token)) {
    return NextResponse.next();
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
