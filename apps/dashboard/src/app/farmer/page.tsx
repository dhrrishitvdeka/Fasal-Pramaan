"use client";

import Link from "next/link";
import {
  Camera,
  AlertTriangle,
  MapPin,
  FileText,
  Clock,
  ArrowRight,
  Layers,
} from "lucide-react";
import { useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import { isMilestoneOverdue, milestoneCaptureHref } from "@/lib/farmer-timeline";
import clsx from "clsx";

export default function FarmerHomePage() {
  const { lang, plots, claims, milestones, farmerProfile, isLoading, persistError } = useFarmerData();
  const t = getFarmerT(lang);

  const recaptureClaims = claims.filter((c) => c.status === "needs_recapture");
  const verifiedCount = claims.filter((c) => c.status === "verified").length;
  const upcoming = milestones
    .filter((m) => !m.completed)
    .sort((a, b) => Number(isMilestoneOverdue(b)) - Number(isMilestoneOverdue(a)) || a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 sm:text-2xl">
            {t.greeting}
            {farmerProfile.name && farmerProfile.name !== "Farmer" ? `, ${lang === "hi" ? farmerProfile.nameHi || farmerProfile.name : farmerProfile.name}` : ""}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">{t.dashboardSub}</p>
        </div>
        <Link href="/farmer/capture" className="fp-btn-primary w-full gap-2 sm:w-auto">
          <Camera className="h-4 w-4" />
          <span>{t.quickActionNewClaim}</span>
        </Link>
      </div>

      {persistError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          {persistError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 sm:gap-3">
        {[
          { label: t.statPlots, value: plots.length },
          { label: t.statClaims, value: claims.length },
          { label: t.statVerified, value: verifiedCount },
          { label: t.statPendingAction, value: recaptureClaims.length },
        ].map((stat) => (
          <div key={stat.label} className="fp-panel p-3 sm:p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">{stat.label}</div>
            <div className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{isLoading ? "—" : stat.value}</div>
          </div>
        ))}
      </div>

      {recaptureClaims.length > 0 && (
        <div className="fp-panel space-y-3 border-[var(--ink)] p-3 sm:p-5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-amber-950">{t.attentionRequired}</h2>
              <p className="text-xs text-amber-900 mt-0.5">{t.attentionSub}</p>
            </div>
          </div>
          <div className="space-y-2">
            {recaptureClaims.map((claim) => (
              <div key={claim.id} className="flex flex-col gap-2 rounded-lg bg-white border border-amber-200 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="min-w-0 text-xs">
                  <div className="font-mono font-bold text-slate-900">{claim.id.slice(0, 8)}</div>
                  <div className="break-words text-slate-600">
                    {lang === "hi" ? claim.cropTypeHi || claim.cropType : claim.cropType} ·{" "}
                    {(claim.missingAngles || []).join(", ") || "angles requested"}
                  </div>
                </div>
                <Link
                  href={`/farmer/capture?recapture=${claim.id}&angles=${(claim.missingAngles || []).join(",")}`}
                  className="fp-btn-primary w-full gap-1.5 px-3 py-1.5 text-xs sm:w-auto"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {t.startRecaptureNow}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="fp-panel p-3 sm:p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="h-4 w-4 text-[var(--accent)]" />
              {t.registeredPlots}
            </h2>
          </div>
          {isLoading ? (
            <p className="text-xs text-slate-500">Loading plots…</p>
          ) : plots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">{lang === "hi" ? "कोई पंजीकृत भूखंड नहीं" : "No registered plots"}</p>
              <p className="mt-1 text-xs text-slate-500">
                {lang === "hi"
                  ? "आप बिना भूखंड रिकॉर्ड के भी नया दावा जमा कर सकते हैं।"
                  : "You can still file a claim without a stored plot record."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {plots.map((plot) => (
                <div key={plot.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900">{lang === "hi" ? plot.nameHi || plot.name : plot.name}</div>
                      <div className="text-xs text-slate-600 mt-0.5 flex flex-wrap gap-2">
                        <span>{t.khasra}: {plot.khasraNumber || "—"}</span>
                        <span>{t.area}: {plot.areaHectares || "—"} ha</span>
                        <span>{lang === "hi" ? plot.cropTypeHi || plot.cropType : plot.cropType}</span>
                      </div>
                      {(plot.village || plot.district) && (
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[plot.village, plot.district, plot.state].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>
                    <Link
                      href={`/farmer/capture?plotId=${plot.id}`}
                      className="shrink-0 text-xs font-bold text-[var(--accent)] hover:underline"
                    >
                      {t.reportDamageOnPlot}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="fp-panel p-3 sm:p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[var(--accent)]" />
              {t.activeClaims}
            </h2>
            <Link href="/farmer/claims" className="fp-link text-xs">
              {t.viewAllClaims}
            </Link>
          </div>
          {isLoading ? (
            <p className="text-xs text-slate-500">Loading claims…</p>
          ) : claims.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
              <p className="text-sm font-semibold text-slate-700">{t.noClaimsFound}</p>
              <Link
                href="/farmer/capture"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800"
              >
                {t.quickActionNewClaim}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {claims.slice(0, 5).map((claim) => (
                <Link
                  key={claim.id}
                  href={`/farmer/claims/${claim.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-bold text-slate-800 truncate">{claim.id}</div>
                    <div className="text-[11px] text-slate-500">
                      {lang === "hi" ? claim.cropTypeHi || claim.cropType : claim.cropType} · {claim.status}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
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

      <section className="fp-panel p-3 sm:p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--accent)]" />
            {t.upcomingReminders}
          </h2>
          <Link href="/farmer/reminders" className="fp-link text-xs">
            {t.viewTimeline}
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-xs text-slate-500">
            {lang === "hi" ? "कोई आगामी विकास अनुस्मारक नहीं।" : "No upcoming growth reminders."}
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 font-medium text-slate-800">
                  {lang === "hi" ? m.stageNameHi || m.stageName : m.stageName}
                  {isMilestoneOverdue(m) ? (
                    <span className="ml-2 text-amber-800">{t.overdueBadge}</span>
                  ) : null}
                </span>
                <Link href={milestoneCaptureHref(m)} className="fp-link shrink-0">
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
