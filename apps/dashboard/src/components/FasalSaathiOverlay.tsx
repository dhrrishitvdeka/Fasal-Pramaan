"use client";

import { useSaathiSession } from "@/lib/saathi/session-provider";
import { useFarmerData } from "@/lib/farmerStore";
import { nativeLabelForLang, type AppLang } from "@/lib/live-indian-languages";
import { getFarmerT } from "@/lib/farmerI18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Sprout, X, RefreshCw, AlertCircle, ArrowRight, RotateCcw } from "lucide-react";
import clsx from "clsx";

function statusLabel(status: string, lang: AppLang): string {
  if (status === "live") return lang === "hi" ? "लाइव" : "Live";
  if (status === "connecting") return lang === "hi" ? "जुड़ रहा है…" : "Connecting…";
  if (status === "error") return lang === "hi" ? "त्रुटि · फिर से टैप करें" : "Error · tap to retry";
  return lang === "hi" ? "तैयार" : "Ready";
}

export default function FasalSaathiOverlay() {
  const pathname = usePathname();
  const { lang } = useFarmerData();
  const t = getFarmerT(lang);
  const {
    messages,
    liveStatus,
    error,
    isSpeaking,
    lastTool,
    overlayOpen,
    setOverlayOpen,
    connectVoice,
    toggleVoice,
    resetSession,
  } = useSaathiSession();
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // Reset overlay when navigating TO the full Saathi intake page so it doesn't
  // ghost-open when the user returns to another farmer route.
  useEffect(() => {
    if (pathname.startsWith("/farmer/saathi")) {
      setOverlayOpen(false);
    }
  }, [pathname, setOverlayOpen]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, error, overlayOpen]);

  if (!pathname.startsWith("/farmer") || pathname.startsWith("/farmer/saathi")) return null;

  const startOrReconnect = () => {
    setOverlayOpen(true);
    if (liveStatus === "idle" || liveStatus === "error") void connectVoice();
  };

  return (
    <>
      <button
        type="button"
        onClick={startOrReconnect}
        title={lang === "hi" ? "फसल साथी से बात करें" : "Talk to Fasal Saathi"}
        aria-label={lang === "hi" ? "फसल साथी - आवाज़ सहायक" : "Fasal Saathi - Voice Assistant"}
        className={clsx(
          "group fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-[#2a2620] to-[#141210] shadow-xl transition-all duration-300 hover:scale-110 active:scale-95 sm:right-4 sm:h-14 sm:w-14 md:bottom-8 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-[var(--canvas)] border border-emerald-500/40 hover:border-emerald-400 hover:shadow-emerald-500/25 hover:shadow-2xl",
          isSpeaking && "scale-105 ring-4 ring-emerald-400/50 shadow-emerald-500/30",
        )}
      >
        {!isSpeaking && liveStatus === "idle" && (
          <span className="absolute -inset-1 rounded-full bg-emerald-400/20 mic-breathe-subtle-ring pointer-events-none" />
        )}
        {isSpeaking && (
          <>
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
            <span className="absolute -inset-1 animate-pulse rounded-full bg-emerald-500/20" />
          </>
        )}
        <svg
          className={clsx(
            "h-6 w-6 sm:h-7 sm:w-7 text-emerald-400 transition-all duration-300 group-hover:scale-110 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)] group-hover:drop-shadow-[0_0_10px_rgba(52,211,153,0.8)]",
            isSpeaking && "animate-pulse scale-110 text-emerald-300",
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#34d399"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 20h10" />
          <path d="M10 20c5.5-2.5.8-6.4 3-13" />
          <path
            d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"
            fill="#10b981"
            fillOpacity="0.35"
          />
          <path
            d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"
            fill="#10b981"
            fillOpacity="0.35"
          />
        </svg>
        {isSpeaking ? (
          <span className="absolute -bottom-1 flex items-end gap-0.5 rounded-full bg-emerald-950 px-1.5 py-0.5 border border-emerald-400/40 shadow-xs">
            <span className="h-1.5 w-0.5 rounded-full bg-emerald-400 sound-bar-1" />
            <span className="h-3 w-0.5 rounded-full bg-emerald-300 sound-bar-2" />
            <span className="h-2 w-0.5 rounded-full bg-emerald-400 sound-bar-3" />
            <span className="h-3.5 w-0.5 rounded-full bg-emerald-300 sound-bar-4" />
          </span>
        ) : (
          <>
            {liveStatus === "live" && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-[var(--surface)]" />
              </span>
            )}
            {liveStatus === "connecting" && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-amber-500 ring-2 ring-[var(--surface)]" />
              </span>
            )}
          </>
        )}
      </button>
      {overlayOpen && (
        <div className="fixed inset-x-3 bottom-[calc(8rem+env(safe-area-inset-bottom))] z-40 max-h-[62vh] overflow-hidden rounded-2xl border border-stone-200/90 bg-[#fffdf9] shadow-2xl transition-all sm:inset-x-4 md:inset-auto md:bottom-24 md:right-4 md:w-96 flex flex-col">
          <div className="flex items-center justify-between border-b border-stone-200/80 bg-[#1c1915] px-4 py-3 text-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Sprout className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                  <span>{lang === "hi" ? "फसल साथी" : "Fasal Saathi"}</span>
                  <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-500/30">
                    {lang === "hi" ? "सहायक" : "Assistant"}
                  </span>
                  <span className="text-[10px] font-semibold text-amber-300 bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-500/30">
                    {nativeLabelForLang(lang)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={clsx(
                      "h-1.5 w-1.5 rounded-full",
                      liveStatus === "live"
                        ? "bg-emerald-400 animate-pulse"
                        : liveStatus === "connecting"
                          ? "bg-amber-400 animate-pulse"
                          : liveStatus === "error"
                            ? "bg-rose-400"
                            : "bg-slate-400",
                    )}
                  />
                  <span className="text-[11px] text-slate-300">{statusLabel(liveStatus, lang)}</span>
                  {lastTool && liveStatus === "live" && (
                    <span className="truncate text-[10px] text-emerald-300/80">· {lastTool}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={resetSession}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                aria-label={t.saathiReset}
                title={t.saathiReset}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              {liveStatus === "error" && (
                <button
                  type="button"
                  onClick={() => void connectVoice()}
                  className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-white/20 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>{lang === "hi" ? "फिर से" : "Retry"}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOverlayOpen(false)}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                aria-label={lang === "hi" ? "बंद करें" : "Close"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={transcriptRef} className="flex-1 max-h-64 space-y-3 overflow-y-auto p-3.5 sm:p-4 text-xs sm:text-sm">
            {messages.map((line) => (
              <div
                key={line.id}
                className={clsx("flex", line.role === "farmer" ? "justify-end" : "items-start gap-2.5")}
              >
                {line.role !== "farmer" && (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-bold mt-0.5">
                    <Sprout className="h-3.5 w-3.5" />
                  </div>
                )}
                <div
                  className={clsx(
                    "rounded-2xl p-3 shadow-2xs leading-relaxed max-w-[88%] text-xs sm:text-sm",
                    line.role === "farmer"
                      ? "rounded-tr-xs bg-[#1c1915] text-white"
                      : "rounded-tl-xs bg-white border border-stone-200/90 text-slate-800",
                  )}
                >
                  {line.text}
                </div>
              </div>
            ))}
            {error && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="h-4 w-4 text-amber-700 shrink-0" />
                  <span>
                    {error.includes("Sign")
                      ? lang === "hi"
                        ? "साइन इन आवश्यक है"
                        : "Sign-in required"
                      : error}
                  </span>
                </div>
                {error.includes("Sign") && (
                  <div className="pt-1">
                    <Link
                      href="/login"
                      onClick={() => setOverlayOpen(false)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#1c1915] px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
                    >
                      <span>{lang === "hi" ? "लॉगिन करें" : "Sign in now"}</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-stone-200/80 bg-stone-50/90 px-3.5 py-2.5 text-xs">
            <button
              type="button"
              onClick={toggleVoice}
              className="flex items-center gap-2 font-semibold text-[11px] text-emerald-800 hover:underline"
            >
              {liveStatus === "live" ? (
                <span className="flex items-center gap-1 text-emerald-700">
                  <span className="flex gap-0.5 items-end h-3">
                    <span className="w-0.5 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="w-0.5 h-3 bg-emerald-600 rounded-full animate-pulse" />
                    <span className="w-0.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  </span>
                  <span>{t.saathiListening}</span>
                </span>
              ) : liveStatus === "connecting" ? (
                <span className="text-amber-700">{t.saathiConnecting}</span>
              ) : (
                <span className="text-slate-500">{t.saathiTapToSpeak}</span>
              )}
            </button>
            <Link
              href="/farmer/saathi"
              onClick={() => setOverlayOpen(false)}
              className="font-bold text-[var(--accent)] hover:underline flex items-center gap-1 text-[11px]"
            >
              <span>{lang === "hi" ? "पूरा चैट खोलें" : "Full Screen"}</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
