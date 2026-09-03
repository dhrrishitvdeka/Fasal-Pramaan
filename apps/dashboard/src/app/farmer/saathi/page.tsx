"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Mic,
  Send,
  Sprout,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Camera,
  Volume2,
  Flame,
  Waves,
  Bug,
  CloudHail,
  PawPrint,
  RotateCcw,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
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
    { peril: "fire_burn", label: t.perilFire, icon: Flame, phrase: t.perilFirePhrase },
    { peril: "animal_damage", label: t.perilAnimals, icon: PawPrint, phrase: t.perilAnimalsPhrase },
    { peril: "flood", label: t.perilFlood, icon: Waves, phrase: t.perilFloodPhrase },
    { peril: "pest_disease", label: t.perilPest, icon: Bug, phrase: t.perilPestPhrase },
    { peril: "hailstorm", label: t.perilHail, icon: CloudHail, phrase: t.perilHailPhrase },
    { peril: "normal", label: t.perilOther, icon: Sprout, phrase: t.perilOtherPhrase },
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
            <button
              type="button"
              onClick={resetSession}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-800"
              aria-label={t.saathiReset}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.saathiReset}</span>
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 whitespace-nowrap">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
              <span>{lang === "hi" ? "सहायता पोर्टल" : "PMFBY Intake"}</span>
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-600 leading-relaxed border-t border-stone-100 pt-2.5">
          {lang === "hi"
            ? "गोल बटन और यह पेज एक ही साथी हैं। पेज बदलने पर बातचीत बनी रहती है।"
            : "The circle button and this page are the same Saathi. Your conversation stays when you change pages."}
        </p>
      </div>

      <div className="fp-panel rounded-2xl p-6 text-center sm:p-7 border border-stone-200/90 bg-[#fffdf9] shadow-2xs">
        <div className="relative mx-auto mb-4 flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center">
          {liveStatus === "live" ? (
            <>
              <span className="absolute inset-0 rounded-full bg-rose-500/25 animate-ping pointer-events-none" />
              <span className="absolute -inset-2 rounded-full bg-rose-400/20 animate-pulse pointer-events-none" />
            </>
          ) : liveStatus === "connecting" ? (
            <span className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping pointer-events-none" />
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
                  ? "bg-amber-600 shadow-amber-500/30 ring-4 ring-amber-200/80"
                  : "bg-[var(--ink)] border-2 border-emerald-500/40 hover:border-emerald-400 hover:shadow-emerald-500/20 hover:shadow-lg",
            )}
          >
            {liveStatus === "connecting" ? (
              <Loader2 className="h-8 w-8 animate-spin text-white" />
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
                <span className="h-2 w-2 animate-spin rounded-full bg-amber-500" />
                <span className="text-amber-700">{t.saathiConnecting}</span>
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

        <div className="mt-6 w-full pt-4 border-t border-stone-100">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {t.saathiCommonIssues}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 max-w-lg mx-auto">
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
                  className={clsx(
                    "flex items-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all text-left shadow-2xs",
                    isSelected
                      ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                      : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 hover:border-emerald-300",
                  )}
                >
                  <span
                    className={clsx(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs",
                      isSelected ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate">{q.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="fp-panel rounded-2xl p-4 sm:p-5 border border-stone-200/90 bg-[#fffdf9] shadow-2xs">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold">
              <Sprout className="h-3 w-3" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              {t.saathiAssessmentConvo}
            </span>
          </div>
          {isAnalyzing && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent)]">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t.saathiAnalyzing}
            </span>
          )}
        </div>

        <div
          ref={scrollRef}
          className="max-h-[36vh] min-h-[16vh] space-y-2.5 overflow-y-auto rounded-xl border border-stone-200/80 bg-stone-50/70 p-3.5"
        >
          {messages.map((m) => (
            <div key={m.id} className={clsx("flex", m.role === "farmer" ? "justify-end" : "justify-start gap-2.5")}>
              {m.role !== "farmer" && (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-bold mt-0.5">
                  <Sprout className="h-3.5 w-3.5" />
                </div>
              )}
              <div
                className={clsx(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed sm:text-sm shadow-2xs",
                  m.role === "farmer"
                    ? "bg-[var(--ink)] text-white rounded-tr-xs"
                    : "border border-stone-200/90 bg-white text-slate-800 rounded-tl-xs",
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
            className="fp-input flex-1 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs sm:text-sm"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="fp-btn-primary rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5"
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
