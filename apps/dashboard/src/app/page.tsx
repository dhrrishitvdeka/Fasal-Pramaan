"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Shield,
  Camera,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Cpu,
  Layers,
  MapPin,
  ExternalLink,
  Zap,
  Activity,
  Award,
} from "lucide-react";
import { CANONICAL_SCENARIOS, CanonicalScenario, SHOWCASE_SUBMISSIONS, saveLocalShowcaseSubmissions, getLocalShowcaseSubmissions } from "@/lib/showcase-data";
import { useLanguage } from "@/lib/LanguageContext";
import clsx from "clsx";

export default function ShowcaseHomePage() {
  const router = useRouter();
  const { lang, setLang, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<"all" | "high_trust" | "recapture" | "mismatch" | "fraud">("all");
  const [selectedScenario, setSelectedScenario] = useState<CanonicalScenario | null>(null);

  const handleLaunchScenario = (scenario: CanonicalScenario, destination: "review" | "farmer") => {
    // Ensure all canonical scenarios are present in local storage
    const existing = getLocalShowcaseSubmissions();
    const map = new Map(existing.map((s) => [s.id, s]));
    Object.values(SHOWCASE_SUBMISSIONS).forEach((sub) => {
      if (!map.has(sub.id)) map.set(sub.id, sub);
    });
    saveLocalShowcaseSubmissions(Array.from(map.values()));

    if (destination === "review") {
      router.push(scenario.reviewUrl);
    } else {
      router.push(scenario.farmerUrl);
    }
  };

  const filteredScenarios = CANONICAL_SCENARIOS.filter((s) => {
    if (activeTab === "all") return true;
    if (activeTab === "high_trust") return s.id === "case-1-high-trust" || s.id === "case-6-resolved-delta";
    if (activeTab === "recapture") return s.id === "case-2-blurry-canopy" || s.id === "case-3-missing-closeup";
    if (activeTab === "mismatch") return s.id === "case-4-crop-mismatch";
    if (activeTab === "fraud") return s.id === "case-5-duplicate-tamper";
    return true;
  });

  return (
    <div className="space-y-16 pb-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24 border-b border-slate-800/80 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/30 via-slate-900/0 to-transparent pointer-events-none" />
        
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400 mb-6 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            <span>PMFBY 2026 Interactive Evidence Architecture · Model UN Showcase</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl max-w-4xl mx-auto leading-tight">
            {lang === "hi" ? (
              <>
                पारदर्शी फसल साक्ष्य। <span className="text-emerald-400">सटीक AI आकलन।</span> त्वरित मानवीय निर्णय।
              </>
            ) : (
              <>
                Verifiable Crop Evidence. <span className="text-emerald-400">Explainable AI.</span> Instant Human Triage.
              </>
            )}
          </h1>

          <p className="mt-6 max-w-3xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed">
            {lang === "hi"
              ? "फसल प्रमाण (Fasal-Pramaan) किसानों को 5-कोण संरचित साक्ष्य कैप्चर द्वारा सशक्त बनाता है, जबकि बीमाकर्ताओं और सरकारों को क्रिप्टोग्राफिक सत्यनिष्ठा, मल्टी-मॉडल विज़न AI और लक्षित पुनः कैप्चर प्रोटोकॉल से धोखाधड़ी मुक्त सुरक्षा प्रदान करता है।"
              : "Fasal-Pramaan empowers farmers with guided multi-angle evidence capture while safeguarding insurers and state governments with cryptographic trust scoring, multi-modal Vision AI, and single-photo adaptive recapture protocols."}
          </p>

          {/* Interactive Role Switcher Actions */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/farmer"
              className="flex items-center gap-2.5 rounded-lg bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-500 transition active:scale-98"
            >
              <span className="text-lg">🌾</span>
              <span>{lang === "hi" ? "किसान वेब पोर्टल खोलें (/farmer)" : "Launch Farmer Web Portal (/farmer)"}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/overview"
              className="flex items-center gap-2.5 rounded-lg border border-slate-700 bg-slate-800/90 px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-slate-700 hover:border-slate-600 transition active:scale-98"
            >
              <span className="text-lg">🔍</span>
              <span>{lang === "hi" ? "समीक्षक कमांड सेंटर खोलें (/overview)" : "Launch Reviewer Command Centre (/overview)"}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4 max-w-4xl mx-auto">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5 backdrop-blur-xs text-left">
              <div className="text-xs text-slate-400">Capture Protocol</div>
              <div className="text-base font-bold text-white mt-0.5">5-Angle Geometric</div>
              <div className="text-[11px] text-emerald-400 mt-1">Anti-cheat coverage</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5 backdrop-blur-xs text-left">
              <div className="text-xs text-slate-400">Trust Engine</div>
              <div className="text-base font-bold text-white mt-0.5">4-Pillar Scoring</div>
              <div className="text-[11px] text-emerald-400 mt-1">Quality·Coverage·Context·Integrity</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5 backdrop-blur-xs text-left">
              <div className="text-xs text-slate-400">Adaptive Recapture</div>
              <div className="text-base font-bold text-white mt-0.5">+24.4% Avg Delta</div>
              <div className="text-[11px] text-emerald-400 mt-1">Single-photo targeted</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3.5 backdrop-blur-xs text-left">
              <div className="text-xs text-slate-400">Inspection Speed</div>
              <div className="text-base font-bold text-white mt-0.5">82% Faster Triage</div>
              <div className="text-[11px] text-emerald-400 mt-1">Human-in-the-loop</div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Overview Section */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">
            <Cpu className="h-3.5 w-3.5" />
            <span>End-to-End System Design</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {t("architectureTitle")}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {t("architectureSub")}
          </p>
        </div>

        {/* 4 Interactive Pipeline Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-xs transition hover:border-slate-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 font-bold mb-4">
              01
            </div>
            <h3 className="text-base font-semibold text-white">5-Angle Camera Capture</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Farmer captures 5 designated angles (Wide, Left Context, Mid-Canopy, Right Context, Macro Damage) with real-time blur & framing validation.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5 text-emerald-400" />
              <span>Offline-first & Geofenced</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-xs transition hover:border-slate-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 font-bold mb-4">
              02
            </div>
            <h3 className="text-base font-semibold text-white">Evidence Trust Engine</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Evaluates Quality (blur/resolution), Coverage (all views present), Context (plot & sowing match), and Cryptographic Integrity independently from AI models.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-sky-400" />
              <span>Independent Confidence Score</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-xs transition hover:border-slate-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 font-bold mb-4">
              03
            </div>
            <h3 className="text-base font-semibold text-white">Vision AI & PMFBY Grades</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Ensemble Vision Transformer + YOLO detect disease, pest, or lodging loss with affected area % and categorizes into PMFBY Loss Grades A/B/C/U.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
              <span>Multimodal Loss Estimation</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-xs transition hover:border-slate-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 font-bold mb-4">
              04
            </div>
            <h3 className="text-base font-semibold text-white">Reviewer Triage & Recapture</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Officers fast-track high-trust claims, request single-photo targeted recaptures for specific defects, or escalate mismatches to field inspection.
            </p>
            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
              <FileCheck2 className="h-3.5 w-3.5 text-amber-400" />
              <span>Immutable Audit Logs</span>
            </div>
          </div>
        </div>
      </section>

      {/* 6 Canonical MUN Scenarios Section */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 border-b border-slate-800 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1.5">
              <Zap className="h-3.5 w-3.5" />
              <span>1-Click Interactive Demo Engine</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {t("canonicalTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {t("canonicalSub")}
            </p>
          </div>

          {/* Scenario Filter Tabs */}
          <div className="flex flex-wrap gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={clsx(
                "px-3 py-1.5 rounded-md font-medium transition",
                activeTab === "all" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              All (6)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("high_trust")}
              className={clsx(
                "px-3 py-1.5 rounded-md font-medium transition",
                activeTab === "high_trust" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              High Trust (2)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("recapture")}
              className={clsx(
                "px-3 py-1.5 rounded-md font-medium transition",
                activeTab === "recapture" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              Recapture (2)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mismatch")}
              className={clsx(
                "px-3 py-1.5 rounded-md font-medium transition",
                activeTab === "mismatch" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              Mismatch (1)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("fraud")}
              className={clsx(
                "px-3 py-1.5 rounded-md font-medium transition",
                activeTab === "fraud" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
              )}
            >
              Integrity (1)
            </button>
          </div>
        </div>

        {/* Scenarios Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredScenarios.map((scenario) => {
            const isOk = scenario.badgeTone === "ok";
            const isWarn = scenario.badgeTone === "warn";
            const isDanger = scenario.badgeTone === "danger";

            return (
              <div
                key={scenario.id}
                className={clsx(
                  "group flex flex-col justify-between rounded-xl border bg-slate-900/90 p-5 shadow-sm transition hover:shadow-md",
                  isOk && "border-emerald-500/40 hover:border-emerald-500/70",
                  isWarn && "border-amber-500/40 hover:border-amber-500/70",
                  isDanger && "border-rose-500/40 hover:border-rose-500/70"
                )}
              >
                <div>
                  {/* Top Badge & Metric */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={clsx(
                        "rounded px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase",
                        isOk && "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
                        isWarn && "bg-amber-500/20 text-amber-300 border border-amber-500/30",
                        isDanger && "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      )}
                    >
                      {scenario.badge}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-300">
                      Trust: {scenario.evidenceScore}%
                    </span>
                  </div>

                  {/* Title & Subtitle */}
                  <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition">
                    {lang === "hi" ? scenario.hindiTitle : scenario.title}
                  </h3>
                  <p className="text-xs font-medium text-slate-400 mt-1">
                    {lang === "hi" ? scenario.hindiSubtitle : scenario.subtitle}
                  </p>

                  {/* Description */}
                  <p className="mt-3 text-xs text-slate-300 leading-relaxed">
                    {scenario.description}
                  </p>

                  {/* Key Details Pill */}
                  <div className="mt-4 rounded-lg bg-slate-950/60 p-2.5 text-[11px] text-slate-400 space-y-1 font-mono border border-slate-800">
                    <div className="flex justify-between">
                      <span>Farmer:</span>
                      <span className="text-slate-200">{scenario.farmerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Crop:</span>
                      <span className="text-slate-200">{scenario.crop}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Location:</span>
                      <span className="text-slate-200">{scenario.location.split("(")[0]}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Angles:</span>
                      <span className="text-emerald-400 font-semibold">{scenario.anglesCount}</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-5 pt-3 border-t border-slate-800/80 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleLaunchScenario(scenario, "review")}
                    className="flex w-full items-center justify-between rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-600 transition"
                  >
                    <span>{lang === "hi" ? "समीक्षक केंद्र में जांचें" : "Inspect in Reviewer Centre"}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLaunchScenario(scenario, "farmer")}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-700 px-3.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition"
                  >
                    <span>{lang === "hi" ? "किसान पोर्टल में अनुभव करें" : "Experience in Farmer View"}</span>
                    <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Jump All to Review Queue Banner */}
        <div className="mt-10 rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white">Ready for comprehensive claim triage?</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Launch the live Review Queue to filter by uncertainty types (Visual, Coverage, Context, Integrity) and test one-click decisions.
            </p>
          </div>
          <Link
            href="/review"
            className="shrink-0 flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-sm"
          >
            <span>{t("launchAllQueue")}</span>
          </Link>
        </div>
      </section>

      {/* Trust & Safety Highlights */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 md:p-8">
          <div className="max-w-3xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-400" />
              PMFBY Operational Governance & CGRS Compliance
            </h3>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              Fasal-Pramaan is architected strictly under the Assistive AI guidelines mandated by the Ministry of Agriculture & Farmers Welfare. AI models never finalize claim payouts autonomously—they compute cryptographic evidence confidence, isolate uncertainty reasons, and present human reviewers with one-click audited decisions.
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3 pt-6 border-t border-slate-800/80 text-xs">
            <div>
              <div className="font-semibold text-slate-200">100% Offline-First</div>
              <div className="text-slate-400 mt-0.5">Edge capture with SQLite queuing and delayed SHA-256 sync for low-connectivity remote villages.</div>
            </div>
            <div>
              <div className="font-semibold text-slate-200">Anti-Spoofing Sensors</div>
              <div className="text-slate-400 mt-0.5">Hardware GPS validation, mock location provider blocking, and perceptual dHash duplicate screening.</div>
            </div>
            <div>
              <div className="font-semibold text-slate-200">Explainable Vision AI</div>
              <div className="text-slate-400 mt-0.5">Multi-label damage probability scores with Grad-CAM overlays matching PMFBY standard loss formulas.</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
