"use client";

import Link from "next/link";
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
  Cpu,
  Satellite,
  CloudRain,
  Compass,
  Flame,
  Bug,
  Waves,
  SunMedium,
  Wind,
  Layers,
  ArrowDown,
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
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-12 md:py-16">
      {/* Hero Header */}
      <header className="flex min-h-[calc(86vh-4rem)] flex-col justify-center border-b border-[var(--line)] py-10 sm:min-h-[calc(84vh-4.5rem)] sm:py-16 md:py-20">
        <div className="flex flex-wrap items-center gap-2">
          <span className="fp-kicker text-xs">{t.kicker} · {t.brandSub}</span>
          <span className="rounded bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
            {t.badgePortal}
          </span>
          <span className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--ink-muted)]">
            {t.badgePipeline}
          </span>
        </div>

        <h1 className="mt-5 text-[1.95rem] font-serif font-medium leading-[1.35] tracking-tight text-[var(--ink)] sm:text-4xl sm:leading-[1.25] lg:text-[3.25rem] lg:leading-[1.2]">
          {t.heroTitle}
        </h1>

        <p className="mt-5 max-w-3xl text-sm leading-relaxed text-[var(--ink-muted)] sm:text-base md:text-lg">
          {t.heroSub}
        </p>

        {/* Primary Action Buttons */}
        <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center sm:gap-3.5">
          <Link
            href="/farmer/saathi"
            className="group inline-flex h-11 items-center justify-center gap-2.5 border border-[var(--ink)] bg-[var(--ink)] px-6 text-sm font-semibold text-[var(--surface)] shadow-xs transition-all hover:bg-[var(--accent)] hover:border-[var(--accent)]"
          >
            <Sprout className="h-4 w-4 text-emerald-400 transition-transform group-hover:scale-110" />
            <span>{t.startSaathi}</span>
          </Link>

          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:items-center sm:gap-3">
            <Link
              href="/overview"
              className="inline-flex h-11 items-center justify-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--ink)] hover:bg-[var(--canvas)]"
            >
              <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
              <span>{t.reviewerCentre}</span>
            </Link>

            <Link
              href="/farmer"
              className="inline-flex h-11 items-center justify-center gap-2 border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--ink)] hover:bg-[var(--canvas)]"
            >
              <Camera className="h-4 w-4 text-[var(--ink-muted)]" />
              <span>{t.farmerPortal}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 8 Perils Quick Intake Grid */}
      <section className="mt-14 border-b border-[var(--line)] pb-12 sm:mt-18 sm:pb-16 md:mt-20 md:pb-20">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="fp-kicker text-xs font-mono">{t.perilsKicker}</span>
            <h2 className="fp-page-title mt-1.5 text-xl font-semibold sm:text-2xl">
              {t.perilsTitle}
            </h2>
            <p className="fp-page-sub mt-2 text-xs sm:text-sm">
              {t.perilsSub}
            </p>
          </div>
          <span className="font-mono text-xs text-[var(--ink-muted)]">{t.supportedPerilsCount}</span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PERIL_OPTIONS.map((item) => {
            const cfg = ROUTE_CONFIG[item.value];
            const Icon = PERIL_ICONS[item.value] || Layers;
            const pInfo = t.perilLabels[item.value] || { title: item.en, desc: cfg.descriptionEn };
            return (
              <Link
                key={item.value}
                href={`/farmer/saathi?peril=${item.value}`}
                className="group relative flex flex-col justify-between border border-[var(--line)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--ink)]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[var(--canvas)] text-[var(--ink)] transition-colors group-hover:bg-[var(--accent-soft)] group-hover:text-[var(--accent)]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="rounded bg-[var(--canvas)] px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--ink-muted)]">
                      {cfg.requiredAngles.length} {t.anglesLabel}
                    </span>
                  </div>

                  <h3 className="mt-3 text-sm font-semibold text-[var(--ink)] transition-colors group-hover:text-[var(--accent)]">
                    {pInfo.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--ink-muted)]">
                    {pInfo.desc}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-2.5 text-[11px] text-[var(--ink-muted)]">
                  <span className="font-mono">
                    {cfg.needsSatellite ? (
                      <span className="font-medium text-amber-700 dark:text-amber-500">
                        {t.sentinelRequired}
                      </span>
                    ) : (
                      <span>{t.minThreshold(cfg.minConfidence)}</span>
                    )}
                  </span>
                  <span className="font-mono text-[10px] uppercase text-[var(--ink-muted)]">
                    {cfg.contextChecks.length} {t.checksLabel}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 8-Step Architecture Section with UI Flow Line */}
      <section className="mt-10 border-b border-[var(--line)] pb-10 sm:mt-14 sm:pb-14 md:mt-18 md:pb-18">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="fp-kicker text-xs font-mono">{t.pipelineKicker}</span>
            <h2 className="fp-page-title mt-1.5 text-2xl font-serif sm:text-3xl">
              {t.pipelineTitle}
            </h2>
            <p className="fp-page-sub mt-2 text-xs sm:text-sm">
              {t.pipelineSub}
            </p>
          </div>
          <span className="font-mono text-xs text-[var(--ink-muted)]">{t.pipelineStageInfo}</span>
        </div>

        {/* Phase 1: Field Evidence & Edge Verification */}
        <div className="mt-10 sm:mt-12">
          <div className="flex items-center gap-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ink)] text-[10px] font-mono font-bold text-[var(--surface)]">
              1
            </span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]">
              {t.phase1Header}
            </h3>
            <div className="h-px flex-1 bg-[var(--line)]" />
          </div>

          <div className="relative mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {t.steps.slice(0, 4).map((step, idx) => (
              <div
                key={step.n}
                className="group relative flex flex-col justify-between border border-[var(--line)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--ink)]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-[var(--canvas)] font-mono text-xs font-bold text-[var(--ink)] transition-colors group-hover:bg-[var(--ink)] group-hover:text-[var(--surface)]">
                        {step.n}
                      </span>
                      {idx < 3 ? (
                        <span className="hidden text-xs font-mono text-[var(--line)] lg:inline">→</span>
                      ) : null}
                    </div>
                    <span className="rounded bg-[var(--canvas)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                      {step.badge}
                    </span>
                  </div>

                  <h4 className="mt-3 text-sm font-semibold text-[var(--ink)]">
                    {step.title}
                  </h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-muted)]">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Phase Transition Connector Bridge */}
        <div className="my-8 flex items-center justify-center gap-3 sm:my-10">
          <div className="h-px flex-1 border-t border-dashed border-[var(--line)]" />
          <div className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-1 text-[11px] font-mono text-[var(--ink-muted)] shadow-xs">
            <ArrowDown className="h-3 w-3 text-[var(--accent)]" />
            <span>{t.handoverBridge}</span>
          </div>
          <div className="h-px flex-1 border-t border-dashed border-[var(--line)]" />
        </div>

        {/* Phase 2: Signal Triangulation & Adjudication */}
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-mono font-bold text-[var(--surface)]">
              2
            </span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink)]">
              {t.phase2Header}
            </h3>
            <div className="h-px flex-1 bg-[var(--line)]" />
          </div>

          <div className="relative mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {t.steps.slice(4, 8).map((step, idx) => (
              <div
                key={step.n}
                className="group relative flex flex-col justify-between border border-[var(--line)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--ink)]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-[var(--canvas)] font-mono text-xs font-bold text-[var(--ink)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-[var(--surface)]">
                        {step.n}
                      </span>
                      {idx < 3 ? (
                        <span className="hidden text-xs font-mono text-[var(--line)] lg:inline">→</span>
                      ) : null}
                    </div>
                    <span className="rounded bg-[var(--canvas)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                      {step.badge}
                    </span>
                  </div>

                  <h4 className="mt-3 text-sm font-semibold text-[var(--ink)]">
                    {step.title}
                  </h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-muted)]">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* System Features Matrix */}
      <section className="mt-10 border-b border-[var(--line)] pb-10 sm:mt-14 sm:pb-14 md:mt-18 md:pb-18">
        <h2 className="fp-page-title text-xl font-semibold sm:text-2xl">
          {t.stackTitle}
        </h2>
        <p className="fp-page-sub mt-2 text-xs sm:text-sm">
          {t.stackSub}
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="flex items-center gap-2.5">
              <Cpu className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="text-sm font-semibold text-[var(--ink)]">{t.onDeviceCvTitle}</h3>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-[var(--ink-muted)]">
              {t.onDeviceCvDesc}
            </p>
          </div>

          <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="flex items-center gap-2.5">
              <Satellite className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="text-sm font-semibold text-[var(--ink)]">{t.sentinelTitle}</h3>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-[var(--ink-muted)]">
              {t.sentinelDesc}
            </p>
          </div>

          <div className="border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="flex items-center gap-2.5">
              <CloudRain className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="text-sm font-semibold text-[var(--ink)]">{t.imdTitle}</h3>
            </div>
            <p className="mt-2.5 text-xs leading-relaxed text-[var(--ink-muted)]">
              {t.imdDesc}
            </p>
          </div>
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
