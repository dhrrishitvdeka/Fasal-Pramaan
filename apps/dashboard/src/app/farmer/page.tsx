"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Camera,
  AlertTriangle,
  MapPin,
  FileText,
  Clock,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Layers,
  RefreshCw,
  PlusCircle,
  RotateCcw,
  CheckCircle2,
  X,
} from "lucide-react";
import { useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import { isMilestoneOverdue, milestoneCaptureHref } from "@/lib/farmer-timeline";
import { formatAreaDisplay } from "@/lib/land-units";
import { sanitizeMojibake } from "@/lib/name-sanitizer";
import FarmerLoading from "./loading";
import { InlineError } from "@/components/ErrorMessage";
import clsx from "clsx";

function getAngleDisplayName(angle: string, lang: string): string {
  const map: Record<string, { hi: string; en: string }> = {
    photo_1: { hi: "खेत दृश्य (Overview)", en: "Field Overview (Photo 1)" },
    photo_2: { hi: "फसल स्थिति (Canopy)", en: "Crop Canopy (Photo 2)" },
    photo_3: { hi: "क्षति विस्तार (Damage Detail)", en: "Damage Detail (Photo 3)" },
    closeup_damage: { hi: "क्षति का क्लोज़अप (Closeup)", en: "Damage Closeup" },
    mid_canopy: { hi: "मध्य कैनोपी (Canopy)", en: "Mid Canopy" },
    wide_field: { hi: "विहंगम दृश्य (Wide Field)", en: "Wide Field" },
    left_context: { hi: "बायाँ संदर्भ (Left Context)", en: "Left Context" },
    right_context: { hi: "दायाँ संदर्भ (Right Context)", en: "Right Context" },
  };
  const item = map[angle];
  if (item) return lang === "hi" ? item.hi : item.en;
  return angle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function FarmerHomePage() {
  const {
    lang,
    plots,
    claims,
    milestones,
    farmerProfile,
    isLoading,
    persistError,
    newRecaptureNotices,
    newPayoutNotices,
    dismissNotice,
    dismissPayoutNotice,
    refresh,
  } = useFarmerData();
  const t = getFarmerT(lang);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const recaptureClaims = claims.filter((c) => c.status === "needs_recapture");
  const verifiedCount = claims.filter((c) => c.status === "verified").length;
  const upcoming = milestones
    .filter((m) => !m.completed)
    .sort((a, b) => Number(isMilestoneOverdue(b)) - Number(isMilestoneOverdue(a)) || a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);

  const displayName = React.useMemo(() => {
    const n = sanitizeMojibake(farmerProfile.name);
    if (
      !n ||
      n.toLowerCase() === "farmer" ||
      n === "किसान" ||
      n.toLowerCase() === "kisan" ||
      n.toLowerCase().includes("reviewer") ||
      n.toLowerCase().includes("admin")
    ) {
      return "";
    }
    // If it's an email address, keep it in pure English
    if (n.includes("@")) return n;
    const nHi = sanitizeMojibake(farmerProfile.nameHi);
    if (lang === "hi" && nHi && nHi !== "किसान") {
      return nHi;
    }
    return n;
  }, [farmerProfile.name, farmerProfile.nameHi, lang]);

  if (isLoading) {
    return <FarmerLoading />;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Greeting row + manual refresh */}
      <div className="flex items-start justify-between gap-3 sm:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {t.greeting}
            {displayName ? `, ${displayName}` : ""}
          </h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm leading-relaxed max-w-2xl">{t.dashboardSub}</p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing}
          aria-label={isRefreshing ? t.refreshing : t.refresh}
          className={clsx(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-2xs transition-all hover:bg-[var(--accent-soft)] hover:scale-105 active:scale-95",
            isRefreshing && "cursor-wait opacity-70",
          )}
        >
          <RefreshCw className={clsx("h-4 w-4", isRefreshing && "animate-spin")} aria-hidden="true" />
        </button>
      </div>

      {persistError && (
        <InlineError
          message={persistError}
          onRetry={() => void handleRefresh()}
          className="my-2"
        />
      )}

      {/* Action & Status Notifications */}
      {newRecaptureNotices.length > 0 && (
        <div className="space-y-3" role="status" aria-live="polite">
          {newRecaptureNotices.map((notice) => {
            const reason =
              (lang === "hi" ? notice.reasonHi || notice.reason : notice.reason) ||
              (lang === "hi" ? "साक्ष्य की दोबारा समीक्षा आवश्यक है" : "Evidence needs another look");
            const angles =
              notice.missingAngles.length > 0
                ? notice.missingAngles
                : ["closeup_damage", "mid_canopy"];
            return (
              <div
                key={notice.claimId}
                className="relative overflow-hidden rounded-xl border border-[#d9cbb2] bg-gradient-to-r from-[#fffcf8] via-[#faf5ec] to-[#f5eee2] p-4 text-[var(--ink)] shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100/90 text-amber-900 border border-amber-300/70">
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-950">
                        {lang === "hi" ? "पुनः फ़ोटो अनुरोध" : "Recapture Requested"}
                      </span>
                      <span className="font-mono text-xs text-stone-500">
                        #{notice.claimId.slice(-8)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissNotice(notice.claimId)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-200/60 hover:text-stone-800 transition-colors"
                    aria-label={lang === "hi" ? "हटाएँ" : "Dismiss notice"}
                    title={lang === "hi" ? "हटाएँ" : "Dismiss"}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2.5">
                  <p className="text-sm font-semibold text-[var(--ink)] leading-snug">
                    {reason}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    {lang === "hi"
                      ? "समीक्षक अधिकारी द्वारा दावे के त्वरित निपटान हेतु निम्नलिखित कोणों से स्पष्ट फ़ोटो मांगी गई है:"
                      : "The reviewing officer requires clear replacement captures for the specified angles to proceed with sanctioning:"}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {angles.map((angle) => (
                    <span
                      key={angle}
                      className="inline-flex items-center gap-1.5 rounded-md border border-amber-900/15 bg-white/90 px-2.5 py-1 text-xs font-medium text-amber-950 shadow-2xs"
                    >
                      <Camera className="h-3 w-3 text-amber-800 shrink-0" />
                      {getAngleDisplayName(angle, lang)}
                    </span>
                  ))}
                </div>

                <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2.5 border-t border-[#e8dfcf]">
                  <Link
                    href={`/farmer/capture?recapture=${notice.claimId}&angles=${angles.join(",")}`}
                    onClick={() => dismissNotice(notice.claimId)}
                    className="fp-btn-primary min-h-9 gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold shadow-2xs"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {lang === "hi" ? "फ़ोटो लें — अभी कैप्चर करें" : "Capture Required Photos Now"}
                  </Link>
                  <button
                    type="button"
                    onClick={() => dismissNotice(notice.claimId)}
                    className="min-h-9 rounded-lg border border-[#d4cfc4] bg-white/80 px-3 py-1.5 text-xs font-medium text-[var(--ink-muted)] hover:bg-white hover:text-[var(--ink)] transition-colors"
                  >
                    {lang === "hi" ? "हटाएँ" : "Dismiss"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {newPayoutNotices.length > 0 && (
        <div className="space-y-3" role="status" aria-live="polite">
          {newPayoutNotices.map((notice) => {
            const plotTitle =
              (lang === "hi" && notice.plotNameHi ? notice.plotNameHi : notice.plotName) ||
              (lang === "hi" ? "खेत" : "Plot");
            const cropTitle =
              (lang === "hi" && notice.cropTypeHi ? notice.cropTypeHi : notice.cropType) ||
              (lang === "hi" ? "फसल" : "Crop");
            return (
              <div
                key={notice.claimId}
                className="relative overflow-hidden rounded-xl border border-[#b8d5be] bg-gradient-to-r from-[#fbfdfa] via-[#f1f8f3] to-[#eaf5ec] p-4 text-[var(--ink)] shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300/70">
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-950">
                        {lang === "hi" ? "दावा स्वीकृत • डीबीटी संस्तुत" : "Claim Approved • Payout Sanctioned"}
                      </span>
                      <span className="font-mono text-xs text-stone-500">
                        #{notice.claimId.slice(-8)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissPayoutNotice(notice.claimId)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-200/60 hover:text-stone-800 transition-colors"
                    aria-label={lang === "hi" ? "हटाएँ" : "Dismiss notice"}
                    title={lang === "hi" ? "हटाएँ" : "Dismiss"}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-emerald-950">
                        ₹{notice.payoutAmountInr > 0 ? notice.payoutAmountInr.toLocaleString("en-IN") : "0"}
                      </span>
                      <span className="text-xs font-semibold text-emerald-900">
                        {lang === "hi" ? "स्वीकृत मुआवज़ा राशि (DBT)" : "Sanctioned Direct Benefit Transfer"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                      {lang === "hi"
                        ? `${plotTitle} (${cropTitle}) के फसल नुकसान के साक्ष्य सत्यापित कर लिए गए हैं।`
                        : `Crop loss evidence for ${plotTitle} (${cropTitle}) has been verified and sanctioned.`}
                    </p>
                  </div>
                </div>

                <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2.5 border-t border-[#cde0d2]">
                  <Link
                    href={`/farmer/claims/${notice.claimId}`}
                    onClick={() => dismissPayoutNotice(notice.claimId)}
                    className="fp-btn-primary min-h-9 gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold shadow-2xs"
                  >
                    <span>{lang === "hi" ? "स्वीकृति पत्र व विवरण देखें" : "View Approval & Payout Details"}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => dismissPayoutNotice(notice.claimId)}
                    className="min-h-9 rounded-lg border border-[#b8d5be] bg-white/80 px-3 py-1.5 text-xs font-medium text-emerald-950 hover:bg-white transition-colors"
                  >
                    {lang === "hi" ? "हटाएँ" : "Dismiss"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick actions: big Saathi claim card + secondary links */}
      <section aria-label={t.quickActionNewClaim}>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Link
            href="/farmer/saathi"
            className="group col-span-2 flex items-center gap-4 rounded-2xl border border-[var(--ink)] bg-[var(--ink)] p-5 sm:p-6 text-white shadow-md transition-all duration-200 hover:bg-[#11100e] active:scale-[0.99]"
          >
            <Camera className="h-7 w-7 text-white shrink-0 transition-transform group-hover:scale-105" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="text-base sm:text-lg font-bold leading-tight tracking-tight text-white">{t.quickActionNewClaim}</div>
              <div className="mt-1 text-xs sm:text-sm text-slate-300 leading-relaxed">{t.quickActionNewClaimSub}</div>
            </div>
          </Link>

          <Link
            href="/farmer/claims"
            className="fp-panel flex min-h-12 items-center justify-between gap-2.5 rounded-xl p-3.5 sm:p-4 text-xs sm:text-sm font-bold text-[var(--ink)] shadow-2xs transition-all hover:bg-[var(--accent-soft)] hover:shadow-xs group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </div>
              <span className="truncate">{t.claims}</span>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-muted)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>

          <Link
            href="/farmer/reminders"
            className="fp-panel flex min-h-12 items-center justify-between gap-2.5 rounded-xl p-3.5 sm:p-4 text-xs sm:text-sm font-bold text-[var(--ink)] shadow-2xs transition-all hover:bg-[var(--accent-soft)] hover:shadow-xs group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <Clock className="h-4 w-4" aria-hidden="true" />
              </div>
              <span className="truncate">{t.reminders}</span>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-muted)] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Stats: interactive 2x2 grid on phones, 4-up grid on sm+ */}
      <section aria-label={t.statClaims}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3.5">
          {/* Card 1: Registered Plots */}
          <Link
            href={plots.length > 0 ? "#registered-plots" : "/farmer/reminders#register-plot"}
            className="group fp-panel relative flex flex-col justify-between rounded-xl p-3.5 sm:p-4 shadow-2xs transition-all duration-150 hover:border-emerald-300 hover:shadow-md hover:scale-[1.02] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-emerald-500"
            title={lang === "hi" ? "पंजीकृत भूखंड विवरण देखें" : "View registered plot details"}
          >
            <div>
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[11px]">
                <span>{t.statPlots}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-emerald-700" />
              </div>
              <div className="mt-1.5 text-2xl font-bold sm:text-3xl text-slate-900 font-mono">
                {isLoading ? "—" : plots.length}
              </div>
            </div>
            <div className="mt-2 text-[10px] sm:text-[11px] font-medium text-emerald-800 flex items-center gap-1">
              <span>{plots.length === 0 ? t.addPlotBtn : t.viewPlotsArrow}</span>
            </div>
          </Link>

          {/* Card 2: Claims Filed */}
          <Link
            href="/farmer/claims"
            className="group fp-panel relative flex flex-col justify-between rounded-xl p-3.5 sm:p-4 shadow-2xs transition-all duration-150 hover:border-emerald-300 hover:shadow-md hover:scale-[1.02] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-emerald-500"
            title={t.viewAllClaims}
          >
            <div>
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[11px]">
                <span>{t.statClaims}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-emerald-700" />
              </div>
              <div className="mt-1.5 text-2xl font-bold sm:text-3xl text-slate-900 font-mono">
                {isLoading ? "—" : claims.length}
              </div>
            </div>
            <div className="mt-2 text-[10px] sm:text-[11px] font-medium text-slate-600 flex items-center gap-1">
              <span>{t.viewClaimsArrow}</span>
            </div>
          </Link>

          {/* Card 3: Claims Verified */}
          <Link
            href="/farmer/claims?status=verified"
            className="group fp-panel relative flex flex-col justify-between rounded-xl p-3.5 sm:p-4 shadow-2xs transition-all duration-150 hover:border-emerald-300 hover:shadow-md hover:scale-[1.02] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-emerald-500"
            title={t.payoutSanctioned}
          >
            <div>
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[11px]">
                <span>{t.statVerified}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-emerald-700" />
              </div>
              <div className={clsx("mt-1.5 text-2xl font-bold sm:text-3xl font-mono", verifiedCount > 0 ? "text-emerald-800" : "text-slate-900")}>
                {isLoading ? "—" : verifiedCount}
              </div>
            </div>
            <div className="mt-2 text-[10px] sm:text-[11px] font-medium text-emerald-700 flex items-center gap-1">
              <span>{verifiedCount > 0 ? t.approvedPayoutsArrow : t.viewVerifiedArrow}</span>
            </div>
          </Link>

          {/* Card 4: Needs Action */}
          <Link
            href={
              recaptureClaims.length > 0
                ? (recaptureClaims.length === 1
                    ? `/farmer/capture?recapture=${recaptureClaims[0].id}&angles=${(recaptureClaims[0].missingAngles || []).join(",") || "closeup_damage,mid_canopy"}`
                    : "#attention-required")
                : "/farmer/claims?status=needs_recapture"
            }
            className={clsx(
              "group fp-panel relative flex flex-col justify-between rounded-xl p-3.5 sm:p-4 shadow-2xs transition-all duration-150 hover:shadow-md hover:scale-[1.02] active:scale-[0.99] focus-visible:ring-2",
              recaptureClaims.length > 0
                ? "border-amber-300 bg-amber-50/60 hover:border-amber-400 focus-visible:ring-amber-500"
                : "hover:border-emerald-300 focus-visible:ring-emerald-500"
            )}
            title={t.attentionRequired}
          >
            <div>
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[11px]">
                <span className={recaptureClaims.length > 0 ? "text-amber-900 font-bold" : ""}>
                  {t.statPendingAction}
                </span>
                <ArrowUpRight className={clsx("h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5", recaptureClaims.length > 0 ? "text-amber-700" : "text-slate-400")} />
              </div>
              <div className={clsx("mt-1.5 text-2xl font-bold sm:text-3xl font-mono", recaptureClaims.length > 0 ? "text-amber-800" : "text-slate-900")}>
                {isLoading ? "—" : recaptureClaims.length}
              </div>
            </div>
            <div className={clsx("mt-2 text-[10px] sm:text-[11px] font-bold flex items-center gap-1", recaptureClaims.length > 0 ? "text-amber-900" : "text-slate-500 font-medium")}>
              <span>{recaptureClaims.length > 0 ? t.retakeRequiredAlert : t.allComplete}</span>
            </div>
          </Link>
        </div>
      </section>

      {/* Recapture banner */}
      {recaptureClaims.length > 0 && (
        <div id="attention-required" className="fp-panel space-y-3.5 rounded-2xl border-[var(--ink)] p-4 sm:p-6 shadow-2xs scroll-mt-20">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-amber-950">{t.attentionRequired}</h2>
              <p className="text-xs text-amber-900 mt-0.5">{t.attentionSub}</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {recaptureClaims.map((claim) => (
              <div key={claim.id} className="flex flex-col gap-2.5 rounded-xl bg-white border border-amber-200 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between shadow-2xs">
                <div className="min-w-0 text-xs">
                  <div className="font-mono font-bold text-slate-900">{claim.id.slice(0, 8)}</div>
                  <div className="break-words text-slate-600 mt-0.5">
                    {lang === "hi" ? claim.cropTypeHi || claim.cropType : claim.cropType} ·{" "}
                    {(claim.missingAngles || []).join(", ") || "angles requested"}
                  </div>
                </div>
                <Link
                  href={`/farmer/capture?recapture=${claim.id}&angles=${(claim.missingAngles || []).join(",")}`}
                  className="fp-btn-primary min-h-11 w-full gap-2 rounded-lg px-3.5 py-2 text-xs sm:min-h-0 sm:w-auto font-semibold"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {t.startRecaptureNow}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {plots.length > 0 ? (
        <>
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        {/* Registered Farm Plots */}
        <section id="registered-plots" className="fp-panel rounded-2xl p-4 sm:p-6 shadow-2xs overflow-hidden scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 min-w-0">
              <Layers className="h-4 w-4 text-[var(--accent)] shrink-0" />
              <span className="truncate">{t.registeredPlots}</span>
            </h2>
            <Link
              href="/farmer/reminders#register-plot"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-800 hover:underline"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>{t.addPlotBtn}</span>
            </Link>
          </div>
          {isLoading ? (
            <p className="text-xs text-slate-500">{t.loadingPlots}</p>
          ) : plots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-5 sm:p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">{t.noPlots}</p>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                {t.noPlotsSub}
              </p>
              <Link
                href="/farmer/reminders#register-plot"
                className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:underline"
              >
                <PlusCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{t.registerFirstPlot}</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {plots.map((plot) => {
                const areaInfo = formatAreaDisplay(plot.areaHectares, true, lang);
                return (
                  <div key={plot.id} className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-3.5 transition-all hover:bg-slate-100/70 overflow-hidden">
                    <div className="flex flex-col items-start justify-between gap-2.5 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 truncate">{lang === "hi" ? plot.nameHi || plot.name : plot.name}</span>
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900 shrink-0">
                            {areaInfo.primary}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {plot.khataNumber && <span>{t.khataLabel}: <strong>{plot.khataNumber}</strong></span>}
                          <span>{t.khasra}: <strong>{plot.khasraNumber || "—"}</strong></span>
                          <span>{lang === "hi" ? plot.cropTypeHi || plot.cropType : plot.cropType}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={lang === "hi" ? "भूमि का क्षेत्रफल" : "Land area"}>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            {lang === "hi" ? "क्षेत्रफल" : "Area"}
                          </span>
                          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-900">
                            {areaInfo.primary}
                          </span>
                          <span className="hidden text-[10px] text-slate-400 sm:inline">Equivalent:</span>
                          {areaInfo.secondary.split(" · ").map((value) => (
                            <span key={value} className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-medium text-slate-600">
                              {value}
                            </span>
                          ))}
                        </div>
                        {(plot.village || plot.district || plot.tehsil) && (
                          <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{[plot.village, plot.tehsil, plot.district, plot.state].filter(Boolean).join(", ")}</span>
                          </div>
                        )}
                      </div>
                      <Link
                        href={`/farmer/saathi?plotId=${plot.id}`}
                        className="shrink-0 text-xs font-bold text-[var(--accent)] hover:underline"
                      >
                        {t.reportDamageOnPlot}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Active Insurance Claims */}
        <section className="fp-panel rounded-2xl p-4 sm:p-6 shadow-2xs overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 text-[var(--accent)] shrink-0" />
              <span className="truncate">{t.activeClaims}</span>
            </h2>
            <Link href="/farmer/claims" className="fp-link text-xs font-semibold shrink-0">
              {t.viewAllClaims}
            </Link>
          </div>
          {isLoading ? (
            <p className="text-xs text-slate-500">{t.loadingClaims}</p>
          ) : claims.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-5 sm:p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">{t.noClaimsFound}</p>
              <Link
                href="/farmer/saathi"
                className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:underline"
              >
                {t.quickActionNewClaim}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              {claims.slice(0, 5).map((claim) => {
                const isRecapture = claim.status === "needs_recapture";
                const isVerified = claim.status === "verified";
                const isUnderReview = claim.status === "under_review" || claim.status === "submitted";
                const cropLabel =
                  (lang === "hi" ? claim.cropTypeHi || claim.cropType : claim.cropType) ||
                  (lang === "hi" ? "फसल दावा" : "Crop Claim");
                const plotLabel = claim.plotName ? `${lang === "hi" ? claim.plotNameHi || claim.plotName : claim.plotName} · ` : "";
                const dateLabel = claim.createdAt
                  ? new Date(claim.createdAt).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
                      month: "short",
                      day: "numeric",
                    })
                  : "";

                const statusLabel = isVerified
                  ? (lang === "hi" ? "सत्यापित" : "Verified")
                  : isRecapture
                    ? (lang === "hi" ? "पुनः फोटो" : "Recapture")
                    : isUnderReview
                      ? (lang === "hi" ? "समीक्षा जारी" : "Under Review")
                      : (claim.status || "submitted").replaceAll("_", " ");

                return (
                  <Link
                    key={claim.id}
                    href={`/farmer/claims/${claim.id}`}
                    className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 py-2.5 hover:border-slate-300 hover:bg-slate-50 shadow-2xs transition-all overflow-hidden"
                  >
                    <div className="min-w-0 flex-1 pr-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-bold text-slate-800 truncate" title={claim.id}>
                          {claim.id.startsWith("claim-")
                            ? `Claim #${claim.id.slice(6, 14)}`
                            : claim.id.length > 18
                              ? `${claim.id.slice(0, 16)}…`
                              : claim.id}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {plotLabel}{cropLabel}{dateLabel ? ` · ${dateLabel}` : ""}
                      </div>
                    </div>
                    <span
                      className={clsx(
                        "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap",
                        isVerified && "border border-emerald-300 bg-emerald-50 text-emerald-800",
                        isRecapture && "border border-amber-300 bg-amber-50 text-amber-900",
                        isUnderReview && "border border-blue-200 bg-blue-50 text-blue-800",
                        claim.status === "draft" && "border border-slate-200 bg-slate-100 text-slate-700"
                      )}
                    >
                      {statusLabel}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* 30-Day Growth Reminders */}
      <section className="fp-panel rounded-2xl p-4 sm:p-6 shadow-2xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 min-w-0">
            <Clock className="h-4 w-4 text-[var(--accent)] shrink-0" />
            <span className="truncate">{t.upcomingReminders}</span>
          </h2>
          <Link href="/farmer/reminders" className="fp-link text-xs font-semibold shrink-0">
            {t.viewTimeline}
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-xs text-slate-500">
            {lang === "hi" ? "कोई आगामी विकास अनुस्मारक नहीं।" : "No upcoming growth reminders."}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {upcoming.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50/80 px-3 py-2 text-xs overflow-hidden">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                  {lang === "hi" ? m.stageNameHi || m.stageName : m.stageName}
                  {isMilestoneOverdue(m) ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{t.overdueBadge}</span>
                  ) : null}
                </span>
                <Link href={milestoneCaptureHref(m)} className="fp-link shrink-0 font-semibold">
                  {m.dueDate} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
        </>
      ) : null}
    </div>
  );
}
