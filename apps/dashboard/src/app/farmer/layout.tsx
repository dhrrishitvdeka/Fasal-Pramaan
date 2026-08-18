"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, FileText, Calendar, Menu, X } from "lucide-react";
import { FarmerProvider, useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import FasalSaathiOverlay from "@/components/FasalSaathiOverlay";
import clsx from "clsx";

function FarmerLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { lang, setLang, farmerProfile, claims } = useFarmerData();
  const t = getFarmerT(lang);
  const [isOnline, setIsOnline] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      <div className="border-b border-[var(--line)] bg-[var(--ink)] px-4 py-1.5 text-xs text-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span>
            {lang === "hi"
              ? "प्रधानमंत्री फसल बीमा योजना · डिजिटल साक्ष्य"
              : "Pradhan Mantri Fasal Bima Yojana · Digital evidence"}
          </span>
          <div className="flex items-center gap-3 text-[11px] opacity-80">
            <span>{isOnline ? t.onlineNotice : t.offlineNotice}</span>
            <Link href="/login?next=/overview" className="underline-offset-2 hover:underline">
              {lang === "hi" ? "समीक्षक प्रवेश" : "Reviewer sign in"}
            </Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/farmer" className="min-w-0">
            <div className="text-sm tracking-tight text-[var(--ink)]">
              Fasal-Pramaan
              <span className="ml-2 text-[var(--ink-muted)]">
                {lang === "hi" ? "किसान पोर्टल" : "Farmer portal"}
              </span>
            </div>
            <p className="hidden text-xs text-[var(--ink-muted)] sm:block">{t.tagline}</p>
          </Link>

          {/* Desktop Navigation Links */}
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

          <div className="fp-ui flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang(lang === "en" ? "hi" : "en")}
              className="fp-btn-secondary px-2.5 py-1.5 text-xs"
              aria-label="Toggle language"
            >
              {lang === "en" ? "हिन्दी" : "English"}
            </button>
            <div className="hidden text-xs text-[var(--ink-muted)] lg:block">
              {lang === "hi" ? farmerProfile.nameHi : farmerProfile.name}
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-[var(--ink)] md:hidden"
              aria-label="Open menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="fp-ui space-y-1 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3 md:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={clsx(
                    "flex items-center justify-between px-2 py-2 text-sm",
                    isActive ? "bg-[var(--accent-soft)]" : "",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  {item.badge ? <span className="fp-badge-alert">{item.badge}</span> : null}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-6 sm:px-6 md:pb-8">{children}</main>

      <nav className="fp-ui fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-[var(--line)] bg-[var(--surface)] md:hidden">
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
                "relative flex flex-col items-center py-2 text-[11px]",
                isActive ? "text-[var(--ink)]" : "text-[var(--ink-muted)]",
              )}
            >
              <Icon className="mb-0.5 h-4 w-4" />
              {item.label}
              {item.badge ? (
                <span className="absolute right-3 top-1 fp-badge-alert">{item.badge}</span>
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
