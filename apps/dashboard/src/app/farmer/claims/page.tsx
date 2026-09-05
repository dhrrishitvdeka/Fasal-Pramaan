"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FileText,
  Search,
  Filter,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  Calendar,
  Layers,
  ChevronRight,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Eye,
  RefreshCw,
  Plus,
} from "lucide-react";
import { useFarmerData, ClaimStatus } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import { safeDisplayUrl } from "@/lib/media";
import { CardSkeleton } from "@/components/LoadingAnimation";
import ErrorMessage, { InlineError } from "@/components/ErrorMessage";
import clsx from "clsx";

function FarmerClaimsContent() {
  const { lang, claims, isLoading, persistError } = useFarmerData();
  const t = getFarmerT(lang);
  const searchParams = useSearchParams();
  const initialStatus = searchParams?.get("status");

  const [activeFilter, setActiveFilter] = useState<"all" | "under_review" | "needs_recapture" | "verified" | "draft">(() => {
    if (initialStatus === "verified" || initialStatus === "needs_recapture" || initialStatus === "under_review" || initialStatus === "draft") {
      return initialStatus;
    }
    return "all";
  });
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const statusParam = searchParams?.get("status");
    if (statusParam === "verified" || statusParam === "needs_recapture" || statusParam === "under_review" || statusParam === "draft") {
      setActiveFilter(statusParam);
    }
  }, [searchParams]);

  const filteredClaims = claims.filter((claim) => {
    // Status filter
    if (activeFilter !== "all" && claim.status !== activeFilter) {
      return false;
    }
    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = claim.id.toLowerCase().includes(q);
      const matchCrop =
        claim.cropType.toLowerCase().includes(q) ||
        claim.cropTypeHi.toLowerCase().includes(q);
      const matchPlot =
        claim.plotName.toLowerCase().includes(q) ||
        claim.plotNameHi.toLowerCase().includes(q) ||
        claim.khasraNumber.toLowerCase().includes(q);
      const matchDisease =
        claim.aiPrediction.diseaseDetected.toLowerCase().includes(q) ||
        claim.aiPrediction.diseaseDetectedHi.toLowerCase().includes(q);
      return matchId || matchCrop || matchPlot || matchDisease;
    }
    return true;
  });

  const filterTabs = [
    { key: "all" as const, label: t.filterAll, count: claims.length },
    {
      key: "under_review" as const,
      label: t.filterReview,
      count: claims.filter((c) => c.status === "under_review" || c.status === "submitted").length,
    },
    {
      key: "needs_recapture" as const,
      label: t.filterAction,
      count: claims.filter((c) => c.status === "needs_recapture").length,
      alert: true,
    },
    {
      key: "verified" as const,
      label: t.filterVerified,
      count: claims.filter((c) => c.status === "verified").length,
    },
    {
      key: "draft" as const,
      label: t.filterDraft,
      count: claims.filter((c) => c.status === "draft").length,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b border-slate-200 pb-3 sm:pb-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900 sm:text-2xl">
            <FileText className="h-5 w-5 text-[var(--accent)] sm:h-6 sm:w-6" />
            <span>{t.claims}</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            {t.claimsListSub}
          </p>
        </div>
      </div>

      {/* Search & Filter Controls — search full-width above chips, chips scroll horizontally on phone */}
      <div className="space-y-3">
        {/* Search Box */}
        <div className="relative w-full md:max-w-md">
          <label htmlFor="claims-search" className="sr-only">
            {t.searchClaims}
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            id="claims-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchClaims}
            className="fp-input mt-0 min-h-11 w-full pl-9 text-xs"
          />
        </div>

        {/* Filter chips — edge-to-edge horizontal scroll on phone, counts never squeeze labels */}
        <div className="fp-chip-row -mx-3 w-auto gap-1.5 px-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6">
          {filterTabs.map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveFilter(tab.key)}
                aria-pressed={isActive}
                className={clsx(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-xs font-bold transition-all md:min-h-0",
                  isActive
                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)] shadow-xs"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={clsx(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-mono leading-none",
                    isActive
                      ? "bg-white/25 text-inherit"
                      : tab.alert && tab.count > 0
                      ? "fp-badge-alert"
                      : "bg-slate-200 text-slate-700",
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {persistError && (
        <InlineError message={persistError} className="my-2" />
      )}

      {/* Claims List Grid */}
      {isLoading ? (
        <CardSkeleton count={3} className="space-y-4 !grid-cols-1" />
      ) : filteredClaims.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center sm:p-12">
          <FileText className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <h3 className="text-sm font-bold text-slate-700">{t.noClaimsFound}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {t.noClaimsSub}
          </p>
          <Link
            href="/farmer/capture"
            className="fp-btn-primary mt-4 gap-2 text-xs"
          >
            <Camera className="h-4 w-4" />
            <span>{t.quickActionNewClaim}</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredClaims.map((claim) => {
            const isRecapture = claim.status === "needs_recapture";
            const isVerified = claim.status === "verified";
            const isUnderReview = claim.status === "under_review" || claim.status === "submitted";

            // Phone thumbnail anchor: first image with a display-safe URL
            const firstImage =
              claim.images.find((img) => Boolean(safeDisplayUrl(img.imageUrl))) ?? null;
            const firstThumbUrl = firstImage ? safeDisplayUrl(firstImage.imageUrl) : null;

            return (
              <div
                key={claim.id}
                className={clsx(
                  "rounded-xl border bg-white p-3 shadow-xs transition-all hover:shadow-md sm:p-5",
                  isRecapture
                    ? "border-amber-300 bg-amber-50/20"
                    : isVerified
                    ? "border-emerald-200"
                    : "border-slate-200"
                )}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex min-w-0 gap-3 lg:contents">
                  {/* First-image thumbnail — 64px phone anchor (desktop keeps the strip on the right) */}
                  <div
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 lg:hidden"
                    aria-hidden="true"
                  >
                    {firstThumbUrl ? (
                      <img
                        src={firstThumbUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-slate-300">
                        <Camera className="h-6 w-6" />
                      </span>
                    )}
                    {firstImage && !firstImage.qualityPassed ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-red-900/60">
                        <AlertCircle className="h-4 w-4 text-white" />
                      </div>
                    ) : null}
                  </div>

                  {/* Left info — stacked meta */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="min-w-0 max-w-full flex-1 basis-full truncate font-mono text-xs font-bold text-slate-900 sm:basis-auto sm:text-sm"
                        title={claim.id}
                      >
                        {claim.id}
                      </span>
                      {/* Peril Badge */}
                      <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        {String((claim as any).peril || "normal").replaceAll("_", " ")}
                      </span>
                      {/* Status Badge */}
                      <span
                        className={clsx(
                          "rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide",
                          isVerified && "fp-badge-ok",
                          isRecapture && "fp-badge-alert",
                          isUnderReview && "bg-blue-100 text-blue-800 border border-blue-300",
                          claim.status === "draft" && "bg-slate-100 text-slate-700 border border-slate-300"
                        )}
                      >
                        {isVerified
                          ? t.statusVerified
                          : isRecapture
                          ? t.statusNeedsRecapture
                          : isUnderReview
                          ? t.statusUnderReview
                          : t.statusDraft}
                      </span>

                      <span className="text-xs text-slate-400">
                        {t.submittedOn}: {new Date(claim.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
                      <span className="font-bold text-slate-900">
                        {lang === "hi" ? claim.cropTypeHi : claim.cropType}
                        {claim.cropVariety ? ` (${claim.cropVariety})` : ""}
                      </span>
                      <span className="text-slate-500">·</span>
                      <span className="flex items-center gap-1 text-slate-600">
                        <Layers className="h-3.5 w-3.5 text-slate-400" />
                        {lang === "hi" ? claim.plotNameHi : claim.plotName} ({t.khasra}: {claim.khasraNumber})
                      </span>
                    </div>

                    {/* AI Assessment tags */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                        {lang === "hi" ? "नुकसान:" : "Damage:"}{" "}
                        <strong className="text-slate-900">
                          {lang === "hi"
                            ? claim.aiPrediction.diseaseDetectedHi
                            : claim.aiPrediction.diseaseDetected}
                        </strong>
                      </span>
                      <span className="fp-badge-neutral">
                        {lang === "hi" ? "गंभीरता:" : "Severity:"}{" "}
                        <strong>{claim.aiPrediction.severityPercentage}%</strong>
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                        {lang === "hi" ? "साक्ष्य विश्वसनीयता:" : "Evidence Trust:"}{" "}
                        <strong>{claim.evidenceTrust.overallConfidence}%</strong>
                      </span>
                    </div>

                    {/* Urgent recapture note if applicable */}
                    {isRecapture && (
                      <div className="mt-2 rounded-lg border border-amber-300 bg-amber-100/70 p-3 text-xs text-amber-950 font-medium">
                        <div className="font-bold flex items-center gap-1.5 text-amber-900">
                          <AlertTriangle className="h-4 w-4 text-amber-700" />
                          <span>{lang === "hi" ? "अधिकारी की टिप्पणी:" : "Reviewer Instructions:"}</span>
                        </div>
                        <p className="mt-1">
                          {lang === "hi" ? claim.recaptureReasonHi : claim.recaptureReason}
                        </p>
                      </div>
                    )}

                    {/* Verified Payout Banner */}
                    {(() => {
                      const amount =
                        typeof claim.payoutAmountInr === "number" && claim.payoutAmountInr > 0
                          ? claim.payoutAmountInr
                          : typeof claim.aiPrediction?.estimatedLossInr === "number" && claim.aiPrediction.estimatedLossInr > 0
                            ? claim.aiPrediction.estimatedLossInr
                            : 0;
                      if (!isVerified || amount <= 0) return null;
                      return (
                        <div className="mt-2 overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/70">
                          <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                              </span>
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                                  {lang === "hi" ? "स्वीकृत दावा राशि" : "Approved payout"}
                                </div>
                                <div className="mt-0.5 text-[11px] leading-snug text-emerald-700">
                                  {lang === "hi" ? "डीबीटी बैंक खाते में स्वीकृत" : "Sanctioned to DBT bank account"}
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0 pl-10 sm:pl-0 sm:text-right">
                              <div className="font-mono text-lg font-extrabold tabular-nums text-emerald-900">
                                ₹{amount.toLocaleString("en-IN")}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  </div>

                  {/* Right side: 3-Photo Evidence Thumbnails & Action Buttons */}
                  <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    {/* 3 Thumbnails */}
                    <div className="flex items-center gap-1.5">
                      {claim.images.slice(0, 3).map((img, idx) => (
                        <div
                          key={idx}
                          className="relative h-12 w-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 group shrink-0"
                          title={img.angleType}
                        >
                          {safeDisplayUrl(img.imageUrl) ? (
                            <img
                              src={safeDisplayUrl(img.imageUrl)}
                              alt={img.angleType}
                              className="h-full w-full object-cover group-hover:scale-110 transition-transform"
                            />
                          ) : null}
                          {!img.qualityPassed && (
                            <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center">
                              <AlertCircle className="h-4 w-4 text-white" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* CTAs */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      {isRecapture ? (
                        <Link
                          href={`/farmer/capture?recapture=${claim.id}&angles=${claim.missingAngles?.join(",") || "closeup_damage,mid_canopy"}`}
                          className="fp-btn-primary flex-1 gap-1.5 px-4 py-2 text-xs sm:flex-initial"
                        >
                          <Camera className="h-3.5 w-3.5" />
                          <span>{t.startRecaptureNow}</span>
                        </Link>
                      ) : null}

                      <Link
                        href={`/farmer/claims/${claim.id}`}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 sm:flex-initial"
                      >
                        <Eye className="h-3.5 w-3.5 text-slate-500" />
                        <span>{t.viewDetails}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FarmerClaimsPage() {
  return (
    <Suspense fallback={<CardSkeleton count={3} className="space-y-4 !grid-cols-1" />}>
      <FarmerClaimsContent />
    </Suspense>
  );
}
