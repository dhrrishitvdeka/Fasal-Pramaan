"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Camera,
  CheckCircle2,
  Bell,
  Smartphone,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { useFarmerData, type FarmerPlot } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import { apiFetch } from "@/lib/auth-headers";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  FARMER_ALERT_PREFS_KEY,
  groupMilestonesByPlot,
  isMilestoneOverdue,
  milestoneCaptureHref,
  milestoneDueState,
  nextOpenMilestone,
  parseFarmerAlertPrefs,
  pickDefaultPlotId,
  todayIsoDate,
  type FarmerAlertPrefs,
} from "@/lib/farmer-timeline";
import { buildDefaultMilestones } from "@/lib/growth-stages";
import { milestoneFromRow } from "@/lib/web-db";
import PlotRegistrationForm from "@/components/PlotRegistrationForm";
import clsx from "clsx";

export default function FarmerRemindersPage() {
  const { lang, milestones, plots, snoozeMilestone, refresh, addPlot, addMilestones, persistError } = useFarmerData();
  const t = getFarmerT(lang);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<FarmerAlertPrefs>({ sms: true, whatsapp: true });

  const sections = useMemo(() => groupMilestonesByPlot(plots, milestones), [plots, milestones]);
  const [selectedPlotId, setSelectedPlotId] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FARMER_ALERT_PREFS_KEY);
      setPrefs(parseFarmerAlertPrefs(raw ? JSON.parse(raw) : {}));
    } catch {
      setPrefs({ sms: true, whatsapp: true });
    }
  }, []);

  useEffect(() => {
    if (!selectedPlotId || !sections.some((section) => section.plotId === selectedPlotId)) {
      setSelectedPlotId(pickDefaultPlotId(sections));
    }
  }, [sections, selectedPlotId]);

  const section = sections.find((item) => item.plotId === selectedPlotId) || sections[0];
  const plotMilestones = section?.milestones || [];
  const nextDue = nextOpenMilestone(plotMilestones);
  const completedCount = plotMilestones.filter((item) => item.completed).length;
  const totalCount = plotMilestones.length;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  };

  const savePrefs = (next: FarmerAlertPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(FARMER_ALERT_PREFS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleSnooze = (id: string, days: number) => {
    if (!Number.isInteger(days) || days < 1 || days > 7) return;
    void snoozeMilestone(id, days);
    showToast(
      lang === "hi" ? `अनुस्मारक ${days} दिन आगे बढ़ाया गया।` : `Reminder snoozed by ${days} days.`,
    );
  };

  const seedTimeline = async (plotId: string) => {
    setBusy(true);
    try {
      if (isSupabaseConfigured()) {
        const res = await apiFetch(`/api/farmer/plots/${encodeURIComponent(plotId)}/timeline`, {
          method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error || "Could not start timeline");
        await refresh();
      } else {
        const targetPlot = plots.find((p) => p.id === plotId);
        const defaults = buildDefaultMilestones({
          plotId,
          cropName: targetPlot?.cropType || "wheat",
          cropNameHi: targetPlot?.cropTypeHi || "गेहूं",
          sowingDate: targetPlot?.sowingDate || todayIsoDate(),
          createdBy: "farmer",
        }).map((m) => milestoneFromRow(m as any));
        addMilestones(defaults);
      }
      showToast(lang === "hi" ? "समय-सीमा शुरू हो गई।" : "Timeline started.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not start timeline");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fp-panel fixed left-3 right-3 top-20 z-50 flex items-center gap-2 px-3 py-2.5 text-xs sm:left-auto sm:right-4 sm:max-w-sm sm:text-sm">
          <CheckCircle2 className="h-5 w-5" />
          <span>{toast}</span>
        </div>
      )}
      {persistError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-950">
          {persistError}
        </div>
      )}

      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between sm:pb-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900 sm:text-2xl">
            <Calendar className="h-5 w-5 sm:h-6 sm:w-6" />
            <span>{t.remindersTitle}</span>
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-slate-600 sm:text-sm">{t.remindersSub}</p>
        </div>
        {nextDue ? (
          <Link href={milestoneCaptureHref(nextDue)} className="fp-btn-primary w-full gap-2 sm:w-auto">
            <Camera className="h-4 w-4" />
            <span>{t.captureMilestoneNow}</span>
          </Link>
        ) : null}
      </div>

      <div className="fp-panel p-3 sm:p-5">
        {sections.length === 0 ? (
          <p className="text-sm text-slate-600">{t.noPlotsForTimeline}</p>
        ) : (
          <>
            <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
              <div className="flex gap-2 overflow-x-auto">
                {sections.map((item) => {
                  const label = item.plot
                    ? lang === "hi"
                      ? item.plot.nameHi || item.plot.name
                      : item.plot.name
                    : item.milestones[0]?.cropName || item.plotId;
                  const overdue = item.milestones.some((m) => isMilestoneOverdue(m));
                  return (
                    <button
                      key={item.plotId}
                      type="button"
                      onClick={() => setSelectedPlotId(item.plotId)}
                      className={clsx(
                        "shrink-0 rounded-lg border px-3 py-2 text-xs font-bold min-h-11 inline-flex items-center",
                        selectedPlotId === item.plotId
                          ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]"
                          : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]",
                      )}
                    >
                      {label}
                      {overdue ? " · !" : ""}
                    </button>
                  );
                })}
              </div>
              <span className="fp-badge-neutral font-mono">
                {completedCount} / {totalCount} {lang === "hi" ? "अवस्थाएं पूर्ण" : "Stages logged"}
              </span>
            </div>
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-[10px] font-medium text-slate-500 sm:text-[11px]">
                <span>{lang === "hi" ? "बुवाई" : "Sowing"}</span>
                <span>{section?.plot?.cropType || ""}</span>
                <span>{lang === "hi" ? "कटाई" : "Harvest"}</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                <div
                  className="h-full bg-[var(--ink)]"
                  style={{ width: `${totalCount ? (completedCount / totalCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          {section && plotMilestones.length === 0 && section.plot ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              <p>{t.noStagesForPlot}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void seedTimeline(section.plotId)}
                className="fp-btn-primary mt-3 text-xs"
              >
                {t.seedTimeline}
              </button>
            </div>
          ) : null}
          {plotMilestones.map((m) => {
            const state = milestoneDueState(m, nextDue?.id);
            return (
              <div
                key={m.id}
                className={clsx(
                  "fp-panel relative p-3 sm:p-5",
                  state === "overdue" || state === "next" ? "border-[var(--ink)]" : "",
                  state === "upcoming" ? "opacity-70" : "",
                )}
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={clsx(
                        "flex h-11 w-11 shrink-0 items-center justify-center font-mono text-sm",
                        state === "completed" || state === "next" || state === "overdue"
                          ? "bg-[var(--ink)] text-[var(--surface)]"
                          : "border border-[var(--line)] text-[var(--ink-muted)]",
                      )}
                    >
                      {m.completed ? <CheckCircle2 className="h-6 w-6" /> : `D${m.dayNumber}`}
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-900 sm:text-base">
                          {lang === "hi" ? m.stageNameHi || m.stageName : m.stageName}
                        </h2>
                        {state === "completed" && <span className="fp-badge-ok">{t.completedBadge}</span>}
                        {state === "next" && <span className="fp-badge-alert">{t.nextDueBadge}</span>}
                        {state === "overdue" && <span className="fp-badge-alert">{t.overdueBadge}</span>}
                      </div>
                      {m.notes ? <p className="text-xs leading-relaxed text-slate-600">{m.notes}</p> : null}
                      <div className="pt-1 font-mono text-xs text-slate-500">
                        {m.completed
                          ? `${lang === "hi" ? "सत्यापित तिथि:" : "Captured on:"} ${m.completedDate}`
                          : `${lang === "hi" ? "देय तिथि:" : "Due date:"} ${m.dueDate}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 pt-2 sm:border-t-0 sm:pt-0">
                    {m.completed && m.evidenceImageUrl ? (
                      <div className="relative h-14 w-14 overflow-hidden border border-[var(--line)] bg-[var(--canvas)]">
                        <img src={m.evidenceImageUrl} alt={m.stageName} className="h-full w-full object-cover" />
                      </div>
                    ) : state === "next" || state === "overdue" ? (
                      <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <label className="sr-only" htmlFor={`snooze-${m.id}`}>
                          {t.snoozeDays}
                        </label>
                        <select
                          id={`snooze-${m.id}`}
                          defaultValue=""
                          onChange={(event) => {
                            const days = Number(event.target.value);
                            event.currentTarget.value = "";
                            handleSnooze(m.id, days);
                          }}
                          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                        >
                          <option value="" disabled>
                            {t.snoozeDays}
                          </option>
                          {[1, 2, 3, 4, 5, 6, 7].map((days) => (
                            <option key={days} value={days}>
                              {days}
                            </option>
                          ))}
                        </select>
                        <Link href={milestoneCaptureHref(m)} className="fp-btn-primary min-h-11 gap-1.5 px-4 py-2 text-xs">
                          <Camera className="h-3.5 w-3.5" />
                          <span>{t.captureMilestoneNow}</span>
                        </Link>
                      </div>
                    ) : (
                      <span className="text-xs font-medium italic text-slate-400">
                        {lang === "hi" ? "आगामी चरण" : "Upcoming stage"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <PlotRegistrationForm
            id="register-plot"
            mode="timeline"
            collapsible
            defaultOpen={plots.length === 0}
            onSuccess={(newPlotId) => {
              setSelectedPlotId(newPlotId);
              showToast(
                lang === "hi"
                  ? "भूखंड एवं 30-दिवसीय समय-सीमा सफलतापूर्वक पंजीकृत हो गई!"
                  : "Plot & 30-day timeline registered successfully!",
              );
            }}
          />
        </div>

        <div className="space-y-5 lg:col-span-4">
          <div className="fp-panel space-y-4 p-3 sm:p-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Bell className="h-5 w-5 text-emerald-800" />
              <h2 className="text-sm font-bold text-slate-900 sm:text-base">{t.reminderNotificationChannels}</h2>
            </div>
            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2">
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <Smartphone className="h-4 w-4 text-emerald-700" />
                  {t.smsAlerts}
                </span>
                <input
                  type="checkbox"
                  checked={prefs.sms}
                  onChange={(e) => savePrefs({ ...prefs, sms: e.target.checked })}
                  className="h-6 w-6 shrink-0 rounded border-[var(--line)]"
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2">
                <span className="flex items-center gap-2 font-medium text-slate-800">
                  <MessageSquare className="h-4 w-4 text-emerald-700" />
                  {t.whatsappAlerts}
                </span>
                <input
                  type="checkbox"
                  checked={prefs.whatsapp}
                  onChange={(e) => savePrefs({ ...prefs, whatsapp: e.target.checked })}
                  className="h-6 w-6 shrink-0 rounded border-[var(--line)]"
                />
              </label>
              <p className="text-[11px] text-slate-500">{t.alertPrefsDeviceOnly}</p>
              <p className="text-[11px] text-slate-500">
                <strong>{t.reminderFrequency}:</strong> {t.reminderFrequency30}
              </p>
            </div>
          </div>

          <div className="fp-panel space-y-3 p-3 sm:p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-800">
              <ShieldCheck className="h-4 w-4" />
              <span>{lang === "hi" ? "30-दिवसीय लाभ" : "Digital baseline"}</span>
            </div>
            <h3 className="text-sm font-bold">{t.timelineWhy}</h3>
            <ul className="space-y-2 text-xs text-slate-700">
              <li className="flex items-start gap-2">
                <span className="font-bold text-emerald-700">1.</span>
                <span>{t.timelineBenefit1}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-emerald-700">2.</span>
                <span>{t.timelineBenefit2}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-emerald-700">3.</span>
                <span>{t.timelineBenefit3}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
