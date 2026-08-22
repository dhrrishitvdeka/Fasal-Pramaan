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
  Layers,
  RefreshCw,
  PlusCircle,
} from "lucide-react";
import { useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import { isMilestoneOverdue, milestoneCaptureHref } from "@/lib/farmer-timeline";
import { formatAreaDisplay } from "@/lib/land-units";
import { sanitizeMojibake } from "@/lib/name-sanitizer";
import FarmerLoading from "./loading";
import { InlineError } from "@/components/ErrorMessage";
import clsx from "clsx";

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
    dismissNotice,
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
    if (!n || n.toLowerCase() === "farmer" || n === "किसान" || n.toLowerCase() === "kisan") return "";
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

      {/* Notification toasts */}
      {newRecaptureNotices.length > 0 && (
        <div className="space-y-2.5" role="status" aria-live="polite">
          {newRecaptureNotices.map((notice) => {
            const reason =
              (lang === "hi" ? notice.reasonHi || notice.reason : notice.reason) ||
              (lang === "hi" ? "साक्ष्य की दोबारा समीक्षा आवश्यक है" : "Evidence needs another look");
            return (
              <div
                key={notice.claimId}
                className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 shadow-2xs"
              >
                <div className="flex items-start gap-2.5">
                  <span aria-hidden="true" className="text-base">🔔</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-amber-950">
                      {lang === "hi"
                        ? `🔔 नया पुनः फोटो अनुरोध — ${reason}`
                        : `🔔 New recapture request — ${reason}`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(notice.missingAngles.length > 0
                        ? notice.missingAngles
                        : ["closeup_damage", "mid_canopy"]
                      ).map((angle) => (
                        <span
                          key={angle}
                          className="rounded-full border border-amber-300/80 bg-white px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900"
                        >
                          {angle.replaceAll("_", " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Link
                    href={`/farmer/capture?recapture=${notice.claimId}&angles=${notice.missingAngles.join(",") || "closeup_damage,mid_canopy"}`}
                    onClick={() => dismissNotice(notice.claimId)}
                    className="fp-btn-primary min-h-11 w-full gap-2 rounded-lg px-3.5 py-2 text-xs sm:min-h-0 sm:w-auto font-semibold"
                  >
                    <Camera className="h-4 w-4" />
                    {lang === "hi" ? "अभी कैप्चर करें" : "Capture now"}
                  </Link>
                  <button
                    type="button"
                    onClick={() => dismissNotice(notice.claimId)}
                    className="min-h-11 w-full rounded-lg border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100/60 sm:min-h-0 sm:w-auto transition-colors"
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

      {/* Stats: clean 2x2 grid on phones, 4-up grid on sm+ */}
      <section aria-label={t.statClaims}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3.5">
          {[
            { label: t.statPlots, value: plots.length },
            { label: t.statClaims, value: claims.length },
            { label: t.statVerified, value: verifiedCount },
            { label: t.statPendingAction, value: recaptureClaims.length, alert: recaptureClaims.length > 0 },
          ].map((stat) => (
            <div
              key={stat.label}
              className="fp-panel rounded-xl p-3.5 sm:p-4 shadow-2xs transition-all hover:shadow-xs"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-[11px]">
                {stat.label}
              </div>
              <div className={clsx("mt-1.5 text-2xl font-bold sm:text-3xl", stat.alert ? "text-amber-700" : "text-slate-900")}>
                {isLoading ? "—" : stat.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recapture banner */}
      {recaptureClaims.length > 0 && (
        <div className="fp-panel space-y-3.5 rounded-2xl border-[var(--ink)] p-4 sm:p-6 shadow-2xs">
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

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <section className="fp-panel rounded-2xl p-4 sm:p-6 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="h-4 w-4 text-[var(--accent)]" />
              {t.registeredPlots}
            </h2>
            <Link
              href="/farmer/reminders#register-plot"
              className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:underline"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>{lang === "hi" ? "नया खेत जोड़ें" : "+ Register Plot"}</span>
            </Link>
          </div>
          {isLoading ? (
            <p className="text-xs text-slate-500">{t.loadingPlots}</p>
          ) : plots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 sm:p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">{lang === "hi" ? "कोई पंजीकृत भूखंड नहीं" : "No registered plots"}</p>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                {lang === "hi"
                  ? "आप बिना भूखंड रिकॉर्ड के भी नया दावा जमा कर सकते हैं।"
                  : "You can still file a claim without a stored plot record."}
              </p>
              <Link
                href="/farmer/reminders#register-plot"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 hover:underline"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>{lang === "hi" ? "पहला भूखंड (कट्ठा) पंजीकृत करें" : "Register First Plot (in Kattha)"}</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {plots.map((plot) => {
                const areaInfo = formatAreaDisplay(plot.areaHectares, true, lang);
                return (
                  <div key={plot.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 transition-all hover:bg-slate-100/70">
                    <div className="flex flex-col items-start justify-between gap-2.5 sm:flex-row">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{lang === "hi" ? plot.nameHi || plot.name : plot.name}</span>
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                            {areaInfo.primary}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {plot.khataNumber && <span>{lang === "hi" ? "खाता" : "Khata"}: <strong>{plot.khataNumber}</strong></span>}
                          <span>{t.khasra}: <strong>{plot.khasraNumber || "—"}</strong></span>
                          <span>{lang === "hi" ? plot.cropTypeHi || plot.cropType : plot.cropType}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {areaInfo.secondary}
                        </div>
                        {(plot.village || plot.district || plot.tehsil) && (
                          <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {[plot.village, plot.tehsil, plot.district, plot.state].filter(Boolean).join(", ")}
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

        <section className="fp-panel rounded-2xl p-4 sm:p-6 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[var(--accent)]" />
              {t.activeClaims}
            </h2>
            <Link href="/farmer/claims" className="fp-link text-xs font-medium">
              {t.viewAllClaims}
            </Link>
          </div>
          {isLoading ? (
            <p className="text-xs text-slate-500">{t.loadingClaims}</p>
          ) : claims.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-6 sm:p-8 text-center">
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
              {claims.slice(0, 5).map((claim) => (
                <Link
                  key={claim.id}
                  href={`/farmer/claims/${claim.id}`}
                  className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white/70 px-3.5 py-2.5 hover:bg-slate-50 shadow-2xs transition-all"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-bold text-slate-800 truncate">{claim.id}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {lang === "hi" ? claim.cropTypeHi || claim.cropType : claim.cropType} · {claim.status}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
                      claim.status === "verified" && "fp-badge-ok",
                      claim.status === "needs_recapture" && "bg-amber-100 text-amber-900",
                      (claim.status === "under_review" || claim.status === "submitted") && "bg-blue-100 text-blue-800"
                    )}
                  >
                    {claim.status.replaceAll("_", " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="fp-panel rounded-2xl p-4 sm:p-6 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--accent)]" />
            {t.upcomingReminders}
          </h2>
          <Link href="/farmer/reminders" className="fp-link text-xs font-medium">
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
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50/80 px-3 py-2 text-xs">
                <span className="min-w-0 font-medium text-slate-800">
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
    </div>
  );
}
