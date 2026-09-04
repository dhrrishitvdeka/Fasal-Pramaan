"use client";

import Link from "next/link";
import { useState } from "react";
import { useFarmerData } from "@/lib/farmerStore";
import { getHelpI18n, type AngleHelpData } from "@/lib/help-i18n";
import {
  Camera,
  Sparkles,
  ShieldCheck,
  Layers,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Maximize2,
  ArrowUpLeft,
  Scan,
  ArrowUpRight,
  ZoomIn,
  HelpCircle,
  Bot,
  FileText,
  ChevronDown,
  Info,
} from "lucide-react";
import clsx from "clsx";

function AngleIcon({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "Maximize2":
      return <Maximize2 className={className} />;
    case "ArrowUpLeft":
      return <ArrowUpLeft className={className} />;
    case "Scan":
      return <Scan className={className} />;
    case "ArrowUpRight":
      return <ArrowUpRight className={className} />;
    case "ZoomIn":
      return <ZoomIn className={className} />;
    default:
      return <Camera className={className} />;
  }
}

export default function FarmerHelpPage() {
  const { lang } = useFarmerData();
  const t = getHelpI18n(lang);
  const [selectedAngleId, setSelectedAngleId] = useState<string>(t.angles[0]?.id || "photo_1");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const activeAngle: AngleHelpData =
    t.angles.find((a) => a.id === selectedAngleId) || t.angles[0];

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      {/* 1. HERO HEADER */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-emerald-50/40 p-6 shadow-xs sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
              <span>PMFBY Digital Claim Guide</span>
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-3xl">
              {t.title}
            </h1>
            <p className="text-xs sm:text-sm leading-relaxed text-slate-600">
              {t.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 sm:flex-col">
            <Link
              href="/farmer/capture"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-black transition-colors"
            >
              <Camera className="h-4 w-4 text-emerald-400" />
              <span>{t.startClaimBtn}</span>
            </Link>

            <Link
              href="/farmer/saathi"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition-colors"
            >
              <Bot className="h-4 w-4 text-emerald-700" />
              <span>{t.talkToSaathiBtn}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. DYNAMIC CLAIM PIPELINE EXPLAINER */}
      <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
            <Layers className="h-4 w-4 text-emerald-600" />
            <span>Smart Insurance Architecture</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl mt-0.5">
            {t.pipelineTitle}
          </h2>
          <p className="text-xs text-slate-500">{t.pipelineSub}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {t.pipelineSteps.map((step) => (
            <div
              key={step.number}
              className="relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-2xs transition-all hover:border-slate-300 hover:shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-lg font-black text-slate-300">
                    {step.number}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 border border-slate-200">
                    {step.badge}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-800">{step.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{step.desc}</p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                <span>Automated &amp; Verified</span>
                <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-emerald-600" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 5-ANGLE CAMERA CAPTURE GUIDE */}
      <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
            <Camera className="h-4 w-4 text-emerald-600" />
            <span>Field Evidence Calibration</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl mt-0.5">
            {t.angleGuideTitle}
          </h2>
          <p className="text-xs text-slate-500">{t.angleGuideSub}</p>
        </div>

        {/* Angle Selection Tabs */}
        <div className="flex overflow-x-auto pb-1 gap-2 no-scrollbar">
          {t.angles.map((angle, idx) => {
            const isSelected = angle.id === selectedAngleId;
            return (
              <button
                key={angle.id}
                type="button"
                onClick={() => setSelectedAngleId(angle.id)}
                className={clsx(
                  "flex items-center gap-2 shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all border",
                  isSelected
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300",
                )}
              >
                <AngleIcon
                  name={angle.icon}
                  className={clsx("h-3.5 w-3.5", isSelected ? "text-emerald-400" : "text-slate-500")}
                />
                <span>{angle.name.split(". ")[1] || angle.name}</span>
                <span
                  className={clsx(
                    "ml-1 rounded-full px-1.5 py-0.2 font-mono text-[9px]",
                    isSelected ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {idx + 1}/5
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Angle Detail Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-emerald-400 shadow-2xs">
                <AngleIcon name={activeAngle.icon} className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{activeAngle.name}</h3>
                <p className="text-xs text-slate-500">{activeAngle.shortDesc}</p>
              </div>
            </div>

            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 font-mono text-xs font-bold text-emerald-800">
              {activeAngle.distance}
            </span>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 text-xs sm:text-sm text-slate-800 leading-relaxed">
            <div className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
              <Info className="h-4 w-4 text-slate-600" />
              <span>How to Frame this Shot:</span>
            </div>
            {activeAngle.instructions}
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Actionable Quality Tips:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {activeAngle.tips.map((tip, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. EVIDENCE QUALITY: DOS & DON'TS */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{t.qualityTitle}</h2>
          <p className="text-xs text-slate-500">{t.qualitySub}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* DOs */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 space-y-3">
            <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>What to Do (ସଠିକ୍ ଉପାୟ / नियम)</span>
            </div>
            <ul className="space-y-2 text-xs text-emerald-950">
              {t.dos.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* DON'Ts */}
          <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5 space-y-3">
            <div className="flex items-center gap-2 font-bold text-rose-900 text-sm">
              <XCircle className="h-4 w-4 text-rose-600" />
              <span>What to Avoid (ବାରଣ / टाळा)</span>
            </div>
            <ul className="space-y-2 text-xs text-rose-950">
              {t.donts.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-rose-600 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 5. FREQUENTLY ASKED QUESTIONS */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-slate-600" />
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl">{t.faqTitle}</h2>
        </div>

        <div className="space-y-2">
          {t.faqs.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-xl border border-slate-200 bg-white overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between p-4 text-left text-xs sm:text-sm font-bold text-slate-800 hover:bg-slate-50 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={clsx(
                      "h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200",
                      isOpen && "rotate-180 text-slate-800",
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/50">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. BOTTOM ACTION BANNER */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-900 bg-slate-900 p-4 text-white sm:p-6 shadow-md">
        <div className="space-y-1">
          <h3 className="text-sm sm:text-base font-bold text-white">
            Ready to file your crop loss claim?
          </h3>
          <p className="text-xs text-slate-300">
            Our guided camera will ensure your photos meet all insurance standards automatically.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/farmer/claims"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{t.viewClaimsBtn}</span>
          </Link>
          <Link
            href="/farmer/capture"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition-colors shadow-xs"
          >
            <Camera className="h-3.5 w-3.5" />
            <span>{t.startClaimBtn}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

