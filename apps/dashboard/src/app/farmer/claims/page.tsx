"use client";

import React, { useState } from "react";
import Link from "next/link";
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
import clsx from "clsx";

export default function FarmerClaimsPage() {
  const { lang, claims } = useFarmerData();
  const t = getFarmerT(lang);

  const [activeFilter, setActiveFilter] = useState<"all" | "under_review" | "needs_recapture" | "verified" | "draft">("all");
  const [searchQuery, setSearchQuery] = useState("");

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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      {/* Header & New Claim Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-emerald-800" />
            <span>{t.claims}</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            {lang === "hi"
              ? "आपके सभी सक्रिय, सत्यापित और समीक्षाधीन फसल बीमा दावों की सूची"
              : "Complete record of all active, verified, and pending PMFBY crop damage claims"}
          </p>
        </div>

        <Link
          href="/farmer/capture"
          className="fp-btn-primary gap-2 shrink-0"
        >
          <Camera className="h-4 w-4" />
          <span>{t.quickActionNewClaim}</span>
        </Link>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl border border-slate-200">
          {filterTabs.map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveFilter(tab.key)}
                className={clsx(
                  "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  isActive
                    ? "bg-white text-emerald-950 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                    isActive
                      ? "fp-badge-ok font-bold"
                      : tab.alert && tab.count > 0
                      ? "fp-badge-alert"
                      : "bg-slate-300 text-slate-700"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Box */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchClaims}
            className="fp-input mt-0 w-full pl-9 text-xs"
          />
        </div>
      </div>

      {/* Claims List Grid */}
      {filteredClaims.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <h3 className="text-sm font-bold text-slate-700">{t.noClaimsFound}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {lang === "hi"
              ? "कृपया कोई अन्य फ़िल्टर चुनें या नया दावा दर्ज करें।"
              : "Try switching filters or search terms, or file a new crop damage claim."}
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

            return (
              <div
                key={claim.id}
                className={clsx(
                  "rounded-xl border bg-white p-5 shadow-xs transition-all hover:shadow-md",
                  isRecapture
                    ? "border-amber-300 bg-amber-50/20"
                    : isVerified
                    ? "border-emerald-200"
                    : "border-slate-200"
                )}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-900">
                        {claim.id}
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
                        {lang === "hi" ? claim.cropTypeHi : claim.cropType} ({claim.cropVariety})
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
                    {isVerified && claim.payoutAmountInr && (
                      <div className="fp-panel mt-2 flex items-center justify-between p-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                          <span className="font-semibold">
                            {lang === "hi" ? "दावा स्वीकृत राशि:" : "Approved Claim Payout:"}
                          </span>
                        </div>
                        <span className="font-mono text-sm font-bold text-emerald-900">
                          ₹{claim.payoutAmountInr.toLocaleString("en-IN")}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right side: 5-Angle Photo Thumbnails & Action Buttons */}
                  <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    {/* 5 Thumbnails */}
                    <div className="flex items-center gap-1.5">
                      {claim.images.slice(0, 5).map((img, idx) => (
                        <div
                          key={idx}
                          className="relative h-12 w-12 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 group shrink-0"
                          title={img.angleType}
                        >
                          <img
                            src={img.imageUrl}
                            alt={img.angleType}
                            className="h-full w-full object-cover group-hover:scale-110 transition-transform"
                          />
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
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors shadow-2xs"
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
