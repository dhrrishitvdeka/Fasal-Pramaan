"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Camera,
  FileText,
  Calendar,
  Languages,
  ShieldCheck,
  Wifi,
  WifiOff,
  UserCheck,
  AlertCircle,
  Menu,
  X,
  ExternalLink,
} from "lucide-react";
import { FarmerProvider, useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
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
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased selection:bg-emerald-100 selection:text-emerald-900">
      {/* Top Banner / Gov Connectivity Indicator */}
      <div className="border-b border-emerald-900/20 bg-emerald-950 px-4 py-1.5 text-xs text-emerald-100">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium tracking-wide">
              {lang === "hi"
                ? "प्रधानमंत्री फसल बीमा योजना (PMFBY) · डिजिटल साक्ष्य पोर्टल"
                : "Pradhan Mantri Fasal Bima Yojana (PMFBY) · Digital Evidence Gateway"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-emerald-300">
            <div className="flex items-center gap-1">
              {isOnline ? (
                <>
                  <Wifi className="h-3 w-3 text-emerald-400" />
                  <span className="hidden sm:inline">{t.onlineNotice}</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-amber-400" />
                  <span className="text-amber-300">{t.offlineNotice}</span>
                </>
              )}
            </div>
            <span className="text-emerald-700">|</span>
            <Link
              href="/overview"
              className="flex items-center gap-1 text-emerald-300 hover:text-white transition-colors"
              title="Official Reviewer Command Centre"
            >
              <span className="hidden md:inline">Command Centre</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo & Portal Name */}
          <Link href="/farmer" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-800 text-white font-bold shadow-sm group-hover:bg-emerald-900 transition-colors">
              <ShieldCheck className="h-6 w-6 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 tracking-tight text-base sm:text-lg">
                  फसलPramaan
                </span>
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                  {lang === "hi" ? "किसान पोर्टल" : "Farmer Portal"}
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">{t.tagline}</p>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);

              if (item.highlight) {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all shadow-sm",
                      isActive
                        ? "bg-emerald-900 text-white ring-2 ring-emerald-700"
                        : "bg-emerald-700 text-white hover:bg-emerald-800 hover:shadow"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-slate-100 text-emerald-900 font-semibold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-4 w-4 opacity-80" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-sm animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Language Switcher & Farmer Profile Chip */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Language Toggle Button */}
            <button
              type="button"
              onClick={() => setLang(lang === "en" ? "hi" : "en")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 shadow-2xs transition-all"
              aria-label="Toggle language"
              title="Switch English / हिन्दी"
            >
              <Languages className="h-3.5 w-3.5 text-emerald-700" />
              <span>{lang === "en" ? "हिन्दी" : "English"}</span>
            </button>

            {/* Farmer Profile Badge */}
            <div className="hidden lg:flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1 text-xs">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold">
                <UserCheck className="h-4 w-4" />
              </div>
              <div className="text-left">
                <div className="font-semibold text-slate-800 leading-tight">
                  {lang === "hi" ? farmerProfile.nameHi : farmerProfile.name}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {farmerProfile.kisanId}
                </div>
              </div>
            </div>

            {/* Mobile Menu Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1 shadow-lg">
            <div className="mb-3 border-b border-slate-100 pb-2">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                {t.kisanId}
              </div>
              <div className="text-sm font-semibold text-slate-900">
                {lang === "hi" ? farmerProfile.nameHi : farmerProfile.name}
              </div>
              <div className="text-xs text-emerald-700 font-mono">
                {farmerProfile.kisanId} · {farmerProfile.village}, {farmerProfile.district}
              </div>
            </div>
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
                    "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium",
                    isActive
                      ? "bg-emerald-50 text-emerald-900 font-semibold"
                      : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-slate-500" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pb-20 md:pb-8">{children}</main>

      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/98 backdrop-blur-md md:hidden shadow-lg">
        <nav className="grid grid-cols-4 items-center justify-around py-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            if (item.highlight) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center -mt-4 group"
                >
                  <div
                    className={clsx(
                      "flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95",
                      isActive
                        ? "bg-emerald-900 text-white ring-4 ring-emerald-100"
                        : "bg-emerald-700 text-white group-hover:bg-emerald-800"
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="mt-1 text-[11px] font-bold text-emerald-900">
                    {item.label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "relative flex flex-col items-center justify-center py-1 text-[11px] font-medium transition-colors",
                  isActive ? "text-emerald-800 font-bold" : "text-slate-500 hover:text-slate-900"
                )}
              >
                <Icon className={clsx("h-5 w-5 mb-0.5", isActive && "text-emerald-700")} />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="absolute top-0 right-5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500 hidden md:block">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-slate-700">FasalPramaan AI</span> ·{" "}
            {lang === "hi"
              ? "स्मार्ट फसल साक्ष्य एवं पारदर्शी दावा प्रणाली"
              : "Smart Crop Evidence and Transparent Insurance Verification"}
          </div>
          <div className="text-slate-400">
            {lang === "hi"
              ? "सभी तस्वीरें क्रिप्टोग्राफ़िक SHA-256 हैश व जीपीएस से सुरक्षित हैं"
              : "All photos secured via cryptographic SHA-256 digest & GPS geotagging"}
          </div>
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
