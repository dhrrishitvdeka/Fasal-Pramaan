"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Camera,
  CheckCircle2,
  AlertCircle,
  Bell,
  MessageSquare,
  Smartphone,
  ShieldCheck,
  ChevronRight,
  Info,
  Layers,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { useFarmerData, GrowthTimelineMilestone } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import clsx from "clsx";

export default function FarmerRemindersPage() {
  const { lang, milestones, plots, snoozeMilestone } = useFarmerData();
  const t = getFarmerT(lang);

  const [smsEnabled, setSmsEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [selectedCrop, setSelectedCrop] = useState<string>("Wheat");
  const [toast, setToast] = useState<string | null>(null);

  const cropMilestones = milestones.filter(
    (m) => m.cropName.toLowerCase() === selectedCrop.toLowerCase()
  );

  const completedCount = cropMilestones.filter((m) => m.completed).length;
  const totalCount = cropMilestones.length;

  const handleSnooze = (id: string) => {
    snoozeMilestone(id, 3);
    setToast(
      lang === "hi"
        ? "अनुस्मारक को 3 दिनों के लिए आगे बढ़ाया गया।"
        : "Reminder snoozed for 3 days."
    );
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fp-panel fixed top-16 right-4 z-50 flex items-center gap-2 px-4 py-3 text-xs sm:text-sm">
          <CheckCircle2 className="h-5 w-5" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            <span>{t.remindersTitle}</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 max-w-3xl">
            {t.remindersSub}
          </p>
        </div>

        <Link
          href="/farmer/capture"
          className="fp-btn-primary gap-2 shrink-0"
        >
          <Camera className="h-4 w-4" />
          <span>{t.captureMilestoneNow}</span>
        </Link>
      </div>

      {/* Crop Selector Tabs & Progress Card */}
      <div className="fp-panel p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          {/* Crop Selector Tabs */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCrop("Wheat")}
              className={clsx(
                "rounded-lg px-4 py-2 text-xs font-bold transition-all border",
                selectedCrop === "Wheat"
                  ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]"
                  : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              )}
            >
              {t.cycleWheat}
            </button>
            <button
              type="button"
              onClick={() => setSelectedCrop("Mustard")}
              className={clsx(
                "rounded-lg px-4 py-2 text-xs font-bold transition-all border",
                selectedCrop === "Mustard"
                  ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]"
                  : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              )}
            >
              {t.cycleMustard}
            </button>
          </div>

          {/* Progress pill */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600 font-medium">
              {lang === "hi" ? "साक्ष्य संग्रह प्रगति:" : "Evidence Progress:"}
            </span>
            <span className="fp-badge-neutral font-mono">
              {completedCount} / {totalCount} {lang === "hi" ? "अवस्थाएं पूर्ण" : "Stages Logged"}
            </span>
          </div>
        </div>

        {/* Timeline Visual Progress Bar */}
        <div className="mt-6 space-y-2">
          <div className="flex justify-between text-[11px] text-slate-500 font-medium">
            <span>{lang === "hi" ? "बुवाई (दिन 0)" : "Sowing (Day 0)"}</span>
            <span>{lang === "hi" ? "मध्य अवस्था (दिन 60)" : "Mid Growth (Day 60)"}</span>
            <span>{lang === "hi" ? "कटाई (दिन 120)" : "Harvest (Day 120)"}</span>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
            <div
              className="h-full bg-[var(--ink)]"
              style={{ width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main 2-Column Grid: Timeline Milestones (Left) & Settings / Benefits (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (8 cols): 30-Day Step Timeline */}
        <div className="lg:col-span-8 space-y-4">
          {cropMilestones.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              {lang === "hi" ? "इस फसल के लिए कोई विकास अनुस्मारक नहीं है।" : "No growth reminders for this crop."}
            </div>
          )}
          {cropMilestones.map((m, index) => {
            const isNextDue = !m.completed && index === completedCount;

            return (
              <div
                key={m.id}
                className={clsx(
                  "fp-panel relative p-5",
                  isNextDue && !m.completed ? "border-[var(--ink)]" : "",
                  !m.completed && !isNextDue ? "opacity-70" : ""
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    {/* Stage icon / day pill */}
                    <div
                      className={clsx(
                        "flex h-11 w-11 shrink-0 items-center justify-center font-mono text-sm",
                        m.completed || isNextDue
                          ? "bg-[var(--ink)] text-[var(--surface)]"
                          : "border border-[var(--line)] text-[var(--ink-muted)]"
                      )}
                    >
                      {m.completed ? <CheckCircle2 className="h-6 w-6" /> : `D${m.dayNumber}`}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900">
                          {lang === "hi" ? m.stageNameHi : m.stageName}
                        </h3>
                        {m.completed && (
                          <span className="fp-badge-ok">{t.completedBadge}</span>
                        )}
                        {isNextDue && (
                          <span className="fp-badge-alert">{t.nextDueBadge}</span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">
                        {m.notes}
                      </p>

                      <div className="flex items-center gap-3 pt-1 text-xs text-slate-500 font-mono">
                        <span>
                          {m.completed
                            ? `${lang === "hi" ? "सत्यापित तिथि:" : "Captured on:"} ${m.completedDate}`
                            : `${lang === "hi" ? "देय तिथि:" : "Due Date:"} ${m.dueDate}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right side: Action Button or Photo Preview */}
                  <div className="shrink-0 flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
                    {m.completed && m.evidenceImageUrl ? (
                      <div className="relative h-14 w-14 overflow-hidden border border-[var(--line)] bg-[var(--canvas)]">
                        <img
                          src={m.evidenceImageUrl}
                          alt={m.stageName}
                          className="h-full w-full object-cover group-hover:scale-110 transition-transform"
                        />
                      </div>
                    ) : isNextDue ? (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => handleSnooze(m.id)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {t.snoozeReminder}
                        </button>
                        <Link
                          href={`/farmer/capture?milestone=${m.id}&crop=${selectedCrop}`}
                          className="fp-btn-primary gap-1.5 px-4 py-2 text-xs"
                        >
                          <Camera className="h-3.5 w-3.5" />
                          <span>{t.captureMilestoneNow}</span>
                        </Link>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium italic">
                        {lang === "hi" ? "आगामी चरण" : "Upcoming stage"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column (4 cols): Cadence & Alert Settings Card */}
        <div className="lg:col-span-4 space-y-5">
          {/* Notification Preferences */}
          <div className="fp-panel space-y-4 p-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Bell className="h-5 w-5 text-emerald-800" />
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                {t.reminderNotificationChannels}
              </h2>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2 text-slate-800 font-medium">
                  <Smartphone className="h-4 w-4 text-emerald-700" />
                  <span>{t.smsAlerts}</span>
                </div>
                <input
                  type="checkbox"
                  checked={smsEnabled}
                  onChange={(e) => setSmsEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--line)]"
                />
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2 text-slate-800 font-medium">
                  <MessageSquare className="h-4 w-4 text-emerald-700" />
                  <span>{t.whatsappAlerts}</span>
                </div>
                <input
                  type="checkbox"
                  checked={whatsappEnabled}
                  onChange={(e) => setWhatsappEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--line)]"
                />
              </div>

              <div className="pt-2 text-[11px] text-slate-500">
                <strong>{t.reminderFrequency}:</strong> {t.reminderFrequency30}
              </div>
            </div>
          </div>

          {/* PMFBY Digital Baseline Explainer */}
          <div className="fp-panel space-y-3 p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
              <ShieldCheck className="h-4 w-4" />
              <span>{lang === "hi" ? "30-दिवसीय लाभ" : "Digital Baseline Benefits"}</span>
            </div>
            <h3 className="text-sm font-bold">
              {lang === "hi"
                ? "नियमित फोटो लेने से क्या लाभ है?"
                : "Why Maintain a Growth Timeline?"}
            </h3>
            <ul className="space-y-2 text-xs text-slate-700">
              <li className="flex items-start gap-2">
                <span className="text-emerald-700 font-bold">1.</span>
                <span>
                  {lang === "hi"
                    ? "आपदा के समय पूर्व-क्षति साक्ष्य तुरंत उपलब्ध रहता है।"
                    : "Instantly proves healthy pre-disaster baseline foliage."}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-700 font-bold">2.</span>
                <span>
                  {lang === "hi"
                    ? "दावा निपटान समय 45 दिन से घटकर मात्र 48 घंटे रह जाता है।"
                    : "Reduces claim dispute resolution from 45 days to 48 hours."}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-700 font-bold">3.</span>
                <span>
                  {lang === "hi"
                    ? "भू-स्थानिक उपग्रह डेटा के साथ 100% सटीक मिलान।"
                    : "100% matched with satellite vegetation indices (NDVI)."}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
