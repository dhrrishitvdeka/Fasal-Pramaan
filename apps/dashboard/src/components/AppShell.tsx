"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Map,
  Settings,
  Shield,
  BarChart3,
  Sparkles,
  Camera,
  Home,
  Layers,
  Sprout,
  HelpCircle,
} from "lucide-react";
import { currentSessionRoles, loadStoredToken, logoutSession } from "@/lib/api";
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

const farmerNav = [
  { href: "/", key: "portalShowcase" as const, icon: Home },
  { href: "/farmer", label: "Farmer Dashboard", hiLabel: "किसान डैशबोर्ड", icon: Sprout },
  { href: "/farmer/capture", label: "File New Claim", hiLabel: "नया दावा दर्ज करें", icon: Camera },
  { href: "/farmer/claims", label: "My Claims", hiLabel: "मेरे दावे", icon: Layers },
  { href: "/farmer/reminders", label: "Timeline", hiLabel: "समय सीमा", icon: Sparkles },
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
            const isReviewer = sessionRoles.includes("reviewer") || sessionRoles.includes("administrator");
            if (isFarmerRoute && isReviewer) {
              // reviewers may use the farmer portal
            } else if (!isFarmerRoute && !isReviewer) {
              router.replace("/farmer");
            }
          } else {
            setRoles([]);
            setAuthenticated(false);
            router.replace(isFarmerRoute ? "/login?next=/farmer" : "/login");
          }
        }
      } catch {
        if (!cancelled) {
          setRoles([]);
          setAuthenticated(false);
          router.replace(isFarmerRoute ? "/login?next=/farmer" : "/login");
        }
      }
      if (!cancelled) setReady(true);
    }
    void verifySession();
    return () => {
      cancelled = true;
    };
  }, [pathname, isLandingRoute, isFarmerRoute, isLoginRoute, isUnlockRoute]);

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
    // Render full-width showcase layout with persistent Top Navigation Bar
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950">
        {/* Showcase Top Bar */}
        <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-emerald-400 to-teal-600 font-bold text-slate-950 shadow-sm">
                  FP
                </div>
                <div>
                  <div className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                    Fasal-Pramaan
                    <span className="text-xs font-normal text-emerald-400">फसल प्रमाण</span>
                  </div>
                  <div className="text-[11px] text-slate-400 hidden sm:block">
                    Autonomous Crop Evidence & Trust Architecture
                  </div>
                </div>
              </Link>
            </div>

            {/* Portal Switcher & Language Switcher */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Role Switcher Capsule */}
              <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900/90 p-0.5 text-xs font-medium">
                <Link
                  href="/farmer"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  <span>🌾</span>
                  <span className="hidden sm:inline">{lang === "hi" ? "किसान पोर्टल" : "Farmer Portal"}</span>
                  <span className="sm:hidden">{lang === "hi" ? "किसान" : "Farmer"}</span>
                </Link>
                <Link
                  href="/overview"
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  <span>🔍</span>
                  <span className="hidden sm:inline">{lang === "hi" ? "समीक्षक केंद्र" : "Reviewer Centre"}</span>
                  <span className="sm:hidden">{lang === "hi" ? "समीक्षक" : "Reviewer"}</span>
                </Link>
              </div>

              {/* Language Switcher */}
              <div className="flex rounded-md border border-slate-800 bg-slate-900 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setLang("en")}
                  className={clsx(
                    "rounded px-2.5 py-1 font-semibold transition",
                    lang === "en" ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"
                  )}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => setLang("hi")}
                  className={clsx(
                    "rounded px-2.5 py-1 font-semibold transition",
                    lang === "hi" ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"
                  )}
                >
                  हिंदी
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-slate-800 bg-slate-950 py-8 text-center text-xs text-slate-500">
          <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-left">
              <span className="font-semibold text-slate-300">Fasal-Pramaan (फसल प्रमाण)</span>
              <p className="text-[11px] text-slate-500 mt-0.5">Crop evidence capture and reviewer triage</p>
            </div>
            <div className="flex gap-4 text-xs">
              <Link href="/farmer" className="hover:text-emerald-400 transition">Farmer Portal</Link>
              <Link href="/overview" className="hover:text-emerald-400 transition">Reviewer Centre</Link>
              <Link href="/map" className="hover:text-emerald-400 transition">Submissions Map</Link>
              <Link href="/review" className="hover:text-emerald-400 transition">Review Queue</Link>
            </div>
          </div>
        </footer>
      </div>
    );
  }

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

  async function logout() {
    await logoutSession();
    router.push("/");
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Sidebar Rail */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        {/* Brand Banner */}
        <div className="border-b border-slate-200 px-4 py-4">
          <Link href="/" className="group flex items-center justify-between">
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-900 group-hover:text-emerald-700 transition">
                Fasal-Pramaan
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {isFarmerRoute
                  ? lang === "hi" ? "किसान स्व-सेवा पोर्टल" : "Farmer Web Portal"
                  : lang === "hi" ? "समीक्षक कमांड सेंटर" : "Reviewer Command Centre"}
              </div>
            </div>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {lang === "hi" ? "फसल प्रमाण" : "v2.4"}
            </span>
          </Link>
        </div>

        {/* Role Portal Switcher in Sidebar */}
        <div className="p-3 border-b border-slate-100">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1">
            {lang === "hi" ? "सक्रिय पोर्टल चयन" : "Active Role Portal"}
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-xs font-medium">
            <Link
              href="/farmer"
              className={clsx(
                "flex items-center justify-center gap-1.5 rounded-md py-1.5 transition",
                isFarmerRoute
                  ? "bg-emerald-700 text-white font-semibold shadow-xs"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              )}
            >
              <span>🌾</span>
              <span>{lang === "hi" ? "किसान" : "Farmer"}</span>
            </Link>
            <Link
              href="/overview"
              className={clsx(
                "flex items-center justify-center gap-1.5 rounded-md py-1.5 transition",
                !isFarmerRoute
                  ? "bg-slate-800 text-white font-semibold shadow-xs"
                  : "text-slate-600 hover:bg-white hover:text-slate-900"
              )}
            >
              <span>🔍</span>
              <span>{lang === "hi" ? "समीक्षक" : "Reviewer"}</span>
            </Link>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 space-y-0.5 p-2" aria-label="Main Navigation">
          {isFarmerRoute ? (
            farmerNav.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/farmer" ? pathname === "/farmer" : pathname.startsWith(item.href);
              const labelText = item.key ? t(item.key) : lang === "hi" ? item.hiLabel : item.label;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center gap-2.5 border-l-2 px-3 py-2 text-sm transition",
                    active
                      ? "border-emerald-600 bg-emerald-50/80 font-semibold text-emerald-950"
                      : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-75" aria-hidden strokeWidth={1.75} />
                  <span>{labelText}</span>
                </Link>
              );
            })
          ) : (
            reviewerNav
              .filter((item) => !item.adminOnly || roles.includes("administrator"))
              .map((item) => {
                const Icon = item.icon;
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-2.5 border-l-2 px-3 py-2 text-sm transition",
                      active
                        ? "border-slate-800 bg-slate-100 font-semibold text-slate-900"
                        : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden strokeWidth={1.75} />
                    <span>{t(item.key)}</span>
                  </Link>
                );
              })
          )}
        </nav>

        {/* Language switcher & Footer controls */}
        <div className="space-y-2 border-t border-slate-200 p-3">
          <div className="flex gap-1" role="group" aria-label="Language selection">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={clsx(
                "flex-1 border px-2 py-1 text-xs font-medium transition",
                lang === "en"
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang("hi")}
              className={clsx(
                "flex-1 border px-2 py-1 text-xs font-medium transition",
                lang === "hi"
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              हिंदी
            </button>
          </div>

          <Link
            href="/"
            className="flex w-full items-center justify-center gap-1.5 border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition"
          >
            <Home className="h-3.5 w-3.5" /> {lang === "hi" ? "होम" : "Home"}
          </Link>

          {!isFarmerRoute && (
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center justify-center gap-1.5 border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 transition"
            >
              <LogOut className="h-3.5 w-3.5" /> {t("logout")}
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
          <div className="flex items-center justify-between gap-4 px-6 py-3">
            <div>
              <h1 className="text-sm font-semibold text-slate-900">
                {isFarmerRoute
                  ? lang === "hi" ? "किसान प्रमाण पोर्टल (Fasal-Pramaan)" : "Farmer Self-Service Portal"
                  : t("appName")}
              </h1>
              <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-slate-500">
                {t("disclaimer")}
              </p>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
              {/* Quick portal toggle in header */}
              <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                <Link
                  href="/farmer"
                  className={clsx(
                    "px-2.5 py-1 rounded transition font-medium",
                    isFarmerRoute ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  🌾 {lang === "hi" ? "किसान" : "Farmer"}
                </Link>
                <Link
                  href="/overview"
                  className={clsx(
                    "px-2.5 py-1 rounded transition font-medium",
                    !isFarmerRoute ? "bg-slate-800 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  🔍 {lang === "hi" ? "समीक्षक" : "Reviewer"}
                </Link>
              </div>

              <div className="text-right text-xs text-slate-400 border-l border-slate-200 pl-3 hidden md:block">
                <div className="font-semibold text-slate-700">PMFBY</div>
                <div className="text-slate-500">Evidence portal</div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 px-6 py-5">{children}</div>
      </main>
    </div>
  );
}
