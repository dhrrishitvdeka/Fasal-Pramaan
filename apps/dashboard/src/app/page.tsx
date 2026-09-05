"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { listClaims, type Submission } from "@/lib/api";
import { LANDING_ACTIONS } from "@/lib/landing-actions";
import {
  PERIL_OPTIONS,
  ROUTE_CONFIG,
  normalizePeril,
  routeForPeril,
  type Peril,
} from "@/lib/claim-routing";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useLanguage } from "@/lib/LanguageContext";
import { getLandingT } from "@/lib/landing-locales";
import { TableSkeleton } from "@/components/LoadingAnimation";
import ErrorMessage from "@/components/ErrorMessage";
import {
  Sprout,
  Camera,
  ShieldCheck,
  CloudRain,
  Compass,
  Flame,
  Bug,
  Waves,
  SunMedium,
  Wind,
  Layers,
} from "lucide-react";

const PERIL_ICONS: Record<Peril, React.ComponentType<{ className?: string }>> = {
  normal: Layers,
  fire_burn: Flame,
  animal_damage: Compass,
  flood: Waves,
  drought: SunMedium,
  pest_disease: Bug,
  hailstorm: CloudRain,
  lodging: Wind,
};

/** Distinct accent color per peril for the circular intake buttons. */
const PERIL_COLORS: Record<Peril, { circle: string; label: string }> = {
  normal: { circle: "bg-emerald-700 hover:bg-emerald-800", label: "text-emerald-800 dark:text-emerald-400" },
  fire_burn: { circle: "bg-red-700 hover:bg-red-800", label: "text-red-800 dark:text-red-400" },
  animal_damage: { circle: "bg-amber-700 hover:bg-amber-800", label: "text-amber-800 dark:text-amber-400" },
  flood: { circle: "bg-blue-700 hover:bg-blue-800", label: "text-blue-800 dark:text-blue-400" },
  drought: { circle: "bg-orange-700 hover:bg-orange-800", label: "text-orange-800 dark:text-orange-400" },
  pest_disease: { circle: "bg-fuchsia-700 hover:bg-fuchsia-800", label: "text-fuchsia-800 dark:text-fuchsia-400" },
  hailstorm: { circle: "bg-sky-700 hover:bg-sky-800", label: "text-sky-800 dark:text-sky-400" },
  lodging: { circle: "bg-violet-700 hover:bg-violet-800", label: "text-violet-800 dark:text-violet-400" },
};

export default function HomePage() {
  const { lang } = useLanguage();
  const t = getLandingT(lang);
  const [claims, setClaims] = useState<Submission[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchRecent = () => {
    setLoaded(false);
    setFetchError(null);
    listClaims()
      .then((items) => {
        setClaims(items.slice(0, 8));
      })
      .catch((err) => {
        setClaims([]);
        setFetchError(err instanceof Error ? err.message : "Network error");
      })
      .finally(() => {
        setLoaded(true);
      });
  };

  useEffect(() => {
    fetchRecent();
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-3 pb-6 pt-3 sm:px-6 sm:pb-12 sm:pt-8 md:pb-16 md:pt-10">
      {/* Hero Header */}
      <header className="flex flex-col border-b border-[var(--line)] py-8 sm:py-10">
        <div className="grid items-center gap-6 md:grid-cols-12 md:gap-10">
          <div className="order-2 min-w-0 md:order-1 md:col-span-7">
        <h1 className="mt-0 text-balance break-words text-[1.85rem] font-serif font-medium leading-[1.16] tracking-tight text-[var(--ink)] sm:mt-5 sm:text-4xl sm:leading-[1.25] lg:text-[3.25rem] lg:leading-[1.2]">
          {t.heroTitle}
        </h1>

        <p className="mt-4 max-w-3xl break-words text-[0.82rem] leading-[1.55] text-[var(--ink-muted)] sm:mt-5 sm:text-base sm:leading-relaxed md:text-lg">
          {t.heroSub}
        </p>

        {/* Primary Action Buttons */}
        <div className="mt-6 flex flex-col gap-2.5 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3.5">
          <Link
            href="/farmer/saathi"
            className="group inline-flex h-10 min-h-10 w-full min-w-0 items-center justify-center gap-2.5 rounded-2xl border border-[var(--ink)] bg-[var(--ink)] px-4 py-2 text-center text-xs font-semibold text-[var(--surface)] shadow-xs transition-all hover:bg-[var(--accent)] hover:border-[var(--accent)] sm:h-auto sm:min-h-11 sm:w-auto sm:px-6 sm:py-2.5 sm:text-sm"
          >
            <Sprout className="h-4 w-4 shrink-0 text-emerald-400 transition-transform group-hover:scale-110" />
            <span>{t.startSaathi}</span>
          </Link>

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-3">
            <Link
              href="/farmer"
              className="inline-flex h-10 min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-center text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--ink)] hover:bg-[var(--canvas)] sm:h-auto sm:min-h-11 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <Camera className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" />
              <span>Farmer</span>
            </Link>

            <Link
              href="/overview"
              className="inline-flex h-10 min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-center text-xs font-medium text-[var(--ink)] transition-colors hover:border-[var(--ink)] hover:bg-[var(--canvas)] sm:h-auto sm:min-h-11 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              <span>Reviewer</span>
            </Link>
          </div>
        </div>
          </div>

          {/* Hero illustration — transparent PNG, blends with the page background */}
          <div className="order-1 min-w-0 md:order-2 md:col-span-5">
            <Image
              src="/farmer-sowing.png"
              alt={lang === "hi" ? "बीज बोता हुआ किसान" : "Farmer sowing seeds by hand"}
              width={1217}
              height={1293}
              priority
              sizes="(max-width: 639px) 52vw, (max-width: 768px) 78vw, 380px"
              className="mx-auto h-auto w-[52vw] max-w-[190px] sm:w-full sm:max-w-[300px] md:max-w-[380px]"
            />
          </div>
        </div>
      </header>

      {/* 8 Perils Quick Intake — circular color-coded buttons */}
      <section className="mt-16 border-b border-[var(--line)] pb-16 sm:mt-18 sm:pb-16 md:mt-20 md:pb-20">
        <div className="text-center">
          <span className="fp-kicker text-[10px] font-mono sm:text-xs">{t.perilsKicker}</span>
          <h2 className="fp-page-title mt-1 text-base font-semibold sm:mt-1.5 sm:text-xl">
            {t.perilsTitle}
          </h2>
          <p className="mx-auto mt-1.5 max-w-xl text-[11px] leading-relaxed text-[var(--ink-muted)] sm:mt-2 sm:text-sm">
            {t.perilsSub}
          </p>
        </div>

        <div className="mx-auto mt-6 grid max-w-3xl grid-cols-2 items-start justify-items-center gap-x-3 gap-y-6 sm:mt-8 sm:grid-cols-4 sm:gap-x-10 sm:gap-y-8">
          {PERIL_OPTIONS.map((item) => {
            const cfg = ROUTE_CONFIG[item.value];
            const Icon = PERIL_ICONS[item.value] || Layers;
            const color = PERIL_COLORS[item.value];
            const pInfo = t.perilLabels[item.value] || { title: item.en, desc: cfg.descriptionEn };
            return (
              <Link
                key={item.value}
                href={`/farmer/saathi?peril=${item.value}`}
                title={pInfo.desc}
                className="group flex w-20 flex-col items-center gap-2.5 text-center sm:w-24"
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-md transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg sm:h-[4.5rem] sm:w-[4.5rem] ${color.circle}`}
                >
                  <Icon className="h-7 w-7 transition-transform duration-200 group-hover:scale-110" />
                </span>
                <span className={`text-sm font-semibold leading-tight ${color.label}`}>
                  {pInfo.title}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent Claims Live Queue */}
      <section className="mt-10 pb-8 sm:mt-14 sm:pb-12 md:mt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="fp-page-title text-xl font-semibold sm:text-2xl">{t.recentClaimsTitle}</h2>
            <p className="fp-page-sub mt-1.5 text-xs sm:text-sm">
              {isSupabaseConfigured()
                ? t.recentClaimsSubConnected
                : t.recentClaimsSubDemo}
            </p>
          </div>
          <Link href="/review" className="fp-link fp-ui text-sm font-medium">
            {t.openQueueLink}
          </Link>
        </div>

        {!loaded ? (
          <TableSkeleton rows={4} cols={6} className="mt-6" />
        ) : fetchError ? (
          <ErrorMessage
            title="Unable to load recent claims · हाल के दावे लोड नहीं हो सके"
            message="Something went wrong while retrieving records from the database. Please verify your connection and try again."
            onRetry={fetchRecent}
            className="mt-6"
          />
        ) : claims.length === 0 ? (
          <div className="mt-6 border border-[var(--line)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--ink-muted)]">
            <p>
              {t.noClaims}
            </p>
            <Link href="/farmer/saathi" className="fp-btn-primary mt-4 inline-flex">
              {t.launchSaathi}
            </Link>
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto border border-[var(--line)] bg-[var(--surface)]">
            <table className="fp-table">
              <thead>
                <tr>
                  <th>{t.thId}</th>
                  <th>{t.thPeril}</th>
                  <th>{t.thCrop}</th>
                  <th>{t.thStatus}</th>
                  <th>{t.thConfidence}</th>
                  <th className="text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => {
                  const peril = normalizePeril(claim.peril);
                  const pInfo = t.perilLabels[peril];
                  const conf =
                    claim.evidence_evaluation?.confidence?.final ??
                    claim.latest_evaluation?.confidence?.final ??
                    (claim.latest_prediction?.overall_confidence != null
                      ? Math.round(claim.latest_prediction.overall_confidence * 100)
                      : 0);
                  const isPending =
                    claim.status === "under_review" ||
                    claim.status === "pending_review" ||
                    claim.status === "submitted" ||
                    claim.status === "needs_recapture" ||
                    claim.status === "recaptured";
                  return (
                    <tr key={claim.id}>
                      <td className="font-mono text-xs font-semibold">{claim.id.slice(0, 12)}</td>
                      <td>
                        <span className="rounded-sm bg-[var(--canvas)] px-2 py-0.5 text-xs font-medium text-[var(--ink)]">
                          {pInfo?.title || claim.peril || "—"}
                        </span>
                      </td>
                      <td>{claim.latest_prediction?.predicted_crop || "—"}</td>
                      <td>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium capitalize ${
                            isPending
                              ? "text-amber-700 dark:text-amber-500"
                              : claim.status === "accepted"
                              ? "text-emerald-700 dark:text-emerald-500"
                              : "text-[var(--ink-muted)]"
                          }`}
                        >
                          {claim.status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="font-mono text-xs">
                        {conf > 0 ? (
                          <span className={conf >= 75 ? "font-bold text-emerald-700" : "text-[var(--ink-muted)]"}>
                            {conf}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-right">
                        <Link href={`/review/${claim.id}`} className="fp-link font-medium">
                          {t.btnReview}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
