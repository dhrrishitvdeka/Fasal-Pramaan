"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useMemo, Suspense } from "react";
import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  MapPin,
  FileText,
  Clock,
  ArrowRight,
  Upload,
  Info,
  ChevronRight,
  PhoneCall,
  Calculator,
  Layers,
} from "lucide-react";
import {
  CANONICAL_SCENARIOS,
  SHOWCASE_SUBMISSIONS,
  generateMockCropSvg,
  getLocalShowcaseSubmissions,
  updateLocalSubmission,
} from "@/lib/showcase-data";
import { useLanguage } from "@/lib/LanguageContext";
import clsx from "clsx";

const ANGLE_METADATA = [
  {
    key: "wide_field",
    label: "1. Wide Field View",
    hiLabel: "1. विस्तृत क्षेत्र दृश्य",
    desc: "Full crop perimeter showing field boundary and horizon",
    hiDesc: "खेत की पूरी सीमा और परिदृश्य दिखाने वाला कोण",
    icon: "🌾",
  },
  {
    key: "left_context",
    label: "2. Left Plot Context",
    hiLabel: "2. बायां भूखंड संदर्भ",
    desc: "Angled perspective along the left planting rows",
    hiDesc: "बाईं कतारों के साथ कोणीय दृश्य",
    icon: "📐",
  },
  {
    key: "mid_canopy",
    label: "3. Mid-Canopy Density",
    hiLabel: "3. मध्य कैनोपी घनत्व",
    desc: "Foliage, stalk density, and inter-row spacing",
    hiDesc: "पत्तियां, तना घनत्व और कतारों के बीच का फैलाव",
    icon: "🌿",
  },
  {
    key: "right_context",
    label: "4. Right Plot Context",
    hiLabel: "4. दायां भूखंड संदर्भ",
    desc: "Angled perspective along the right planting rows",
    hiDesc: "दाईं कतारों के साथ कोणीय दृश्य",
    icon: "📐",
  },
  {
    key: "closeup_damage",
    label: "5. Close-up Macro Damage",
    hiLabel: "5. क्लोज़-अप सूक्ष्म क्षति",
    desc: "Sharp macro shot of affected leaf/stem lesions (15-20cm)",
    hiDesc: "प्रभावित पत्ती या तने की स्पष्ट सूक्ष्म तस्वीर (15-20 सेमी)",
    icon: "🔍",
  },
];

function FarmerPortalContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const scenarioId = searchParams.get("scenario") || "case-1-high-trust";
  const { lang, setLang, t } = useLanguage();

  // Active scenario metadata
  const activeScenario = useMemo(() => {
    return CANONICAL_SCENARIOS.find((s) => s.id === scenarioId) || CANONICAL_SCENARIOS[0];
  }, [scenarioId]);

  // Submission data for active scenario
  const [submission, setSubmission] = useState(() => {
    const all = getLocalShowcaseSubmissions();
    const found = all.find((s) => s.id === activeScenario.submissionId);
    return found || SHOWCASE_SUBMISSIONS[activeScenario.submissionId] || Object.values(SHOWCASE_SUBMISSIONS)[0];
  });

  // State for interactive capture workflow
  const [capturedAngles, setCapturedAngles] = useState<Record<string, boolean>>({
    wide_field: true,
    left_context: true,
    mid_canopy: activeScenario.id !== "case-2-blurry-canopy",
    right_context: true,
    closeup_damage: activeScenario.id !== "case-3-missing-closeup",
  });

  const [activeAngleIndex, setActiveAngleIndex] = useState(0);
  const [claimSuccessMsg, setClaimSuccessMsg] = useState<string | null>(null);
  const [recapturedDone, setRecapturedDone] = useState(activeScenario.id === "case-6-resolved-delta");

  // Loss calculator state
  const [calcAcreage, setCalcAcreage] = useState("2.5");
  const [calcLossPct, setCalcLossPct] = useState("35");
  const [calcSumInsured, setCalcSumInsured] = useState("45000");

  const estimatedPayout = useMemo(() => {
    const acres = parseFloat(calcAcreage) || 0;
    const loss = parseFloat(calcLossPct) || 0;
    const sum = parseFloat(calcSumInsured) || 0;
    return Math.round(acres * sum * (loss / 100));
  }, [calcAcreage, calcLossPct, calcSumInsured]);

  const handleSimulateAngleCapture = (angleKey: string) => {
    setCapturedAngles((prev) => ({
      ...prev,
      [angleKey]: true,
    }));
  };

  const handleResolveRecapture = () => {
    // Upgrades blurry or missing angle to pristine high-res resolution (simulating Case 6)
    const updated = updateLocalSubmission(submission.id, {
      status: "verified",
      latest_evaluation: {
        ...submission.latest_evaluation!,
        confidence: {
          final: 86.4,
          threshold: 80.0,
          quality: 94.0,
          coverage: 100.0,
          context: 96.0,
          integrity: 99.0,
        },
        confidence_delta: 24.4,
        previous_confidence: submission.latest_evaluation?.confidence.final || 62.0,
        uncertainty: {
          present: false,
          type: "none",
          severity: "low",
          reasons: [],
          recommended_action: "none",
        },
        request: null,
      },
    });
    setSubmission(updated);
    setRecapturedDone(true);
    setCapturedAngles({
      wide_field: true,
      left_context: true,
      mid_canopy: true,
      right_context: true,
      closeup_damage: true,
    });
    setClaimSuccessMsg("Targeted recapture submitted successfully! Evidence confidence improved to 86.4%.");
  };

  const currentAngleMeta = ANGLE_METADATA[activeAngleIndex];

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Farmer Profile & Active Land Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-2xl">
              👨🏽‍🌾
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">{activeScenario.farmerName}</h2>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  PMFBY Registered
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" />
                  {activeScenario.location}
                </span>
                <span>•</span>
                <span>Plot ID: <strong>MH-PMFBY-2026-882</strong></span>
                <span>•</span>
                <span>Policy Crop: <strong>{activeScenario.registeredCrop}</strong></span>
              </div>
            </div>
          </div>

          {/* Quick Scenario Selector Capsule */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-1">
              {lang === "hi" ? "डेमो परिदृश्य:" : "Demo Scenario:"}
            </span>
            <select
              value={activeScenario.id}
              onChange={(e) => router.push(`/farmer?scenario=${e.target.value}`)}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {CANONICAL_SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.badge} - {s.title.split(":")[1] || s.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Scenario State Highlight Banner */}
      <div
        className={clsx(
          "rounded-xl border p-4 shadow-xs",
          activeScenario.badgeTone === "ok" && "border-emerald-200 bg-emerald-50/80 text-emerald-950",
          activeScenario.badgeTone === "warn" && "border-amber-200 bg-amber-50/80 text-amber-950",
          activeScenario.badgeTone === "danger" && "border-rose-200 bg-rose-50/80 text-rose-950"
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="text-xl">
              {activeScenario.badgeTone === "ok" ? "✅" : activeScenario.badgeTone === "warn" ? "⚠️" : "🚫"}
            </span>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide opacity-80">
                {activeScenario.badge} · {activeScenario.title}
              </div>
              <p className="text-xs mt-0.5 leading-relaxed font-medium">
                {activeScenario.keyFinding}
              </p>
            </div>
          </div>

          <Link
            href={activeScenario.reviewUrl}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
          >
            <span>{lang === "hi" ? "समीक्षक केंद्र में देखें" : "View in Reviewer Centre"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Targeted Recapture Action Module (if in Case 2, Case 3 or pending recapture) */}
      {(activeScenario.id === "case-2-blurry-canopy" ||
        activeScenario.id === "case-3-missing-closeup" ||
        submission.status === "needs_recapture") &&
        !recapturedDone && (
          <div className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/60 p-5 shadow-xs">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
                    Action Required by Reviewer
                  </span>
                  <span className="text-xs text-amber-800 font-semibold">
                    Targeted Single-Angle Recapture
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 mt-1">
                  {activeScenario.id === "case-2-blurry-canopy"
                    ? "Photo 3 (Mid-Canopy) was blurry. Please upload a steady retake."
                    : "Photo 5 (Closeup Macro Damage) is missing. Please capture affected leaves."}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  You do NOT need to retake all 5 photos. Uploading this single angle will automatically boost your claim trust score.
                </p>
              </div>

              <button
                type="button"
                onClick={handleResolveRecapture}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
              >
                <Upload className="h-4 w-4" />
                <span>Simulate 1-Click High-Res Upload & Resolve (+24.4% Delta)</span>
              </button>
            </div>
          </div>
        )}

      {claimSuccessMsg && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-100 p-3 text-xs font-semibold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          <span>{claimSuccessMsg}</span>
        </div>
      )}

      {/* Main Grid: 5-Angle Camera Interface + Claim Summary */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Interactive 5-Angle Capture Workflow */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs" id="new-claim">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Camera className="h-4 w-4 text-emerald-600" />
                  {lang === "hi" ? "5-कोण संरचित कैमरा कैप्चर" : "5-Angle Guided Camera Capture"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Follow the step-by-step angle guide for guaranteed PMFBY AI verification
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-mono font-semibold text-slate-700">
                {Object.values(capturedAngles).filter(Boolean).length} / 5 Captured
              </span>
            </div>

            {/* Angle Step Buttons */}
            <div className="grid grid-cols-5 gap-1.5 mb-5">
              {ANGLE_METADATA.map((meta, idx) => {
                const isCaptured = capturedAngles[meta.key];
                const isActive = activeAngleIndex === idx;
                return (
                  <button
                    key={meta.key}
                    type="button"
                    onClick={() => setActiveAngleIndex(idx)}
                    className={clsx(
                      "flex flex-col items-center justify-center rounded-lg border p-2 text-center transition",
                      isActive
                        ? "border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-xs"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <span className="text-sm">{meta.icon}</span>
                    <span className="text-[10px] font-semibold mt-1 truncate max-w-full">
                      {idx + 1}. {meta.key.split("_")[0]}
                    </span>
                    {isCaptured ? (
                      <span className="text-[9px] text-emerald-600 font-bold mt-0.5">✓ Ready</span>
                    ) : (
                      <span className="text-[9px] text-amber-600 font-medium mt-0.5">Pending</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Live Camera Viewfinder Simulation */}
            <div className="relative rounded-xl overflow-hidden border border-slate-300 bg-slate-950 aspect-4/3 flex flex-col justify-between p-4 shadow-inner">
              {/* Top Viewfinder HUD */}
              <div className="flex items-center justify-between z-10">
                <div className="rounded-md bg-slate-900/80 px-2.5 py-1 text-[11px] font-mono font-semibold text-emerald-400 border border-slate-700/60 backdrop-blur-xs flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>GPS LOCKED (8.5m Accuracy)</span>
                </div>
                <div className="rounded-md bg-slate-900/80 px-2.5 py-1 text-[11px] font-mono text-slate-300 border border-slate-700/60 backdrop-blur-xs">
                  {lang === "hi" ? currentAngleMeta.hiLabel : currentAngleMeta.label}
                </div>
              </div>

              {/* Viewfinder Image Graphic */}
              <div className="absolute inset-0 flex items-center justify-center opacity-90">
                <img
                  src={generateMockCropSvg(
                    currentAngleMeta.key,
                    activeScenario.crop.split(" ")[0],
                    activeScenario.damage.split(" ")[0],
                    activeScenario.id === "case-2-blurry-canopy" && currentAngleMeta.key === "mid_canopy" && !recapturedDone,
                    activeScenario.id === "case-5-duplicate-tamper",
                    activeScenario.evidenceScore
                  )}
                  alt="Simulated Camera View"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Viewfinder Reticle / Framing Grid */}
              <div className="absolute inset-8 border border-white/20 rounded-lg pointer-events-none grid grid-cols-3 grid-rows-3">
                <div className="border-r border-b border-white/10" />
                <div className="border-r border-b border-white/10" />
                <div className="border-b border-white/10" />
                <div className="border-r border-b border-white/10" />
                <div className="border-r border-b border-white/10 flex items-center justify-center">
                  <div className="h-8 w-8 border border-emerald-400/60 rounded-full" />
                </div>
                <div className="border-b border-white/10" />
                <div className="border-r border-white/10" />
                <div className="border-r border-white/10" />
                <div />
              </div>

              {/* Bottom Camera Trigger HUD */}
              <div className="flex items-center justify-between z-10 bg-slate-950/80 p-3 rounded-lg border border-slate-800 backdrop-blur-xs">
                <div className="text-left text-[11px] text-slate-300">
                  <div className="font-semibold text-white">
                    {lang === "hi" ? currentAngleMeta.hiLabel : currentAngleMeta.label}
                  </div>
                  <div className="text-slate-400">
                    {lang === "hi" ? currentAngleMeta.hiDesc : currentAngleMeta.desc}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSimulateAngleCapture(currentAngleMeta.key)}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>{capturedAngles[currentAngleMeta.key] ? "Re-take Photo" : "Capture Photo"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveAngleIndex((prev) => (prev + 1) % ANGLE_METADATA.length)}
                    className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                    title="Next Angle"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Form Action */}
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>SHA-256 integrity seal applied automatically on capture.</span>
              </div>

              <button
                type="button"
                onClick={() => setClaimSuccessMsg("Claim package submitted with 5 cryptographically signed angles. Ref: PMFBY-CLAIM-2026-902")}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                <span>{t("submitClaim")}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* AI Crop Doctor & Treatment Advisory */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs" id="advisor">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                {t("cropDoctor")} (Kisan Salahkaar)
              </h3>
              <span className="text-xs text-slate-500">Autonomous Botanical Diagnostic</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5">
                <div className="text-xs font-bold text-slate-700">Detected Pathology</div>
                <div className="text-sm font-bold text-emerald-800 mt-1">{activeScenario.damage}</div>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Identified via Vision Transformer model v2.4 with {activeScenario.modelScore}% confidence score.
                </p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5">
                <div className="text-xs font-bold text-slate-700">Agronomic Advisory & Treatment</div>
                <div className="text-xs text-slate-800 mt-1 space-y-1">
                  <div>• Apply recommended bactericide / Copper Oxychloride spray.</div>
                  <div>• Drain excess water from standing crop rows to halt progression.</div>
                  <div>• Maintain plot isolation to protect adjacent Kharif parcels.</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Claim Payout Calculator & Status */}
        <div className="space-y-5">
          {/* PMFBY Estimated Payout Calculator */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
              <Calculator className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">PMFBY Payout Estimator</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-medium">Cultivated Area (Acres)</label>
                <input
                  type="number"
                  value={calcAcreage}
                  onChange={(e) => setCalcAcreage(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium">Assessed Loss Severity (%)</label>
                <input
                  type="number"
                  value={calcLossPct}
                  onChange={(e) => setCalcLossPct(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium">Sum Insured per Acre (₹)</label>
                <input
                  type="number"
                  value={calcSumInsured}
                  onChange={(e) => setCalcSumInsured(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-slate-900 font-semibold"
                />
              </div>

              <div className="rounded-lg bg-emerald-50 p-3.5 border border-emerald-200 mt-3">
                <div className="text-[11px] text-emerald-800 uppercase font-bold tracking-wide">
                  Estimated Payout
                </div>
                <div className="text-2xl font-bold text-emerald-950 mt-0.5">
                  ₹{estimatedPayout.toLocaleString("en-IN")}
                </div>
                <div className="text-[10px] text-emerald-700 mt-1">
                  Subject to official reviewer sign-off under PMFBY norms.
                </div>
              </div>
            </div>
          </div>

          {/* Active Claim Timeline */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs" id="tasks">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
              <Clock className="h-4 w-4 text-slate-600" />
              Claim Audit Timeline
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex gap-2.5">
                <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <div>
                  <div className="font-semibold text-slate-800">5-Angle Evidence Uploaded</div>
                  <div className="text-[11px] text-slate-500">17 Aug 2026, 10:15 IST · Device GPS Verified</div>
                </div>
              </div>

              <div className="flex gap-2.5">
                <div className="h-2 w-2 rounded-full bg-sky-500 mt-1.5 shrink-0" />
                <div>
                  <div className="font-semibold text-slate-800">AI Trust & Pathology Evaluation</div>
                  <div className="text-[11px] text-slate-500">Confidence: {activeScenario.evidenceScore}% · Grade B</div>
                </div>
              </div>

              <div className="flex gap-2.5">
                <div
                  className={clsx(
                    "h-2 w-2 rounded-full mt-1.5 shrink-0",
                    submission.status === "verified"
                      ? "bg-emerald-500"
                      : submission.status === "needs_recapture"
                      ? "bg-amber-500"
                      : "bg-rose-500"
                  )}
                />
                <div>
                  <div className="font-semibold text-slate-800">
                    {submission.status === "verified"
                      ? "Verified by Reviewer"
                      : submission.status === "needs_recapture"
                      ? "Targeted Recapture Requested"
                      : "Physical Inspection Pending"}
                  </div>
                  <div className="text-[11px] text-slate-500">Status: {submission.status}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <PhoneCall className="h-3.5 w-3.5 text-slate-400" />
                Kisan Helpline: 1800-180-1551
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FarmerPortalPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading Farmer Portal…</div>}>
      <FarmerPortalContent />
    </Suspense>
  );
}
