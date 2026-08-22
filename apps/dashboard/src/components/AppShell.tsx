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
import { GitHubStarsBadge } from "@/components/GitHubStarsBadge";
import clsx from "clsx";

type ReviewerNavItem = {
  href: string;
  key: DictKey;
  icon: typeof Home;
  adminOnly?: boolean;
};

const reviewerNavGroups: Array<{ label: string; items: ReviewerNavItem[] }> = [
  {
    label: "Cases",
    items: [
      { href: "/review", key: "review", icon: ClipboardList },
      { href: "/overview", key: "overview", icon: LayoutDashboard },
      { href: "/alerts", key: "alerts", icon: AlertTriangle },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/analytics", key: "analytics", icon: BarChart3 },
      { href: "/map", key: "map", icon: Map },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/audit", key: "audit", icon: Shield, adminOnly: true },
      { href: "/admin", key: "admin", icon: Settings, adminOnly: true },
      { href: "/health", key: "health", icon: Activity },
    ],
  },
];

function navLinkClasses(active: boolean): string {
  return clsx(
    "flex items-center justify-center gap-2.5 border-l px-3 py-2.5 text-sm md:py-2 lg:justify-start",
    active
      ? "border-[var(--ink)] bg-[var(--ink)] font-medium text-[var(--surface)]"
      : "border-transparent text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]",
  );
}

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
            {t("portalReviewer")}
          </div>
        </Link>
      </div>

      <div className="border-b border-[var(--line)] p-3">
        <div className="fp-kicker mb-2">{t("portalKicker")}</div>
        <div className="fp-ui grid grid-cols-2 text-xs">
          <Link
            href="/farmer"
            onClick={onNavigate}
            className="border border-[var(--line)] px-2 py-1.5 text-center text-[var(--ink)] hover:bg-[var(--accent-soft)]"
          >
            {t("farmerShort")}
          </Link>
          <Link
            href="/overview"
            onClick={onNavigate}
            className="-ml-px border border-[var(--ink)] bg-[var(--ink)] px-2 py-1.5 text-center text-[var(--surface)]"
          >
            {t("reviewerShort")}
          </Link>
        </div>
      </div>

      <nav className="fp-ui flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main Navigation">
        <Link
          href="/"
          onClick={onNavigate}
          title={t("portalShowcase")}
          aria-label={t("portalShowcase")}
          aria-current={pathname === "/" ? "page" : undefined}
          className={navLinkClasses(pathname === "/")}
        >
          <Home className="h-4 w-4 shrink-0 opacity-70" aria-hidden strokeWidth={1.5} />
          <span aria-hidden className="hidden lg:inline">{t("portalShowcase")}</span>
        </Link>

        {reviewerNavGroups.map((group) => {
          const items = group.items.filter(
            (item) => !item.adminOnly || roles.includes("administrator"),
          );
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="pt-3">
              <div className="fp-kicker mb-1 hidden px-3 text-[10px] lg:block">{group.label}</div>
              {items.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    title={t(item.key)}
                    aria-label={t(item.key)}
                    aria-current={active ? "page" : undefined}
                    className={navLinkClasses(active)}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden strokeWidth={1.5} />
                    <span aria-hidden className="hidden lg:inline">{t(item.key)}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="fp-ui space-y-2 border-t border-[var(--line)] p-3">
        <GitHubStarsBadge className="w-full justify-center" />
        <LanguageSelect value={lang} onChange={setLang} className="w-full max-w-none" />
        <Link href="/" onClick={onNavigate} className="fp-btn-secondary w-full text-xs">
          {t("portalShowcase")}
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
  // Public legal pages: no session gate, plain self-contained layout.
  const isPublicLegalRoute = pathname === "/privacy" || pathname === "/terms";

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
      if (isLandingRoute || isPublicLegalRoute) {
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
  }, [pathname, isLandingRoute, isFarmerRoute, isLoginRoute, isUnlockRoute, isPublicLegalRoute, router]);

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

  if (isLandingRoute || isPublicLegalRoute) {
    return (
      <div className="flex min-h-screen flex-col bg-[var(--canvas)] text-[var(--ink)]">
        <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-md shadow-2xs">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-3.5">
            <Link
              href="/"
              className="flex shrink-0 items-center gap-1 text-sm font-semibold tracking-tight text-[var(--ink)] sm:gap-1.5 sm:text-base"
            >
              <span>Fasal-Pramaan</span>
              <span className="hidden text-xs font-normal text-[var(--ink-muted)] sm:inline">· फसल प्रमाण</span>
            </Link>
            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/farmer"
                className="fp-ui rounded px-2 py-1 text-xs font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)] sm:px-2.5 sm:text-sm"
              >
                {t("farmerShort")}
              </Link>
              <Link
                href="/overview"
                className="fp-ui rounded px-2 py-1 text-xs font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--canvas)] hover:text-[var(--ink)] sm:px-2.5 sm:text-sm"
              >
                {t("reviewerShort")}
              </Link>
              <GitHubStarsBadge />
              <LanguageSelect value={lang} onChange={setLang} />
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-[var(--line)] px-5 py-6 text-xs text-[var(--ink-muted)]">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:justify-between">
            <span>Fasal-Pramaan</span>
            <span>{t("evidenceTriage")}</span>
          </div>
          <div className="mx-auto mt-2 flex max-w-5xl gap-4">
            <Link href="/privacy" className="text-xs text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="text-xs text-[var(--ink-muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline">
              Terms
            </Link>
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
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 md:hidden">
          <button
            type="button"
            className="p-2 text-[var(--ink)]"
            aria-label="Open menu"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <GitHubStarsBadge />
        </header>
        <div className="min-w-0 flex-1 px-3 py-3 sm:px-4 md:px-6 md:py-5">{children}</div>
      </main>
    </div>
  );
}
