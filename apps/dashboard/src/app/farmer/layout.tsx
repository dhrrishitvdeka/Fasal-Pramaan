"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, FileText, Calendar } from "lucide-react";
import { FarmerProvider, useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import FasalSaathiOverlay from "@/components/FasalSaathiOverlay";
import { LanguageSelect } from "@/components/LanguageSelect";
import clsx from "clsx";

function FarmerLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { lang, setLang, farmerProfile, claims } = useFarmerData();
  const t = getFarmerT(lang);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const pendingRecaptures = claims.filter((c) => c.status === "needs_recapture").length;

  const navItems = [
    {
      href: "/farmer",
      exact: true,
      label: t.home,
      icon: Home,
    },
    {
      href: "/farmer/capture",
      label: t.newClaim,
      icon: Camera,
      highlight: true,
    },
    {
      href: "/farmer/claims",
      label: t.claims,
      icon: FileText,
      badge: pendingRecaptures > 0 ? pendingRecaptures : undefined,
    },
    {
      href: "/farmer/reminders",
      label: t.reminders,
      icon: Calendar,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas)] text-[var(--ink)]">
      <div className="border-b border-[var(--line)] bg-[var(--ink)] px-3 py-1 text-[11px] text-[var(--surface)] sm:px-4 sm:text-xs">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          <span className="min-w-0 truncate">
            {lang === "hi" ? "प्रधानमंत्री फसल बीमा योजना" : "PMFBY · Digital evidence"}
          </span>
          <div className="flex shrink-0 items-center gap-2 opacity-80 sm:gap-3">
            <span>{isOnline ? t.onlineNotice : t.offlineNotice}</span>
            <Link
              href="/login?next=/overview"
              className="hidden underline-offset-2 hover:underline sm:inline"
            >
              {lang === "hi" ? "समीक्षक प्रवेश" : "Reviewer sign in"}
            </Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5 md:px-6">
          <Link href="/farmer" className="min-w-0">
            <div className="truncate text-sm tracking-tight text-[var(--ink)]">
              Fasal-Pramaan
              <span className="ml-1.5 hidden text-[var(--ink-muted)] sm:ml-2 sm:inline">
                {lang === "hi" ? "किसान पोर्टल" : "Farmer portal"}
              </span>
            </div>
            <p className="hidden text-xs text-[var(--ink-muted)] md:block">{t.tagline}</p>
          </Link>

          <nav className="fp-ui hidden items-center gap-1 md:flex">
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
                    "relative flex items-center gap-2 px-3 py-1.5 text-sm",
                    item.highlight
                      ? "bg-[var(--ink)] text-[var(--surface)]"
                      : isActive
                        ? "border border-[var(--line)] bg-[var(--accent-soft)] text-[var(--ink)]"
                        : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {item.badge ? (
                    <span className="fp-badge-alert">{item.badge}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="fp-ui flex shrink-0 items-center gap-2">
            <LanguageSelect value={lang} onChange={setLang} />
            <div className="hidden max-w-[10rem] truncate text-xs text-[var(--ink-muted)] lg:block">
              {lang === "hi" ? farmerProfile.nameHi : farmerProfile.name}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 md:px-6 md:pb-8 md:pt-5">
        {children}
      </main>

      <nav
        className="fp-ui fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-[var(--line)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Farmer navigation"
      >
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
                "relative flex min-h-12 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] leading-tight",
                isActive ? "text-[var(--ink)]" : "text-[var(--ink-muted)]",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate px-1">{item.label}</span>
              {item.badge ? (
                <span className="absolute right-2 top-1 fp-badge-alert">{item.badge}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <FasalSaathiOverlay />

      <footer className="hidden border-t border-[var(--line)] px-4 py-5 text-xs text-[var(--ink-muted)] md:block">
        <div className="mx-auto flex max-w-5xl justify-between gap-2">
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
      <FarmerLayoutContent>{children}</FarmerLayoutContent>
    </FarmerProvider>
  );
}
