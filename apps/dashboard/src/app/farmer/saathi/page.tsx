"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Mic,
  Send,
  Sprout,
  Loader2,
  ArrowRight,
  Camera,
  Volume2,
  Flame,
  Waves,
  Bug,
  CloudRain,
  Compass,
  SunMedium,
  Layers,
  Wind,
  RotateCcw,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import { nativeLabelForLang } from "@/lib/live-indian-languages";
import { saathiRouteLabel, useSaathiSession } from "@/lib/saathi/session-provider";
import clsx from "clsx";

export default function SaathiIntakePage() {
  const { lang } = useFarmerData();
  const t = getFarmerT(lang);
  const {
    messages,
    slots,
    liveStatus,
    isAnalyzing,
    connectVoice,
    toggleVoice,
    resetSession,
    sendText,
    proceedToCapture,
  } = useSaathiSession();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autoStartedRef = useRef(false);
  const perilSeededRef = useRef(false);
  const search = useSearchParams();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (perilSeededRef.current) return;
    const raw = search.get("peril");
    if (!raw) return;
    perilSeededRef.current = true;
    void sendText(raw.replace(/_/g, " "), "text");
  }, [search, sendText]);

  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (typeof window === "undefined" || !("WebSocket" in window)) return;
    if (liveStatus === "idle" || liveStatus === "error") void connectVoice();
    // Share the layout-level session — do not start a second socket if already live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canProceed = Boolean(slots.peril);
  const route = saathiRouteLabel(slots);

  const quickPerils = [
    { peril: "normal", label: "Normal damage", icon: Layers, phrase: "I have normal crop damage", color: "bg-emerald-700 hover:bg-emerald-800", labelColor: "text-emerald-800" },
    { peril: "fire_burn", label: "Fire / Burn", icon: Flame, phrase: t.perilFirePhrase, color: "bg-red-700 hover:bg-red-800", labelColor: "text-red-800" },
    { peril: "animal_damage", label: "Animal damage", icon: Compass, phrase: t.perilAnimalsPhrase, color: "bg-amber-700 hover:bg-amber-800", labelColor: "text-amber-800" },
    { peril: "flood", label: "Flood", icon: Waves, phrase: t.perilFloodPhrase, color: "bg-blue-700 hover:bg-blue-800", labelColor: "text-blue-800" },
    { peril: "drought", label: "Drought", icon: SunMedium, phrase: "Dry spell damaged my crop", color: "bg-orange-700 hover:bg-orange-800", labelColor: "text-orange-800" },
    { peril: "pest_disease", label: "Pest / Disease", icon: Bug, phrase: t.perilPestPhrase, color: "bg-fuchsia-700 hover:bg-fuchsia-800", labelColor: "text-fuchsia-800" },
    { peril: "hailstorm", label: "Hailstorm", icon: CloudRain, phrase: t.perilHailPhrase, color: "bg-sky-700 hover:bg-sky-800", labelColor: "text-sky-800" },
    { peril: "lodging", label: "Lodging", icon: Wind, phrase: "Wind lodged my crop", color: "bg-violet-700 hover:bg-violet-800", labelColor: "text-violet-800" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      <div className="fp-panel rounded-2xl p-4 sm:p-5 border border-stone-200/90 bg-[#fffdf9] shadow-2xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ink)] text-emerald-400 shadow-2xs">
              <Sprout className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-slate-900 sm:text-lg leading-tight truncate">
                {lang === "hi" ? "फसल साथी" : "Fasal Saathi"}
              </h1>
              <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                {lang === "hi" ? "आवाज़ से फसल नुकसान दर्ज करें" : "Field Voice Intake Assistant"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 whitespace-nowrap"
              title={lang === "hi" ? "सक्रिय भाषा" : "Active Language"}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              <span>{nativeLabelForLang(lang)}</span>
            </span>
            <button
              type="button"
              onClick={resetSession}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-800"
              aria-label={t.saathiReset}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.saathiReset}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="fp-panel rounded-2xl p-6 text-center sm:p-7 border border-stone-200/90 bg-[#fffdf9] shadow-2xs">
        <div className="relative mx-auto mb-4 flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center">
          {liveStatus === "live" ? (
            <>
              <span className="absolute inset-0 rounded-full bg-rose-500/25 animate-ping pointer-events-none" />
              <span className="absolute -inset-2 rounded-full bg-rose-400/20 animate-pulse pointer-events-none" />
            </>
          ) : liveStatus === "connecting" ? (
            <>
              <span className="absolute inset-0 rounded-full border border-cyan-400/30 bg-cyan-400/10 animate-ping pointer-events-none" />
              <span className="absolute -inset-2 rounded-full border border-slate-400/20 animate-pulse pointer-events-none" />
            </>
          ) : (
            <>
              <span className="absolute inset-0 rounded-full bg-emerald-500/15 mic-breathe-ring pointer-events-none" />
              <span className="absolute -inset-1.5 rounded-full bg-emerald-400/10 mic-breathe-subtle-ring pointer-events-none" />
            </>
          )}

          <button
            type="button"
            onClick={toggleVoice}
            aria-label={liveStatus === "live" ? t.saathiVoiceOff : t.saathiTapToSpeak}
            className={clsx(
              "group relative z-10 flex h-20 w-20 sm:h-22 sm:w-22 items-center justify-center rounded-full text-white transition-all duration-200 hover:scale-105 active:scale-95 shadow-md",
              liveStatus === "live"
                ? "bg-rose-600 shadow-rose-500/30 ring-4 ring-rose-200/80"
                : liveStatus === "connecting"
                  ? "bg-slate-950 border-2 border-cyan-300/70 shadow-[0_0_0_5px_rgba(34,211,238,0.12),0_12px_30px_rgba(15,23,42,0.35)]"
                  : "bg-[var(--ink)] border-2 border-emerald-500/40 hover:border-emerald-400 hover:shadow-emerald-500/20 hover:shadow-lg",
            )}
          >
            {liveStatus === "connecting" ? (
              <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
            ) : liveStatus === "live" ? (
              <div className="flex flex-col items-center justify-center gap-1">
                <Mic className="h-7 w-7 animate-pulse text-white" />
                <span className="flex items-center gap-0.5 h-2.5">
                  <span className="w-0.5 rounded-full bg-white sound-bar-1" />
                  <span className="w-0.5 rounded-full bg-white sound-bar-2" />
                  <span className="w-0.5 rounded-full bg-white sound-bar-3" />
                  <span className="w-0.5 rounded-full bg-white sound-bar-4" />
                  <span className="w-0.5 rounded-full bg-white sound-bar-5" />
                </span>
              </div>
            ) : (
              <Mic className="h-8 w-8 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)] transition-transform duration-200 group-hover:scale-110 group-hover:text-emerald-300" />
            )}
          </button>
        </div>

        <div className="space-y-1 select-none cursor-default">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 py-1 text-xs font-semibold shadow-2xs">
            {liveStatus === "live" ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
                <span className="text-rose-700">{t.saathiListening}</span>
              </>
            ) : liveStatus === "connecting" ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
                <span className="text-cyan-800">{t.saathiConnecting}</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-slate-700">{t.saathiTapToSpeak}</span>
              </>
            )}
          </div>
          <p className="text-[11px] text-slate-500">{t.saathiLangSupported}</p>
        </div>

        <div className="mt-6 w-full border-t border-stone-100 pt-5">
          <p className="mx-auto mb-5 w-fit text-center text-[10px] font-semibold uppercase leading-[1.35] tracking-[0.2em] text-slate-600 sm:text-[11px] sm:tracking-[0.16em]">
            {t.saathiCommonIssues}
          </p>
          <div className="mx-auto grid max-w-md grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4 sm:gap-x-7 sm:gap-y-7">
            {quickPerils.map((q) => {
              const Icon = q.icon;
              const isSelected = slots.peril === q.peril;
              return (
                <button
                  key={q.peril}
                  type="button"
                  onClick={() => {
                    void sendText(q.phrase, "voice");
                    if (liveStatus === "idle" || liveStatus === "error") void connectVoice();
                  }}
                  className="group flex w-full flex-col items-center gap-2 text-center"
                  aria-pressed={isSelected}
                >
                  <span
                    className={clsx(
                      "flex h-14 w-14 items-center justify-center rounded-full text-white shadow-md transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg sm:h-16 sm:w-16",
                      q.color,
                      isSelected && "ring-4 ring-[var(--ink)]/20 ring-offset-2"
                    )}
                  >
                    <Icon className="h-6 w-6 transition-transform duration-200 group-hover:scale-110 sm:h-7 sm:w-7" />
                  </span>
                  <span className={clsx("text-[11px] font-semibold leading-tight sm:text-xs", q.labelColor)}>
                    {q.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-[#fffdf9] p-4 shadow-[0_8px_24px_rgba(41,37,36,0.06)] sm:p-5">
        <div className="mb-4 flex items-center justify-between border-b border-stone-200 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ink)] text-emerald-300">
              <Sprout className="h-3.5 w-3.5" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-700 sm:text-xs">
              {t.saathiAssessmentConvo}
            </span>
          </div>
          {isAnalyzing && (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t.saathiAnalyzing}
            </span>
          )}
        </div>

        <div
          ref={scrollRef}
          className="max-h-[36vh] min-h-[16vh] space-y-3 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50/45 p-3 sm:p-4"
        >
          {messages.map((m) => (
            <div key={m.id} className={clsx("flex", m.role === "farmer" ? "justify-end" : "justify-start gap-2.5")}>
              {m.role !== "farmer" && (
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                  <Sprout className="h-3 w-3" />
                </div>
              )}
              <div
                className={clsx(
                  "max-w-[88%] px-3.5 py-2.5 text-xs leading-relaxed sm:text-sm",
                  m.role === "farmer"
                    ? "rounded-2xl rounded-br-md bg-[var(--ink)] text-white"
                    : "rounded-2xl rounded-bl-md border border-stone-200 bg-white text-slate-800",
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim()) return;
            void sendText(input, "text");
            setInput("");
          }}
          className="mt-3 flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.saathiPlaceholder}
            className="flex-1 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 sm:text-sm"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Send className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t.saathiSend}</span>
          </button>
        </form>
      </div>

      {route && (
        <div className="fp-panel rounded-2xl border-emerald-300 bg-emerald-50/50 p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-700 text-white">
                <Camera className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {lang === "en" ? route.labelEn : route.labelHi || route.labelEn}
                </h2>
                <p className="text-[11px] text-emerald-800 font-medium">
                  {route.requiredAngles.length} {t.saathiAnglesRequired}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-xs font-bold text-white">
              {lang === "en" ? "Protocol Set" : "प्रोटोकॉल तैयार"}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            {lang === "en" ? route.descriptionEn : route.descriptionHi || route.descriptionEn}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {route.requiredAngles.map((a) => (
              <span
                key={a}
                className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1 font-mono text-xs font-medium text-emerald-900 shadow-2xs"
              >
                {a}
              </span>
            ))}
          </div>
          {route.needsSatellite && (
            <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200/80 rounded-xl p-2.5">
              <Volume2 className="h-3.5 w-3.5 text-amber-700 shrink-0" />
              <span>
                {lang === "en"
                  ? "Sentinel-2 satellite burn scar verification attached."
                  : "सैटेलाइट जाँच (Sentinel-2 L2A) इस दावे में स्वतः जुड़ेगी।"}
              </span>
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={proceedToCapture}
              disabled={!canProceed}
              className="fp-btn-primary flex-1 justify-center gap-2 py-2.5 text-sm font-semibold disabled:opacity-40 rounded-xl"
            >
              <Camera className="h-4 w-4" />
              <span>{lang === "hi" ? "कैमरा खोलें — फोटो लें" : "Open Camera Studio"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="fp-btn-secondary py-2.5 text-xs rounded-xl"
              onClick={() => {
                if (canProceed) proceedToCapture();
                else window.location.assign("/farmer/capture");
              }}
            >
              {lang === "hi" ? "स्किप" : "Skip"}
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-center pt-2">
        <Link href="/farmer" className="text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2">
          ← {lang === "hi" ? "किसान डैशबोर्ड पर लौटें" : "Back to Farmer Dashboard"}
        </Link>
      </div>
    </div>
  );
}
