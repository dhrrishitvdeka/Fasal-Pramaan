"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, FileText, Calendar, Sprout, HelpCircle } from "lucide-react";
import { FarmerProvider, useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import FasalSaathiOverlay from "@/components/FasalSaathiOverlay";
import OfflineBanner from "@/components/offline-banner";
import { SaathiSessionProvider } from "@/lib/saathi/session-provider";
import { LanguageSelect } from "@/components/LanguageSelect";
import { getFarmerNavLabel } from "@/lib/name-sanitizer";
import clsx from "clsx";

function FarmerLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { lang, setLang, farmerProfile, claims, newRecaptureNotices } = useFarmerData();
  const t = getFarmerT(lang);

  const pendingRecaptures = claims.filter((c) => c.status === "needs_recapture").length;
  const hasNewRecaptureNotices = newRecaptureNotices.length > 0;

  const navItems = [
    {
      href: "/farmer",
      exact: true,
      label: t.home,
      icon: Home,
    },
    {
      href: "/farmer/saathi",
      label: t.saathiNav,
      icon: Sprout,
      highlight: true,
    },
    {
      href: "/farmer/capture",
      label: t.newClaim,
      icon: Camera,
    },
    {
      href: "/farmer/claims",
      label: t.claims,
      icon: FileText,
      badge: pendingRecaptures > 0 ? pendingRecaptures : undefined,
      dot: hasNewRecaptureNotices,
    },
    {
      href: "/farmer/reminders",
      label: t.reminders,
      icon: Calendar,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas)] text-[var(--ink)]">
      <OfflineBanner />
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-md shadow-2xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
          {/* Brand Logo */}
          <Link href="/farmer" className="flex shrink-0 items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ink)] text-white shadow-xs transition-transform group-hover:scale-105">
              <Sprout className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight text-[var(--ink)] sm:text-base">
                  Fasal-Pramaan
                </span>
              </div>
            </div>
          </Link>

          {/* Segmented Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 rounded-xl border border-slate-200/90 bg-slate-100/80 p-1 shadow-2xs">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "relative flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-150 select-none",
                    isActive
                      ? "bg-[var(--ink)] text-white shadow-xs"
                      : item.highlight
                        ? "text-emerald-800 hover:bg-emerald-100/70"
                        : "text-slate-600 hover:bg-white/90 hover:text-slate-900",
                  )}
                >
                  <Icon className={clsx("h-3.5 w-3.5 shrink-0", isActive ? "text-white" : item.highlight ? "text-emerald-600" : "text-slate-500")} />
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span
                      className={clsx(
                        "ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                        isActive ? "bg-amber-400 text-slate-900" : "bg-red-500 text-white animate-pulse",
                      )}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* User Profile & Actions */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="/farmer/help"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 shadow-2xs transition-colors hover:bg-slate-100 hover:text-slate-900 sm:px-2.5"
              title={t.help}
              aria-label={t.help}
            >
              <HelpCircle className="h-4 w-4 text-slate-500" />
              <span className="hidden lg:inline">{t.help}</span>
            </Link>

            {(() => {
              const navLabel = getFarmerNavLabel(farmerProfile, lang);
              return (
                <Link
                  href="/farmer/profile"
                  className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs max-w-[13rem]"
                  title={navLabel.name}
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    {navLabel.initial}
                  </div>
                  <span className="truncate">{navLabel.name}</span>
                </Link>
              );
            })()}

            <LanguageSelect value={lang} onChange={setLang} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 sm:px-6 lg:px-8 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-4 md:pb-10 md:pt-6">
        {children}
      </main>

      <nav
        className="fp-ui fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--line)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Farmer navigation"
      >
        <div className="grid grid-cols-5 gap-0.5 px-1 pt-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                aria-label={
                  item.highlight && lang === "hi" ? `${item.label} — AI सहायक` : undefined
                }
                className={clsx(
                  "relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[10px] leading-tight transition-colors",
                  isActive
                    ? "bg-[var(--ink)] text-[var(--surface)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                )}
              >
                <span className="relative inline-flex">
                  <Icon className="h-4 w-4" />
                  {item.highlight ? (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-[var(--surface)]"
                    />
                  ) : null}
                </span>
                <span className="max-w-full truncate px-0.5">{item.label}</span>
                {item.badge ? (
                  <span
                    className={clsx(
                      "absolute right-1 top-1 fp-badge-alert",
                      isActive && "bg-amber-400 text-slate-900 ring-2 ring-[var(--surface)]",
                      !isActive && item.dot && "ring-2 ring-amber-300 ring-offset-1",
                    )}
                  >
                    {item.badge}
                    {item.dot && !isActive ? (
                      <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                    ) : null}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>

      <FasalSaathiOverlay />

      <footer className="hidden border-t border-[var(--line)] px-4 py-5 text-xs text-[var(--ink-muted)] md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
          <span>Fasal-Pramaan</span>
          <span>
            {lang === "hi"
              ? "तस्वीरें SHA-256 और GPS से जुड़ी हैं"
              : "Photographs carry SHA-256 and GPS when available"}
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function FarmerLayout({ children }: { children: React.ReactNode }) {
  return (
    <FarmerProvider>
      <SaathiSessionProvider>
        <FarmerLayoutContent>{children}</FarmerLayoutContent>
      </SaathiSessionProvider>
    </FarmerProvider>
  );
}
