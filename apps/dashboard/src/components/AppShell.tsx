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
  Menu,
  X,
} from "lucide-react";
import { currentSessionRoles, loadStoredToken, logoutSession } from "@/lib/api";
import { canAccessReviewerPortal, reviewerLoginHref } from "@/lib/review-access";
import { useLanguage } from "@/lib/LanguageContext";
import type { DictKey, Lang } from "@/lib/i18n";
import { LanguageSelect } from "@/components/LanguageSelect";
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

function ReviewerNav({
  pathname,
  roles,
  lang,
  setLang,
  t,
  onNavigate,
  onLogout,
}: {
  pathname: string;
  roles: string[];
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: DictKey) => string;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <div className="border-b border-[var(--line)] px-4 py-3">
        <Link href="/" onClick={onNavigate} className="block">
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
            onClick={onNavigate}
            className="border border-[var(--line)] px-2 py-1.5 text-center text-[var(--ink)] hover:bg-[var(--accent-soft)]"
          >
            {lang === "hi" ? "किसान" : "Farmer"}
          </Link>
          <Link
            href="/overview"
            onClick={onNavigate}
            className="-ml-px border border-[var(--ink)] bg-[var(--ink)] px-2 py-1.5 text-center text-[var(--surface)]"
          >
            {lang === "hi" ? "समीक्षक" : "Reviewer"}
          </Link>
        </div>
      </div>

      <nav className="fp-ui flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main Navigation">
        {reviewerNav
          .filter((item) => !item.adminOnly || roles.includes("administrator"))
          .map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={clsx(
                  "flex items-center gap-2.5 border-l px-3 py-2.5 text-sm md:py-2",
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
        <LanguageSelect value={lang} onChange={setLang} className="w-full max-w-none" />
        <Link href="/" onClick={onNavigate} className="fp-btn-secondary w-full text-xs">
          {lang === "hi" ? "होम" : "Home"}
        </Link>
        <button type="button" onClick={onLogout} className="fp-btn-secondary w-full text-xs">
          {t("logout")}
        </button>
      </div>
    </>
  );
}

function GateScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 text-sm text-[var(--ink-muted)]">
      {children}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const isFarmerRoute = pathname.startsWith("/farmer");
  const isLandingRoute = pathname === "/";
  const isLoginRoute = pathname === "/login";
  const isUnlockRoute = pathname === "/unlock";

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

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
      return <GateScreen>Loading…</GateScreen>;
    }
    if (!authenticated) {
      return <GateScreen>Redirecting to sign in…</GateScreen>;
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
              <LanguageSelect value={lang} onChange={setLang} />
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
    return <GateScreen>Loading…</GateScreen>;
  }

  if (!authenticated || !isReviewer) {
    return <GateScreen>Redirecting to reviewer sign in…</GateScreen>;
  }

  async function logout() {
    await logoutSession();
    router.push("/");
  }

  return (
    <div className="flex min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface)] md:flex">
        <ReviewerNav
          pathname={pathname}
          roles={roles}
          lang={lang}
          setLang={setLang}
          t={t}
          onLogout={logout}
        />
      </aside>

      {navOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--ink)]/40"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          />
          <aside className="relative flex h-full w-[min(18rem,86vw)] flex-col bg-[var(--surface)] shadow-lg">
            <div className="flex items-center justify-end border-b border-[var(--line)] px-2 py-1">
              <button
                type="button"
                className="p-2 text-[var(--ink)]"
                aria-label="Close menu"
                onClick={() => setNavOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ReviewerNav
              pathname={pathname}
              roles={roles}
              lang={lang}
              setLang={setLang}
              t={t}
              onNavigate={() => setNavOpen(false)}
              onLogout={logout}
            />
          </aside>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)] md:hidden">
          <div className="flex items-center gap-1 px-2 py-1.5">
            <button
              type="button"
              className="p-2 text-[var(--ink)]"
              aria-label="Open menu"
              onClick={() => setNavOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="min-w-0 flex-1 px-3 py-3 sm:px-4 md:px-6 md:py-5">{children}</div>
      </main>
    </div>
  );
}
