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
} from "lucide-react";
import { api, loadStoredToken, logoutSession } from "@/lib/api";
import { Lang, t } from "@/lib/i18n";
import clsx from "clsx";

const nav = [
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
  const [lang, setLang] = useState<Lang>("en");
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function verifySession() {
      const token = loadStoredToken();
      if (!token && pathname !== "/login") {
        router.replace("/login");
        return;
      }
      if (pathname === "/login") {
        setReady(true);
        return;
      }
      try {
        const response = await api.get<{ roles: string[] }>("/auth/me");
        const allowed = response.data.roles.some(
          (role) => role === "reviewer" || role === "administrator"
        );
        if (!allowed) throw new Error("dashboard role required");
        if (!cancelled) setRoles(response.data.roles);
      } catch {
        await logoutSession();
        router.replace("/login");
        return;
      }
      if (!cancelled) setReady(true);
    }
    void verifySession();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Loading…
      </div>
    );
  }

  async function logout() {
    await logoutSession();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Narrow monochrome rail */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <div className="text-sm font-semibold tracking-tight text-slate-900">FasalPramaan</div>
          <div className="mt-0.5 text-xs text-slate-500">Command Centre</div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2" aria-label="Main">
          {nav.filter((item) => !item.adminOnly || roles.includes("administrator")).map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-2.5 border-l-2 px-3 py-2 text-sm",
                  active
                    ? "border-slate-800 bg-slate-100 font-medium text-slate-900"
                    : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-70" aria-hidden strokeWidth={1.5} />
                {t(lang, item.key)}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-slate-200 p-3">
          <div className="flex gap-1" role="group" aria-label="Language">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={clsx(
                "flex-1 border px-2 py-1 text-xs",
                lang === "en"
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-300 bg-white text-slate-700"
              )}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang("hi")}
              className={clsx(
                "flex-1 border px-2 py-1 text-xs",
                lang === "hi"
                  ? "border-slate-800 bg-slate-800 text-white"
                  : "border-slate-300 bg-white text-slate-700"
              )}
            >
              हिं
            </button>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} /> {t(lang, "logout")}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-4 px-6 py-3">
            <div>
              <h1 className="text-sm font-semibold text-slate-900">{t(lang, "appName")}</h1>
              <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-slate-500">
                {t(lang, "disclaimer")}
              </p>
            </div>
            <div className="shrink-0 text-right text-xs text-slate-400">
              <div>Official use</div>
              <div className="text-slate-500">Authorised personnel</div>
            </div>
          </div>
        </header>
        <div className="flex-1 px-6 py-5">{children}</div>
      </main>
    </div>
  );
}
