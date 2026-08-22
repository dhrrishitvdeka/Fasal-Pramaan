"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, FileText, Calendar, Sprout } from "lucide-react";
import { FarmerProvider, useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import { useOnlineStatus } from "@/lib/use-online-status";
import FasalSaathiOverlay from "@/components/FasalSaathiOverlay";
import OfflineBanner from "@/components/offline-banner";
import { LanguageSelect } from "@/components/LanguageSelect";
import clsx from "clsx";

function FarmerLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { lang, setLang, farmerProfile, claims, newRecaptureNotices } = useFarmerData();
  const t = getFarmerT(lang);
  const isOnline = useOnlineStatus();

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
      label: lang === "hi" ? "साथी" : "Saathi",
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
      <div className="border-b border-[var(--line)] bg-[var(--ink)] px-3 py-1 text-[11px] text-[var(--surface)] sm:px-4 sm:text-xs">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          <span className="min-w-0 truncate">
            {t.pmfbyBanner}
          </span>
          <div className="flex shrink-0 items-center gap-2 opacity-80 sm:gap-3">
            <span>{isOnline ? t.onlineNotice : t.offlineNotice}</span>
            <Link
              href="/login?next=/overview"
              className="hidden underline-offset-2 hover:underline sm:inline"
            >
              {t.reviewerSignIn}
            </Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-md shadow-2xs">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-2.5 md:px-6">
          <Link href="/farmer" className="flex shrink-0 items-center gap-1.5 min-w-max">
            <span className="text-sm font-semibold tracking-tight text-[var(--ink)] sm:text-base">
              Fasal-Pramaan
            </span>
            <span className="hidden text-xs text-[var(--ink-muted)] xl:inline">
              · {t.farmerPortalLabel}
            </span>
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
                    <span
                      className={clsx(
                        "relative fp-badge-alert",
                        item.dot &&
                          "ring-2 ring-amber-300 ring-offset-1",
                      )}
                    >
                      {item.badge}
                      {item.dot ? (
                        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                      ) : null}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="fp-ui flex shrink-0 items-center gap-2">
            <Link href="/farmer/help" className="hidden text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] sm:inline">
              {t.help}
            </Link>
            <Link href="/farmer/profile" className="hidden max-w-[10rem] truncate text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] lg:block">
              {lang === "hi" ? farmerProfile.nameHi || farmerProfile.name : farmerProfile.name}
            </Link>
            <LanguageSelect value={lang} onChange={setLang} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 md:px-6 md:pb-8 md:pt-5">
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
