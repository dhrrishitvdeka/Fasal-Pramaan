"use client";

import React, { Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  MapPin,
  Calendar,
  Layers,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  Hash,
  Activity,
  Check,
  X,
  AlertCircle,
  Download,
  Share2,
} from "lucide-react";
import { useFarmerData, ClaimImageEvidence } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import { safeDisplayUrl } from "@/lib/media";
import { DetailSkeleton } from "@/components/LoadingAnimation";
import ErrorMessage from "@/components/ErrorMessage";
import clsx from "clsx";

function FarmerClaimDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, getClaimById, farmerProfile, isLoading } = useFarmerData();
  const t = getFarmerT(lang);

  const claimId = (params?.id as string) || "";
  const claim = getClaimById(claimId);
  const justRecaptured = searchParams.get("recaptured") === "true";
  const justSubmitted = searchParams.get("submitted") === "true";

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [selectedImage, setSelectedImage] = useState<ClaimImageEvidence | null>(null);

  const selectedIndex = selectedImage && claim?.images
    ? claim.images.findIndex((img) => img.angleType === selectedImage.angleType)
    : -1;

  const hasPrev = selectedIndex > 0;
  const hasNext = Boolean(claim?.images && selectedIndex >= 0 && selectedIndex < claim.images.length - 1);

  const showPrevImage = () => {
    if (hasPrev && claim?.images) {
      setSelectedImage(claim.images[selectedIndex - 1]);
    }
  };

  const showNextImage = () => {
    if (hasNext && claim?.images) {
      setSelectedImage(claim.images[selectedIndex + 1]);
    }
  };

  useEffect(() => {
    if (!selectedImage) return;

    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setSelectedImage(null);
      } else if (e.key === "ArrowLeft") {
        e.stopPropagation();
        if (claim?.images && selectedIndex > 0) {
          setSelectedImage(claim.images[selectedIndex - 1]);
        }
      } else if (e.key === "ArrowRight") {
        e.stopPropagation();
        if (claim?.images && selectedIndex >= 0 && selectedIndex < claim.images.length - 1) {
          setSelectedImage(claim.images[selectedIndex + 1]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = origOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedImage, selectedIndex, claim?.images]);

  if (isLoading) {
    return <DetailSkeleton className="py-6" />;
  }

  if (!claim) {
    return (
      <div className="py-8">
        <ErrorMessage
          title={lang === "hi" ? "दावा नहीं मिला" : "Claim Record Not Found"}
          message={
            lang === "hi"
              ? `आईडी ${claimId} के साथ कोई दावा मौजूद नहीं है।`
              : `No claim found with ID ${claimId}. It may have been archived or removed.`
          }
          actionHref="/farmer/claims"
          actionLabel={t.backToClaims}
        />
      </div>
    );
  }

  const isRecapture = claim.status === "needs_recapture";
  const isVerified = claim.status === "verified";
  const isUnderReview = claim.status === "under_review" || claim.status === "submitted";

  // Adaptive recapture result: confidence change vs previous stored evaluation
  const adaptiveStored = (claim.adaptive_result ?? null) as {
    confidence_delta?: unknown;
    previousConfidence?: unknown;
  } | null;
  const storedDelta =
    typeof adaptiveStored?.confidence_delta === "number" ? (adaptiveStored.confidence_delta as number) : null;
  const storedPrev =
    typeof adaptiveStored?.previousConfidence === "number"
      ? (adaptiveStored.previousConfidence as number)
      : null;

  const missingAnglesStr = claim.missingAngles?.join(",") || "closeup_damage,mid_canopy";

  return (
    <div className="space-y-4">
      {/* Back Button & Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <Link
          href="/farmer/claims"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t.backToClaims}</span>
        </Link>

        <div className="flex max-w-full items-center gap-2 font-mono text-xs text-slate-500">
          <span className="shrink-0">{t.claimId}:</span>
          <strong className="truncate text-slate-900">{claim.id}</strong>
        </div>
      </div>

      {/* Success Toasts on Redirect */}
      {justSubmitted && (
        <div className="fp-panel flex items-center gap-3 p-4">
          <CheckCircle2 className="h-6 w-6 text-emerald-700 shrink-0" />
          <div>
            <div className="font-bold text-sm text-emerald-900">
              {lang === "hi" ? "दावा सफलतापूर्वक जमा हुआ!" : "Claim Submitted Successfully!"}
            </div>
            <div className="text-xs text-emerald-800">
              {lang === "hi"
                ? "आपके 3-फ़ोटो साक्ष्य को क्रिप्टोग्राफिक हैश के साथ सुरक्षित कर लिया गया है। AI विश्लेषण जारी है।"
                : "Your 3-photo photographic evidence has been securely hashed and queued for verification."}
            </div>
          </div>
        </div>
      )}

      {justRecaptured && (
        <div className="fp-panel flex items-center gap-3 p-4">
          <CheckCircle2 className="h-6 w-6 text-emerald-700 shrink-0" />
          <div>
            <div className="font-bold text-sm text-emerald-900">
              {lang === "hi" ? "लक्षित पुनः फोटो सफलतापूर्वक प्राप्त!" : "Targeted Retake Submitted!"}
            </div>
            <div className="text-xs text-emerald-800">
              {lang === "hi"
                ? "पुनः ली गई तस्वीरें सत्यापित हो गई हैं और अधिकारी समीक्षा कतार में भेज दी गई हैं।"
                : "The updated angles resolved previous uncertainty and have moved to the final verification queue."}
            </div>
          </div>
        </div>
      )}

      {/* Main Status Header Card */}
      <div className="fp-panel p-4 sm:p-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center md:gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  "px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
                  isVerified && "fp-badge-ok",
                  isRecapture && "fp-badge-alert",
                  isUnderReview && "fp-badge-neutral",
                )}
              >
                {isVerified
                  ? t.statusVerified
                  : isRecapture
                  ? t.statusNeedsRecapture
                  : t.statusUnderReview}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                {t.submittedOn} {new Date(claim.createdAt).toLocaleDateString()}
              </span>
            </div>

            <h1 className="text-lg font-bold text-slate-900 sm:text-2xl">
              {lang === "hi" ? (claim.plotNameHi || claim.plotName) : claim.plotName} ·{" "}
              <span className="font-semibold text-[var(--ink)]">
                {lang === "hi" ? (claim.cropTypeHi || claim.cropType) : claim.cropType}
                {claim.cropVariety ? ` (${claim.cropVariety})` : ""}
              </span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {isVerified
                ? lang === "hi"
                  ? "बीमा अधिकारी द्वारा आपके 3-फ़ोटो साक्ष्य को पूर्ण रूप से सत्यापित कर दिया गया है। दावा राशि सीधे डीबीटी खाते में भेजी जा रही है।"
                  : "Reviewing officer has officially verified your 3-photo photographic evidence. The sanctioned payout is being dispatched via Direct Benefit Transfer (DBT)."
                : isRecapture
                ? lang === "hi"
                  ? "समीक्षा अधिकारी को अंतिम स्वीकृति हेतु विशिष्ट कोणों की पुनः फोटो चाहिए।"
                  : "The reviewing officer requires clearer photos of specific angles to sanction your claim."
                : lang === "hi"
                ? "आपका दावा AI विश्लेषण व अधिकारी समीक्षा कतार में है।"
                : "Your claim has passed automated cryptographic checks and is in the active human verification queue."}
            </p>
          </div>

          {/* Right Payout / CTA Box */}
          <div className="shrink-0 flex flex-col items-start md:items-end justify-center">
            {isVerified && typeof claim.payoutAmountInr === "number" && claim.payoutAmountInr > 0 && (
              <div className="fp-panel p-4 text-left md:text-right">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {t.recommendedPayout}
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-emerald-800 font-mono">
                  ₹{claim.payoutAmountInr.toLocaleString("en-IN")}
                </div>
                <div className="mt-1 text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{lang === "hi" ? "डीबीटी बैंक खाता सत्यापित" : "DBT Bank Sanctioned"}</span>
                </div>
              </div>
            )}

            {isRecapture && (
              <Link
                href={`/farmer/capture?recapture=${claim.id}&angles=${missingAnglesStr}`}
                className="fp-btn-primary w-full gap-2 px-4 py-3 sm:w-auto sm:px-6"
              >
                <Camera className="h-4 w-4" />
                <span>{t.startTargetedRecaptureCTA}</span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* If Needs Recapture: Specific Warning & Missing Angle Instructions Card */}
      {isRecapture && (
        <div className="fp-panel space-y-4 border-[var(--ink)] p-3 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-amber-950">
                {t.recaptureAlertTitle}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-amber-900">
                {t.recaptureAlertDesc}
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-white p-4 border border-amber-200 space-y-2">
            <div className="text-xs font-bold text-amber-900 uppercase tracking-wider">
              {lang === "hi" ? "अधिकारी की विस्तृत टिप्पणी:" : "Reviewer Instructions:"}
            </div>
            <p className="text-xs sm:text-sm text-slate-800 font-medium leading-relaxed">
              {lang === "hi" ? (claim.recaptureReasonHi || claim.recaptureReason) : claim.recaptureReason}
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-2 text-xs text-amber-800">
              <span className="font-bold">
                {lang === "hi" ? "अपेक्षित कोण:" : "Requested Angles:"}
              </span>
              {claim.missingAngles?.map((angle) => (
                <span
                  key={angle}
                  className="rounded-md bg-amber-100 px-2.5 py-1 font-mono font-bold text-amber-900 border border-amber-300"
                >
                  {angle}
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Link
              href={`/farmer/capture?recapture=${claim.id}&angles=${missingAnglesStr}`}
              className="fp-btn-primary w-full gap-2 px-5 py-2.5 text-xs sm:w-auto sm:text-sm"
            >
              <Camera className="h-4 w-4" />
              <span>{t.startTargetedRecaptureCTA}</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* 2-Column Grid: Evidence Trust Card & AI Damage Prediction */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Evidence Trust Confidence Card */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-3 shadow-xs sm:p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-800" />
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                {t.evidenceTrustScore}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="fp-badge-neutral font-mono text-sm">
                {claim.evidenceTrust.overallConfidence}%
              </span>
              {storedDelta != null && storedDelta !== 0 && (
                <span
                  className={clsx(
                    "rounded border px-1.5 py-0.5 text-[10px] font-bold",
                    storedDelta > 0
                      ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                      : "border-amber-300 bg-amber-100 text-amber-800",
                  )}
                  title={
                    lang === "hi"
                      ? "पुनः फोटो के बाद विश्वास स्तर में बदलाव"
                      : "Confidence change after recapture"
                  }
                >
                  {storedDelta > 0
                    ? lang === "hi"
                      ? `▲ +${storedDelta.toFixed(1)} पुनः कैप्चर के बाद`
                      : `▲ +${storedDelta.toFixed(1)} after recapture`
                    : `▼ ${storedDelta.toFixed(1)}`}
                  {storedPrev != null && (
                    <span className="ml-1 font-normal">
                      ({lang === "hi" ? "पहले" : "prev"} {storedPrev})
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {/* Quality Pillar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-700">{t.trustQuality}</span>
                <span className="font-mono font-bold text-slate-900">
                  {claim.evidenceTrust.qualityScore}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={clsx(
                    "h-full rounded-full",
                    claim.evidenceTrust.qualityScore >= 80 ? "bg-[var(--ink)]" : "bg-[var(--ink-muted)]"
                  )}
                  style={{ width: `${claim.evidenceTrust.qualityScore}%` }}
                />
              </div>
              {claim.evidenceTrust.qualityNotes && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {claim.evidenceTrust.qualityNotes}
                </p>
              )}
            </div>

            {/* Coverage Pillar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-700">{t.trustCoverage}</span>
                <span className="font-mono font-bold text-slate-900">
                  {claim.evidenceTrust.coverageScore}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={clsx(
                    "h-full rounded-full",
                    claim.evidenceTrust.coverageScore >= 80 ? "bg-[var(--ink)]" : "bg-[var(--ink-muted)]"
                  )}
                  style={{ width: `${claim.evidenceTrust.coverageScore}%` }}
                />
              </div>
              {claim.evidenceTrust.coverageNotes && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {claim.evidenceTrust.coverageNotes}
                </p>
              )}
            </div>

            {/* Context & GPS Pillar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-700">{t.trustContext}</span>
                <span className="font-mono font-bold text-slate-900">
                  {claim.evidenceTrust.contextScore}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-[var(--ink)]"
                  style={{ width: `${claim.evidenceTrust.contextScore}%` }}
                />
              </div>
              {claim.evidenceTrust.contextNotes && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {claim.evidenceTrust.contextNotes}
                </p>
              )}
            </div>

            {/* Integrity / SHA-256 Pillar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-700">{t.trustIntegrity}</span>
                <span className="font-mono font-bold text-slate-900">
                  {claim.evidenceTrust.integrityScore}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-[var(--ink)]"
                  style={{ width: `${claim.evidenceTrust.integrityScore}%` }}
                />
              </div>
              {claim.evidenceTrust.integrityNotes && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {claim.evidenceTrust.integrityNotes}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* AI Damage Prediction Breakdown */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-3 shadow-xs sm:p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                {t.aiPredictionTitle}
              </h2>
            </div>
            <span className="fp-badge-neutral text-[10px]">
              {lang === "hi" ? "सहायक स्क्रीन" : "Assistive screen"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500 font-medium">{t.cropIdentified}</div>
              <div className="mt-1 font-bold text-slate-900">{claim.aiPrediction.cropIdentified}</div>
              <div className="text-[10px] text-slate-400 font-mono">
                {claim.aiPrediction.cropConfidence}%{" "}
                {lang === "hi" ? "विश्वास" : "confidence"}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500 font-medium">{t.detectedCondition}</div>
              <div className="mt-1 font-bold text-slate-900">
                {lang === "hi"
                  ? (claim.aiPrediction.diseaseDetectedHi || claim.aiPrediction.diseaseDetected)
                  : claim.aiPrediction.diseaseDetected}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {claim.aiPrediction.modelConfidence}%{" "}
                {lang === "hi" ? "विश्वास" : "confidence"}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500 font-medium">{t.severityScore}</div>
              <div className="mt-1 text-base font-extrabold text-emerald-800">
                {claim.aiPrediction.severityPercentage}%
              </div>
              <div className="text-[10px] text-slate-500">
                {lang === "hi" ? "ग्रेड: " : "Grade: "}
                {claim.aiPrediction.severityGrade}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500 font-medium">{t.affectedArea}</div>
              <div className="mt-1 text-base font-extrabold text-slate-900">
                {claim.aiPrediction.affectedAreaHectares} Ha
              </div>
              <div className="text-[10px] text-slate-500">
                {t.khasra}: {claim.khasraNumber}
              </div>
            </div>
          </div>

          {/* Farmer Observation Text */}
          <div className="fp-panel p-3 text-xs">
            <div className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider mb-1">
              {lang === "hi" ? "किसान का मूल विवरण:" : "Farmer Observation Notes:"}
            </div>
            <p className="text-slate-700 italic">
              "
              {claim.farmerObservations ||
                (lang === "hi" ? "कोई टिप्पणी नहीं।" : "No notes provided.")}
              "
            </p>
          </div>
        </div>
      </div>

      {/* Captured Evidence Photos Gallery */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-3 shadow-xs sm:p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-emerald-800" />
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              {t.capturedEvidencePhotos}
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {claim.images.length} / 3 {lang === "hi" ? "फ़ोटो संग्रहीत" : "photos stored"}
          </span>
        </div>

        {/* 3-Photo Evidence Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3.5">
          {claim.images.map((img, idx) => {
            const isAngleMissing =
              claim.missingAngles && claim.missingAngles.includes(img.angleType);

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedImage(img)}
                aria-label={`${lang === "hi" ? "फोटो बड़ी देखें" : "View photo"}: ${img.angleType.replaceAll("_", " ")}`}
                className={clsx(
                  "block w-full cursor-pointer rounded-lg border overflow-hidden bg-slate-50 text-left transition-all hover:shadow-md group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]",
                  isAngleMissing ? "border-amber-400 ring-2 ring-amber-300" : "border-slate-200"
                )}
              >
                <div className="relative aspect-4/3 overflow-hidden bg-slate-200">
                  {safeDisplayUrl(img.imageUrl) ? (
                    <img
                      src={safeDisplayUrl(img.imageUrl)}
                      alt={img.angleType}
                      loading="lazy"
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : null}
                  <div className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white font-mono uppercase">
                    {img.angleType}
                  </div>
                  {!img.qualityPassed && (
                    <div className="absolute top-2 right-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      <span>{lang === "hi" ? "अस्पष्ट" : "Retake"}</span>
                    </div>
                  )}
                </div>

                <div className="p-2.5 text-[11px] space-y-1 bg-white">
                  <div className="font-semibold text-slate-800 capitalize truncate">
                    {img.angleType.replace("_", " ")}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                    <span>
                      {img.lat != null && img.lon != null
                        ? `${img.lat.toFixed(4)}, ${img.lon.toFixed(4)} (±${img.accuracyM ?? "?"}m)`
                        : lang === "hi"
                          ? "GPS उपलब्ध नहीं"
                          : "GPS unavailable"}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono truncate">
                    SHA: {img.sha256 ? `${img.sha256.substring(0, 16)}…` : lang === "hi" ? "उपलब्ध नहीं" : "unavailable"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lightbox Image Modal Preview — Portaled to body with full screen blur & AMOLED black theme */}
      {selectedImage && mounted && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 md:p-6 transition-all duration-200"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.70)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
          }}
          onClick={() => setSelectedImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label={lang === "hi" ? "फोटो पूर्वावलोकन" : "Photo preview"}
        >
          <div
            className="relative flex flex-col w-full max-w-4xl max-h-[92vh] sm:max-h-[88vh] overflow-hidden rounded-2xl bg-black border border-neutral-800 shadow-2xl shadow-black"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pure AMOLED Black Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 bg-black px-4 py-3 text-white">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/70 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/30">
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  {selectedImage.angleType.replaceAll("_", " ")}
                </span>
                {selectedIndex >= 0 && (
                  <span className="text-xs text-neutral-400 font-mono">
                    ({selectedIndex + 1} / {claim.images.length})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={showPrevImage}
                  disabled={!hasPrev}
                  aria-label={lang === "hi" ? "पिछली फोटो" : "Previous photo"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  title={lang === "hi" ? "पिछली फोटो (←)" : "Previous (←)"}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={showNextImage}
                  disabled={!hasNext}
                  aria-label={lang === "hi" ? "अगली फोटो" : "Next photo"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  title={lang === "hi" ? "अगली फोटो (→)" : "Next (→)"}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <div className="mx-1 h-4 w-px bg-neutral-800" />

                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  aria-label={lang === "hi" ? "बंद करें" : "Close photo preview"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-rose-950/60 hover:border-rose-700/60 hover:text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white transition-colors"
                  title={lang === "hi" ? "बंद करें (Esc)" : "Close (Esc)"}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Pure AMOLED Black Stage: Contained Image with Optional Arrow Overlays */}
            <div className="relative flex-1 min-h-[260px] max-h-[58vh] sm:max-h-[64vh] bg-black flex items-center justify-center p-3 sm:p-4 overflow-hidden select-none">
              {safeDisplayUrl(selectedImage.imageUrl) ? (
                <img
                  src={safeDisplayUrl(selectedImage.imageUrl)}
                  alt={selectedImage.angleType}
                  className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-neutral-500 text-xs">
                  <Camera className="h-10 w-10 mb-2 opacity-40" />
                  <span>{lang === "hi" ? "फोटो लोड नहीं हो सकी" : "Photo could not be loaded"}</span>
                </div>
              )}

              {/* Side Floating Arrow Buttons */}
              {hasPrev && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    showPrevImage();
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-white hover:bg-neutral-900 hover:scale-105 backdrop-blur-md border border-neutral-800 transition-all shadow-xl"
                  aria-label={lang === "hi" ? "पिछली फोटो" : "Previous photo"}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {hasNext && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    showNextImage();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-white hover:bg-neutral-900 hover:scale-105 backdrop-blur-md border border-neutral-800 transition-all shadow-xl"
                  aria-label={lang === "hi" ? "अगली फोटो" : "Next photo"}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}

              {/* Quality indicator badge */}
              <div className="absolute bottom-3 left-3">
                {selectedImage.qualityPassed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/85 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400 backdrop-blur-md">
                    <CheckCircle2 className="h-3 w-3" />
                    {lang === "hi" ? "गुणवत्ता सत्यापित" : "Quality Verified"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/85 border border-amber-500/40 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400 backdrop-blur-md">
                    <AlertTriangle className="h-3 w-3" />
                    {lang === "hi" ? "पुनः लें (गुणवत्ता अस्पष्ट)" : "Retake Requested"}
                  </span>
                )}
              </div>
            </div>

            {/* Pure AMOLED Black Modal Footer Metadata Drawer */}
            <div className="border-t border-neutral-800 bg-black px-4 py-3 text-xs text-neutral-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-neutral-400">
                  <div className="flex items-center gap-1.5 text-neutral-200">
                    <MapPin className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span>
                      {selectedImage.lat != null && selectedImage.lon != null
                        ? `${selectedImage.lat.toFixed(5)}, ${selectedImage.lon.toFixed(5)}`
                        : "GPS N/A"}
                    </span>
                    {selectedImage.accuracyM != null && (
                      <span className="text-[10px] text-neutral-500">(±{selectedImage.accuracyM}m)</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                    <span>{new Date(selectedImage.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                {selectedImage.sha256 && (
                  <div
                    className="flex items-center gap-1.5 rounded bg-neutral-900 border border-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400 max-w-full sm:max-w-xs truncate"
                    title={`SHA-256: ${selectedImage.sha256}`}
                  >
                    <ShieldCheck className="h-3 w-3 text-emerald-400 shrink-0" />
                    <span className="truncate">SHA: {selectedImage.sha256}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function FarmerClaimDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton className="py-6" />}>
      <FarmerClaimDetailContent />
    </Suspense>
  );
}
