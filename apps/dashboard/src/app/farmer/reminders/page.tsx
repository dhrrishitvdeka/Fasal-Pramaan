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
  MapPin,
  Landmark,
  Layers,
  Calculator,
  Compass,
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
import {
  katthaToHectares,
  toKattha,
  getAreaBreakdown,
  type AreaUnit,
} from "@/lib/land-units";
import { buildDefaultMilestones } from "@/lib/growth-stages";
import { milestoneFromRow } from "@/lib/web-db";
import clsx from "clsx";

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi (NCT)",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

const SOIL_TYPES = [
  { value: "Alluvial / Loam", labelEn: "Alluvial / Loam (दोमट)", labelHi: "दोमट / कछारी मिट्टी" },
  { value: "Clay / Heavy", labelEn: "Clay / Heavy (चिकनी)", labelHi: "चिकनी / मटियारी मिट्टी" },
  { value: "Sandy Loam", labelEn: "Sandy Loam (बलुई दोमट)", labelHi: "बलुई दोमट मिट्टी" },
  { value: "Black Cotton", labelEn: "Black Cotton (काली)", labelHi: "काली कपासी मिट्टी" },
  { value: "Red / Yellow", labelEn: "Red / Yellow (लाल-पीली)", labelHi: "लाल / पीली मिट्टी" },
  { value: "Laterite", labelEn: "Laterite (लैटेराइट)", labelHi: "लैटेराइट मिट्टी" },
];

const IRRIGATION_TYPES = [
  { value: "Tube-well", labelEn: "Tube-well / Borewell (नलकूप)", labelHi: "नलकूप / बोरवेल" },
  { value: "Canal", labelEn: "Canal (नहर)", labelHi: "नहर / राजकीय सिंचाई" },
  { value: "River Lift / Pond", labelEn: "River Lift / Pond (तालाब/नदी)", labelHi: "नदी / तालाब / लिफ्ट" },
  { value: "Rainfed", labelEn: "Rainfed / Barani (वर्षा आधारित)", labelHi: "वर्षा आधारित (बारानी)" },
  { value: "Drip / Sprinkler", labelEn: "Drip / Sprinkler (ड्रिप/फव्वारा)", labelHi: "ड्रिप / स्प्रिंकलर सिंचाई" },
];

export default function FarmerRemindersPage() {
  const { lang, milestones, plots, snoozeMilestone, refresh, addPlot, addMilestones, persistError } = useFarmerData();
  const t = getFarmerT(lang);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [prefs, setPrefs] = useState<FarmerAlertPrefs>({ sms: true, whatsapp: true });

  const [plotForm, setPlotForm] = useState({
    name: "",
    state: "Andhra Pradesh",
    district: "",
    tehsil: "",
    village: "",
    khataNumber: "",
    khasraNumber: "",
    hissaNumber: "",
    ownershipType: "owner",
    areaKattha: "10",
    areaUnit: "kattha" as AreaUnit,
    soilType: "",
    irrigationType: "",
    season: "",
    cropType: "wheat",
    cropVariety: "",
    sowingDate: todayIsoDate(),
    lat: "",
    lon: "",
  });

  const sections = useMemo(() => groupMilestonesByPlot(plots, milestones), [plots, milestones]);
  const [selectedPlotId, setSelectedPlotId] = useState("");

  const currentKattha = useMemo(() => {
    const raw = parseFloat(plotForm.areaKattha) || 0;
    return toKattha(raw, plotForm.areaUnit);
  }, [plotForm.areaKattha, plotForm.areaUnit]);

  const areaBreakdown = useMemo(() => getAreaBreakdown(currentKattha), [currentKattha]);

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

  const handleDetectGps = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      showToast(lang === "hi" ? "ब्राउज़र में जीपीएस समर्थित नहीं है।" : "GPS is not supported on this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPlotForm((prev) => ({
          ...prev,
          lat: pos.coords.latitude.toFixed(6),
          lon: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
        showToast(
          lang === "hi"
            ? `जीपीएस दर्ज: ${pos.coords.latitude.toFixed(4)}°N, ${pos.coords.longitude.toFixed(4)}°E (सटीकता ±${Math.round(pos.coords.accuracy)}m)`
            : `GPS Captured: ${pos.coords.latitude.toFixed(4)}°N, ${pos.coords.longitude.toFixed(4)}°E (±${Math.round(pos.coords.accuracy)}m)`,
        );
      },
      (err) => {
        setLocating(false);
        showToast(lang === "hi" ? "जीपीएस स्थान प्राप्त करने में विफल।" : `GPS Error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
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

  const registerPlot = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!plotForm.name.trim()) {
      showToast(lang === "hi" ? "कृपया भूखंड का नाम दर्ज करें।" : "Please enter a plot name.");
      return;
    }
    setBusy(true);
    try {
      const areaHa = katthaToHectares(currentKattha);
      const payload = {
        name: plotForm.name.trim(),
        nameHi: plotForm.name.trim(),
        khasraNumber: plotForm.khasraNumber.trim(),
        khataNumber: plotForm.khataNumber.trim(),
        hissaNumber: plotForm.hissaNumber.trim(),
        tehsil: plotForm.tehsil.trim(),
        village: plotForm.village.trim(),
        district: plotForm.district.trim(),
        state: plotForm.state.trim(),
        ownershipType: plotForm.ownershipType,
        season: plotForm.season,
        areaKattha: currentKattha,
        areaHectares: areaHa,
        cropType: plotForm.cropType,
        cropVariety: plotForm.cropVariety.trim(),
        soilType: plotForm.soilType,
        irrigationType: plotForm.irrigationType,
        sowingDate: plotForm.sowingDate || todayIsoDate(),
        lat: plotForm.lat ? parseFloat(plotForm.lat) : undefined,
        lon: plotForm.lon ? parseFloat(plotForm.lon) : undefined,
      };

      let createdPlotId = `plot_${Date.now()}`;

      if (isSupabaseConfigured()) {
        const res = await apiFetch("/api/farmer/plots", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; plotId?: string };
        if (!res.ok) throw new Error(body.error || "Could not register plot");
        if (body.plotId) createdPlotId = body.plotId;
        await refresh();
      } else {
        const newPlot: FarmerPlot = {
          id: createdPlotId,
          name: payload.name,
          nameHi: payload.nameHi,
          khasraNumber: payload.khasraNumber,
          khataNumber: payload.khataNumber,
          hissaNumber: payload.hissaNumber,
          tehsil: payload.tehsil,
          ownershipType: payload.ownershipType,
          season: payload.season,
          areaHectares: payload.areaHectares,
          areaKattha: payload.areaKattha,
          cropType: payload.cropType,
          cropTypeHi: payload.cropType,
          cropVariety: payload.cropVariety,
          currentStage: "Sowing",
          currentStageHi: "बुवाई",
          sowingDate: payload.sowingDate,
          soilType: payload.soilType,
          soilTypeHi: payload.soilType,
          irrigationType: payload.irrigationType,
          irrigationTypeHi: payload.irrigationType,
          lat: payload.lat ?? 0,
          lon: payload.lon ?? 0,
          village: payload.village,
          district: payload.district,
          state: payload.state,
        };
        addPlot(newPlot);
      }

      setSelectedPlotId(createdPlotId);
      setPlotForm({
        name: "",
        state: "Andhra Pradesh",
        district: "",
        tehsil: "",
        village: "",
        khataNumber: "",
        khasraNumber: "",
        hissaNumber: "",
        ownershipType: "owner",
        areaKattha: "10",
        areaUnit: "kattha",
        soilType: "",
        irrigationType: "",
        season: "",
        cropType: "wheat",
        cropVariety: "",
        sowingDate: todayIsoDate(),
        lat: "",
        lon: "",
      });
      showToast(
        lang === "hi"
          ? "भूखंड और 30-दिवसीय समय-सीमा सफलतापूर्वक पंजीकृत हो गई!"
          : "Plot & 30-day timeline registered successfully!",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not register plot");
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
                        "shrink-0 rounded-lg border px-3 py-2 text-xs font-bold",
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
                <span className="hidden sm:inline">{section?.plot?.cropType || ""}</span>
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
                        <h3 className="text-sm font-bold text-slate-900 sm:text-base">
                          {lang === "hi" ? m.stageNameHi || m.stageName : m.stageName}
                        </h3>
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
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
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
                        <Link href={milestoneCaptureHref(m)} className="fp-btn-primary gap-1.5 px-4 py-2 text-xs">
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

          <form
            id="register-plot"
            className="fp-panel space-y-4 p-4 sm:p-6 border-emerald-700/20 shadow-xs"
            onSubmit={registerPlot}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-emerald-800" />
                  <span>{t.registerPlot} · {lang === "hi" ? "राजस्व भूलेख विवरण" : "Land Revenue Record"}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {lang === "hi"
                    ? "PMFBY एवं राज्य भूलेख (Bhulekh / RoR) मानक अनुसार आधिकारिक विवरण भरें।"
                    : "Official cadastral & crop details as per PMFBY & State Bhulekh (RoR) standards."}
                </p>
              </div>
              <span className="fp-badge-ok self-start sm:self-auto text-[10px] font-mono">
                {lang === "hi" ? "कट्ठा मानक" : "Kattha Units"}
              </span>
            </div>

            {/* Section 1: Cadastral Identification */}
            <div className="space-y-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-emerald-700" />
                <span>{lang === "hi" ? "१. राजस्व एवं भूलेख पहचान" : "1. Cadastral & Land Revenue Identity"}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotName} <span className="text-red-500">*</span>
                  <input
                    required
                    placeholder={lang === "hi" ? "उदा. उत्तर वाला खेत / ट्यूबवेल प्लॉट" : "e.g. North Canal Field"}
                    value={plotForm.name}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="fp-input mt-1"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotState}
                  <select
                    value={plotForm.state}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, state: e.target.value }))}
                    className="fp-input mt-1"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotDistrict}
                  <input
                    placeholder={lang === "hi" ? "उदा. पटना / रोहतास / मेरठ" : "e.g. Patna / Rohtas / Meerut"}
                    value={plotForm.district}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, district: e.target.value }))}
                    className="fp-input mt-1"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotTehsil}
                  <input
                    placeholder={lang === "hi" ? "उदा. बिक्रम / दानापुर" : "e.g. Bikram / Danapur"}
                    value={plotForm.tehsil}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, tehsil: e.target.value }))}
                    className="fp-input mt-1"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotVillage}
                  <input
                    placeholder={lang === "hi" ? "उदा. जगदीशपुर" : "e.g. Jagdishpur"}
                    value={plotForm.village}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, village: e.target.value }))}
                    className="fp-input mt-1"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotTenancy}
                  <select
                    value={plotForm.ownershipType}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, ownershipType: e.target.value }))}
                    className="fp-input mt-1"
                  >
                    <option value="owner">{lang === "hi" ? "खुदकाश्त (भू-स्वामी / Owner)" : "Owner / Self-Cultivated"}</option>
                    <option value="tenant">{lang === "hi" ? "काश्तकार (किरायेदार / Tenant)" : "Tenant / Cash Leased"}</option>
                    <option value="sharecropper">{lang === "hi" ? "बटाईदार (Sharecropper)" : "Sharecropper / Batai"}</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotKhata}
                  <input
                    placeholder={lang === "hi" ? "उदा. खाता नं. 42 / 108" : "e.g. Khata 42 / 108"}
                    value={plotForm.khataNumber}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, khataNumber: e.target.value }))}
                    className="fp-input mt-1"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotKhasra} <span className="text-red-500">*</span>
                  <input
                    required
                    placeholder={lang === "hi" ? "उदा. 125/2 / गाटा 340" : "e.g. 125/2 / Survey 340"}
                    value={plotForm.khasraNumber}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, khasraNumber: e.target.value }))}
                    className="fp-input mt-1"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotHissa}
                  <input
                    placeholder={lang === "hi" ? "उदा. हिस्सा 1 / 2A" : "e.g. 1 / 2A"}
                    value={plotForm.hissaNumber}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, hissaNumber: e.target.value }))}
                    className="fp-input mt-1"
                  />
                </label>
              </div>
            </div>

            {/* Section 2: Land Area in Kattha with Live Conversion */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                  <Calculator className="h-3.5 w-3.5 text-emerald-700" />
                  <span>{lang === "hi" ? "२. कट्ठा में क्षेत्रफल एवं भूमि प्रकार" : "2. Area (in Kattha) & Soil/Irrigation"}</span>
                </div>
                <span className="text-[11px] text-emerald-800 font-medium">
                  {lang === "hi" ? "१ बीघा = २० कट्ठा · १ कट्ठा = १३६१.२५ वर्ग फुट" : "1 Bigha = 20 Kattha · 1 Kattha = 1,361.25 sq ft"}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-start">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                    <span>{t.addPlotAreaKattha} <span className="text-red-500">*</span></span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      {lang === "hi" ? "इकाई बदलें:" : "Unit:"}
                    </span>
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      required
                      min="0.1"
                      step="0.1"
                      placeholder="10"
                      value={plotForm.areaKattha}
                      onChange={(e) => setPlotForm((prev) => ({ ...prev, areaKattha: e.target.value }))}
                      className="fp-input font-bold text-emerald-950 flex-1"
                    />
                    <select
                      value={plotForm.areaUnit}
                      onChange={(e) => setPlotForm((prev) => ({ ...prev, areaUnit: e.target.value as AreaUnit }))}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-800"
                    >
                      <option value="kattha">{lang === "hi" ? "कट्ठा (Kattha)" : "Kattha"}</option>
                      <option value="bigha">{lang === "hi" ? "बीघा (Bigha)" : "Bigha"}</option>
                      <option value="acre">{lang === "hi" ? "एकड़ (Acre)" : "Acre"}</option>
                      <option value="hectare">{lang === "hi" ? "हेक्टेयर (Ha)" : "Hectare"}</option>
                    </select>
                  </div>
                </div>

                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotSoil}
                  <select
                    value={plotForm.soilType}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, soilType: e.target.value }))}
                    className="fp-input mt-1"
                  >
                    <option value="">{lang === "hi" ? "सेट नहीं" : "Not set"}</option>
                    {SOIL_TYPES.map((st) => (
                      <option key={st.value} value={st.value}>
                        {lang === "hi" ? st.labelHi : st.labelEn}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotIrrigation}
                  <select
                    value={plotForm.irrigationType}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, irrigationType: e.target.value }))}
                    className="fp-input mt-1"
                  >
                    <option value="">{lang === "hi" ? "सेट नहीं" : "Not set"}</option>
                    {IRRIGATION_TYPES.map((it) => (
                      <option key={it.value} value={it.value}>
                        {lang === "hi" ? it.labelHi : it.labelEn}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Live breakdown badge */}
              <div className="rounded-lg border border-emerald-300/80 bg-white p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                  {t.areaBreakdownLabel}: {areaBreakdown.kattha} {lang === "hi" ? "कट्ठा" : "Kattha"}
                </span>
                <div className="flex flex-wrap gap-2 text-[11px] font-mono text-slate-700">
                  <span className="rounded bg-slate-100 px-2 py-0.5">
                    <strong>{areaBreakdown.bigha}</strong> {lang === "hi" ? "बीघा" : "Bigha"}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5">
                    <strong>{areaBreakdown.acres}</strong> {lang === "hi" ? "एकड़" : "Acres"}
                  </span>
                  <span className="rounded bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5">
                    <strong>{areaBreakdown.hectares}</strong> {lang === "hi" ? "हेक्टेयर (Ha)" : "Hectares"}
                  </span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500">
                    {areaBreakdown.sqFt.toLocaleString()} sq ft
                  </span>
                </div>
              </div>
            </div>

            {/* Section 3: Crop, Season & Sowing */}
            <div className="space-y-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-emerald-700" />
                <span>{lang === "hi" ? "३. फसल, मौसम एवं बुवाई विवरण" : "3. Crop, Season & Sowing Details"}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotSeason}
                  <select
                    value={plotForm.season}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, season: e.target.value }))}
                    className="fp-input mt-1"
                  >
                    <option value="">{lang === "hi" ? "सेट नहीं" : "Not set"}</option>
                    <option value="Rabi">{lang === "hi" ? "रबी (Rabi - शीतकालीन)" : "Rabi (Winter Season)"}</option>
                    <option value="Kharif">{lang === "hi" ? "खरीफ (Kharif - मानसूनी)" : "Kharif (Monsoon Season)"}</option>
                    <option value="Zaid">{lang === "hi" ? "जायद (Zaid - ग्रीष्मकालीन)" : "Zaid (Summer Season)"}</option>
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotCrop}
                  <select
                    value={plotForm.cropType}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, cropType: e.target.value }))}
                    className="fp-input mt-1"
                  >
                    <option value="wheat">Wheat / गेहूँ</option>
                    <option value="paddy">Paddy / धान</option>
                    <option value="maize">Maize / मक्का</option>
                    <option value="mustard">Mustard / सरसों</option>
                    <option value="potato">Potato / आलू</option>
                    <option value="sugarcane">Sugarcane / गन्ना</option>
                    <option value="cotton">Cotton / कपास</option>
                    <option value="soybean">Soybean / सोयाबीन</option>
                    <option value="gram">Gram / चना</option>
                    <option value="groundnut">Groundnut / मूंगफली</option>
                    <option value="onion">Onion / प्याज़</option>
                    <option value="pulses">Pulses / दालें</option>
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  {lang === "hi" ? "फसल किस्म (Variety)" : "Crop Variety"}
                  <input
                    placeholder={lang === "hi" ? "उदा. HD-2967 / PB-1509" : "e.g. HD-2967 / PB-1509"}
                    value={plotForm.cropVariety}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, cropVariety: e.target.value }))}
                    className="fp-input mt-1"
                  />
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  {t.addPlotSowing} <span className="text-red-500">*</span>
                  <input
                    type="date"
                    required
                    value={plotForm.sowingDate}
                    onChange={(e) => setPlotForm((prev) => ({ ...prev, sowingDate: e.target.value }))}
                    className="fp-input mt-1"
                  />
                </label>
              </div>
            </div>

            {/* Section 4: GPS Geo-location (Sensor Geotag Only) */}
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3.5 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                  <span>{lang === "hi" ? "४. खेत का जीपीएस भू-स्थान (Geo-Tagging)" : "4. Field GPS Geo-Tagging"}</span>
                </div>
                <button
                  type="button"
                  onClick={handleDetectGps}
                  disabled={locating}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 transition-all active:scale-95 disabled:opacity-60"
                >
                  <MapPin className={clsx("h-3.5 w-3.5", locating && "animate-spin")} />
                  <span>
                    {locating
                      ? (lang === "hi" ? "सेंसर से स्थान ले रहे हैं…" : "Detecting GPS…")
                      : plotForm.lat && plotForm.lon
                        ? (lang === "hi" ? "पुनः जीपीएस लें" : "Update GPS Fix")
                        : t.addPlotAutoGps}
                  </span>
                </button>
              </div>

              {plotForm.lat && plotForm.lon ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300/80 bg-white p-3 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-mono text-xs font-bold text-slate-900">
                        {parseFloat(plotForm.lat).toFixed(6)}° N, {parseFloat(plotForm.lon).toFixed(6)}° E
                      </div>
                      <div className="text-[11px] text-emerald-800 font-medium mt-0.5">
                        {lang === "hi" ? "✓ डिवाइस सेंसर से जीपीएस सत्यापित" : "✓ Device GPS sensor geofenced"}
                      </div>
                    </div>
                  </div>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-emerald-900">
                    {lang === "hi" ? "सत्यापित फिक्स" : "Verified Fix"}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-slate-300 bg-white/80 p-3 text-xs text-slate-600">
                  <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                  <p className="leading-relaxed">
                    {lang === "hi"
                      ? "खेत पर खड़े होकर 'वर्तमान जीपीएस' बटन दबाएँ। सुरक्षा एवं PMFBY नियमों के तहत निर्देशांक सीधे डिवाइस सेंसर से दर्ज किए जाते हैं।"
                      : "Tap 'Auto-Detect Live GPS' while at the field. To comply with PMFBY standards, coordinates are captured directly from device sensors."}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {lang === "hi"
                  ? "✓ पंजीकरण करते ही 30, 60, 90 दिन एवं कटाई समय-सीमा स्वचालित सक्रिय हो जाएगी।"
                  : "✓ Submitting will instantly activate your 30, 60, 90 day and harvest growth timeline."}
              </p>
              <button
                type="submit"
                disabled={busy}
                className="fp-btn-primary min-h-11 w-full sm:w-auto px-6 py-2.5 text-xs sm:text-sm font-bold shadow-xs transition-all active:scale-95"
              >
                {busy
                  ? (lang === "hi" ? "पंजीकृत हो रहा है…" : "Registering…")
                  : (lang === "hi" ? "✓ भूखंड एवं 30-दिवसीय समय-सीमा पंजीकृत करें" : "✓ Register Plot & Start Timeline")}
              </button>
            </div>
          </form>
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
                  className="h-4 w-4 rounded border-[var(--line)]"
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
                  className="h-4 w-4 rounded border-[var(--line)]"
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
