"use client";

import React, { useState } from "react";
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
import clsx from "clsx";

export default function FarmerClaimDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { lang, getClaimById, farmerProfile } = useFarmerData();
  const t = getFarmerT(lang);

  const claimId = (params?.id as string) || "";
  const claim = getClaimById(claimId);
  const justRecaptured = searchParams.get("recaptured") === "true";
  const justSubmitted = searchParams.get("submitted") === "true";

  const [selectedImage, setSelectedImage] = useState<ClaimImageEvidence | null>(null);

  if (!claim) {
    return (
      <div className="py-12 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-slate-400 mb-3" />
        <h2 className="text-lg font-bold text-slate-800">
          {lang === "hi" ? "दावा नहीं मिला" : "Claim Record Not Found"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {lang === "hi"
            ? `आईडी ${claimId} के साथ कोई दावा मौजूद नहीं है।`
            : `No claim found with ID ${claimId}.`}
        </p>
        <Link
          href="/farmer/claims"
          className="fp-btn-primary mt-4 gap-2 text-xs"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t.backToClaims}</span>
        </Link>
      </div>
    );
  }

  const isRecapture = claim.status === "needs_recapture";
  const isVerified = claim.status === "verified";
  const isUnderReview = claim.status === "under_review" || claim.status === "submitted";

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
                ? "आपके 5-कोण साक्ष्य को क्रिप्टोग्राफिक हैश के साथ सुरक्षित कर लिया गया है। AI विश्लेषण जारी है।"
                : "Your 5-angle photographic evidence has been securely hashed and queued for verification."}
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
              {lang === "hi" ? claim.plotNameHi : claim.plotName} ·{" "}
              <span className="font-semibold text-[var(--ink)]">
                {lang === "hi" ? claim.cropTypeHi : claim.cropType} ({claim.cropVariety})
              </span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {isVerified
                ? lang === "hi"
                  ? "बीमा अधिकारी द्वारा आपके 5-कोण साक्ष्य को पूर्ण रूप से सत्यापित कर दिया गया है। दावा राशि सीधे डीबीटी खाते में भेजी जा रही है।"
                  : "Reviewing officer has officially verified your 5-angle photographic evidence. The sanctioned payout is being dispatched via Direct Benefit Transfer (DBT)."
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
            {isVerified && claim.payoutAmountInr && (
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
              {lang === "hi" ? claim.recaptureReasonHi : claim.recaptureReason}
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
            <span className="fp-badge-neutral font-mono text-sm">
              {claim.evidenceTrust.overallConfidence}%
            </span>
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
            <span className="fp-badge-neutral text-[10px]">Assistive screen</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500 font-medium">{t.cropIdentified}</div>
              <div className="mt-1 font-bold text-slate-900">{claim.aiPrediction.cropIdentified}</div>
              <div className="text-[10px] text-slate-400 font-mono">
                {claim.aiPrediction.cropConfidence}% confidence
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500 font-medium">{t.detectedCondition}</div>
              <div className="mt-1 font-bold text-slate-900">
                {lang === "hi"
                  ? claim.aiPrediction.diseaseDetectedHi
                  : claim.aiPrediction.diseaseDetected}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {claim.aiPrediction.modelConfidence}% confidence
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500 font-medium">{t.severityScore}</div>
              <div className="mt-1 text-base font-extrabold text-emerald-800">
                {claim.aiPrediction.severityPercentage}%
              </div>
              <div className="text-[10px] text-slate-500">
                Grade: {claim.aiPrediction.severityGrade}
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500 font-medium">{t.affectedArea}</div>
              <div className="mt-1 text-base font-extrabold text-slate-900">
                {claim.aiPrediction.affectedAreaHectares} Ha
              </div>
              <div className="text-[10px] text-slate-500">
                Plot Khasra: {claim.khasraNumber}
              </div>
            </div>
          </div>

          {/* Farmer Observation Text */}
          <div className="fp-panel p-3 text-xs">
            <div className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider mb-1">
              {lang === "hi" ? "किसान का मूल विवरण:" : "Farmer Observation Notes:"}
            </div>
            <p className="text-slate-700 italic">
              "{claim.farmerObservations || "No notes provided."}"
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
            {claim.images.length} / 5 {lang === "hi" ? "कोण संग्रहीत" : "canonical angles"}
          </span>
        </div>

        {/* 5-Angle Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {claim.images.map((img, idx) => {
            const isAngleMissing =
              claim.missingAngles && claim.missingAngles.includes(img.angleType);

            return (
              <div
                key={idx}
                onClick={() => setSelectedImage(img)}
                className={clsx(
                  "cursor-pointer rounded-lg border overflow-hidden bg-slate-50 transition-all hover:shadow-md group",
                  isAngleMissing ? "border-amber-400 ring-2 ring-amber-300" : "border-slate-200"
                )}
              >
                <div className="relative aspect-4/3 overflow-hidden bg-slate-200">
                  {safeDisplayUrl(img.imageUrl) ? (
                    <img
                      src={safeDisplayUrl(img.imageUrl)}
                      alt={img.angleType}
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
                    <MapPin className="h-2.5 w-2.5" />
                    <span>
                      {img.lat != null && img.lon != null
                        ? `${img.lat.toFixed(4)}, ${img.lon.toFixed(4)} (±${img.accuracyM ?? "?"}m)`
                        : "GPS unavailable"}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono truncate">
                    SHA: {img.sha256 ? `${img.sha256.substring(0, 16)}…` : "unavailable"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Image Modal Preview */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-t-xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-16/10 bg-black">
              {safeDisplayUrl(selectedImage.imageUrl) ? (
                <img
                  src={safeDisplayUrl(selectedImage.imageUrl)}
                  alt={selectedImage.angleType}
                  className="h-full w-full object-contain"
                />
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white hover:bg-black"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 bg-white text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-slate-900 uppercase font-mono">
                  {selectedImage.angleType}
                </span>
                <span className="text-slate-500 font-mono">
                  {new Date(selectedImage.timestamp).toLocaleString()}
                </span>
              </div>
              <div className="font-mono text-slate-600 break-all bg-slate-50 p-2 rounded border border-slate-200">
                <strong>SHA-256 Digest:</strong> {selectedImage.sha256 || "unavailable"}
              </div>
              <div className="flex items-center gap-4 text-slate-500 font-mono">
                <span>
                  <strong>Lat:</strong> {selectedImage.lat ?? "—"}
                </span>
                <span>
                  <strong>Lon:</strong> {selectedImage.lon ?? "—"}
                </span>
                <span>
                  <strong>GPS Accuracy:</strong>{" "}
                  {selectedImage.accuracyM != null ? `±${selectedImage.accuracyM}m` : "unavailable"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
