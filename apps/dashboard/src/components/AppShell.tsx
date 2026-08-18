"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  LayoutDashboard,
  Map,
  Settings,
  Shield,
  BarChart3,
  Home,
} from "lucide-react";
import { currentSessionRoles, loadStoredToken, logoutSession } from "@/lib/api";
import { canAccessReviewerPortal, reviewerLoginHref } from "@/lib/review-access";
import { useLanguage } from "@/lib/LanguageContext";
import clsx from "clsx";

const reviewerNav = [
  { href: "/", key: "portalShowcase" as const, icon: Home },
  { href: "/overview", key: "overview" as const, icon: LayoutDashboard },
  { href: "/map", key: "map" as const, icon: Map },
  { href: "/review", key: "review" as const, icon: ClipboardList },
  { href: "/analytics", key: "analytics" as const, icon: BarChart3 },
  { href: "/alerts", key: "alerts" as const, icon: AlertTriangle },
  { href: "/admin", key: "admin" as const, icon: Settings, adminOnly: true },
  { href: "/health", key: "health" as const, icon: Activity },
  { href: "/audit", key: "audit" as const, icon: Shield, adminOnly: true },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [authenticated, setAuthenticated] = useState(false);

  const isFarmerRoute = pathname.startsWith("/farmer");
  const isLandingRoute = pathname === "/";
  const isLoginRoute = pathname === "/login";
  const isUnlockRoute = pathname === "/unlock";

  useEffect(() => {
    let cancelled = false;
    async function verifySession() {
      if (isLoginRoute || isUnlockRoute) {
        if (!cancelled) setReady(true);
        return;
      }
      if (isLandingRoute) {
        if (!cancelled) setReady(true);
        return;
      }

      loadStoredToken();
      try {
        const sessionRoles = await currentSessionRoles();
        if (!cancelled) {
          if (sessionRoles) {
            setRoles(sessionRoles);
            setAuthenticated(true);
            const isReviewer = canAccessReviewerPortal(sessionRoles);
            if (!isFarmerRoute && !isReviewer) {
              router.replace(reviewerLoginHref(pathname));
            }
          } else {
            setRoles([]);
            setAuthenticated(false);
            router.replace(isFarmerRoute ? "/login?next=/farmer" : reviewerLoginHref(pathname));
          }
        }
      } catch {
        if (!cancelled) {
          setRoles([]);
          setAuthenticated(false);
          router.replace(isFarmerRoute ? "/login?next=/farmer" : reviewerLoginHref(pathname));
        }
      }
      if (!cancelled) setReady(true);
    }
    void verifySession();
    return () => {
      cancelled = true;
    };
  }, [pathname, isLandingRoute, isFarmerRoute, isLoginRoute, isUnlockRoute, router]);

  if (isLoginRoute || isUnlockRoute) {
    return <>{children}</>;
  }

  if (isFarmerRoute) {
    if (!ready) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
          Loading…
        </div>
      );
    }
    if (!authenticated) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
          Redirecting to sign in…
        </div>
      );
    }
    return <>{children}</>;
  }

  if (isLandingRoute) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--canvas)] text-[var(--ink)]">
        <header className="border-b border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
            <Link href="/" className="text-sm tracking-tight text-[var(--ink)]">
              Fasal-Pramaan
              <span className="ml-2 text-[var(--ink-muted)]">फसल प्रमाण</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/farmer" className="fp-ui text-sm text-[var(--ink)] hover:underline">
                {lang === "hi" ? "किसान" : "Farmer"}
              </Link>
              <Link href="/overview" className="fp-ui text-sm text-[var(--ink)] hover:underline">
                {lang === "hi" ? "समीक्षक" : "Reviewer"}
              </Link>
              <div className="fp-ui flex text-xs">
                <button
                  type="button"
                  onClick={() => setLang("en")}
                  className={clsx(
                    "border border-[var(--line)] px-2 py-1",
                    lang === "en" ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface)] text-[var(--ink)]",
                  )}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLang("hi")}
                  className={clsx(
                    "-ml-px border border-[var(--line)] px-2 py-1",
                    lang === "hi" ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface)] text-[var(--ink)]",
                  )}
                >
                  हि
                </button>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[var(--line)] px-5 py-6 text-xs text-[var(--ink-muted)]">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:justify-between">
            <span>Fasal-Pramaan</span>
            <span>{lang === "hi" ? "साक्ष्य कैप्चर और समीक्षक जाँच" : "Evidence capture and reviewer triage"}</span>
          </div>
        </footer>
      </div>
    );
  }

  const isReviewer = canAccessReviewerPortal(roles);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Loading…
      </div>
    );
  }

  if (!authenticated || !isReviewer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Redirecting to reviewer sign in…
      </div>
    );
  }

  async function logout() {
    await logoutSession();
    router.push("/");
  }

  return (
    <div className="flex min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)]">
        <div className="border-b border-[var(--line)] px-4 py-4">
          <Link href="/" className="block">
            <div className="text-sm tracking-tight text-[var(--ink)]">Fasal-Pramaan</div>
            <div className="mt-0.5 text-xs text-[var(--ink-muted)]">
              {lang === "hi" ? "समीक्षक केंद्र" : "Reviewer centre"}
            </div>
          </Link>
        </div>

        <div className="border-b border-[var(--line)] p-3">
          <div className="fp-kicker mb-2">{lang === "hi" ? "पोर्टल" : "Portal"}</div>
          <div className="fp-ui grid grid-cols-2 text-xs">
            <Link
              href="/farmer"
              className="border border-[var(--line)] px-2 py-1.5 text-center text-[var(--ink)] hover:bg-[var(--accent-soft)]"
            >
              {lang === "hi" ? "किसान" : "Farmer"}
            </Link>
            <Link
              href="/overview"
              className="-ml-px border border-[var(--ink)] bg-[var(--ink)] px-2 py-1.5 text-center text-[var(--surface)]"
            >
              {lang === "hi" ? "समीक्षक" : "Reviewer"}
            </Link>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="fp-ui flex-1 space-y-0.5 p-2" aria-label="Main Navigation">
          {reviewerNav
            .filter((item) => !item.adminOnly || roles.includes("administrator"))
            .map((item) => {
              const Icon = item.icon;
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-2.5 border-l px-3 py-2 text-sm",
                    active
                      ? "border-[var(--ink)] bg-[var(--accent-soft)] font-medium text-[var(--ink)]"
                      : "border-transparent text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden strokeWidth={1.5} />
                  <span>{t(item.key)}</span>
                </Link>
              );
            })}
        </nav>

        <div className="fp-ui space-y-2 border-t border-[var(--line)] p-3">
          <div className="flex" role="group" aria-label="Language selection">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={clsx(
                "flex-1 border border-[var(--line)] px-2 py-1 text-xs",
                lang === "en" ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface)] text-[var(--ink)]",
              )}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang("hi")}
              className={clsx(
                "-ml-px flex-1 border border-[var(--line)] px-2 py-1 text-xs",
                lang === "hi" ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface)] text-[var(--ink)]",
              )}
            >
              हिंदी
            </button>
          </div>
          <Link href="/" className="fp-btn-secondary w-full text-xs">
            {lang === "hi" ? "होम" : "Home"}
          </Link>
          <button type="button" onClick={logout} className="fp-btn-secondary w-full text-xs">
            {t("logout")}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--line)] bg-[var(--surface)]">
          <div className="px-6 py-3">
            <h1 className="fp-ui text-sm font-semibold text-[var(--ink)]">{t("appName")}</h1>
            <p className="mt-0.5 max-w-3xl text-xs text-[var(--ink-muted)]">{t("disclaimer")}</p>
          </div>
        </header>
        <div className="flex-1 px-6 py-5">{children}</div>
      </main>
    </div>
  );
}
