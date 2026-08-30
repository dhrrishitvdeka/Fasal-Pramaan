"use client";

import { apiFetch } from "@/lib/auth-headers";
import { webCaptureBridge } from "@/lib/voice/capture-bridge";
import { decodeGeminiLiveFrame, parseGeminiLiveMessage } from "@/lib/voice/gemini-live-parse";
import { startLiveAudio, type LiveAudioSession } from "@/lib/voice/live-audio";
import { farmerScreenFromPath, WebVoiceBroker, type VoiceToolResult } from "@/lib/voice/web-voice-broker";
import { useFarmerData } from "@/lib/farmerStore";
import type { AppLang } from "@/lib/live-indian-languages";
import { getFarmerT } from "@/lib/farmerI18n";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sprout, X, RefreshCw, AlertCircle, ArrowRight } from "lucide-react";
import clsx from "clsx";

type Line = { role: "farmer" | "saathi" | "system"; text: string };
type LiveStatus = "idle" | "connecting" | "live" | "error";

function statusLabel(status: LiveStatus, lang: AppLang): string {
  if (status === "live") return lang === "hi" ? "लाइव" : "Live";
  if (status === "connecting") return lang === "hi" ? "जुड़ रहा है…" : "Connecting…";
  if (status === "error") return lang === "hi" ? "त्रुटि · फिर से टैप करें" : "Error · tap to retry";
  return lang === "hi" ? "तैयार" : "Ready";
}

export default function FasalSaathiOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    lang,
    setLang,
    plots,
    claims,
    milestones,
    farmerProfile,
    snoozeMilestone,
    completeMilestone,
    registerPlot,
  } = useFarmerData();
  const t = getFarmerT(lang);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [lastTool, setLastTool] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const liveAudioRef = useRef<LiveAudioSession | null>(null);
  const userTurnRef = useRef(1);
  const inputBufRef = useRef("");
  const outputBufRef = useRef("");
  const connectingRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const setupCompleteRef = useRef(false);
  const lastContextRef = useRef("");
  const expiryTimerRef = useRef<number | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<LiveStatus>("idle");
  const langRef = useRef(lang);

  statusRef.current = status;
  langRef.current = lang;

  const broker = useMemo(
    () =>
      new WebVoiceBroker({
        plots: plots.map((plot) => ({
          id: plot.id,
          name: plot.name,
          nameHi: plot.nameHi,
          cropType: plot.cropType,
          cropTypeHi: plot.cropTypeHi,
          khasraNumber: plot.khasraNumber,
          areaHectares: plot.areaHectares,
          currentStage: plot.currentStage,
          village: plot.village,
          district: plot.district,
          state: plot.state,
        })),
        claims: claims.map((claim) => ({
          id: claim.id,
          status: claim.status,
          plotName: claim.plotName,
          cropType: claim.cropType,
          missingAngles: claim.missingAngles,
          recaptureReason: claim.recaptureReason,
          imageCount: claim.images?.length ?? 0,
          createdAt: claim.createdAt,
          reviewerNotes: claim.reviewerNotes,
        })),
        reminders: milestones.map((item) => ({
          id: item.id,
          stageName: item.stageName,
          stageNameHi: item.stageNameHi,
          dueDate: item.dueDate,
          completed: item.completed,
          isOverdue: item.isOverdue,
          plotId: item.plotId,
          cropName: item.cropName,
        })),
        farmerProfile: {
          name: farmerProfile.name,
          nameHi: farmerProfile.nameHi,
          kisanId: farmerProfile.kisanId,
          phone: farmerProfile.phone,
          village: farmerProfile.village,
          district: farmerProfile.district,
          state: farmerProfile.state,
        },
        currentPath: pathname,
        language: lang,
        navigate: (path) => router.push(path),
        changeLanguage: setLang,
        snoozeReminder: (id, days) => snoozeMilestone(id, days),
        completeReminder: (id) => completeMilestone(id, "", ""),
        addPlot: async (input) => {
          let lat: number | null = null;
          let lon: number | null = null;
          try {
            if (typeof navigator !== "undefined" && navigator.geolocation) {
              const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                  enableHighAccuracy: true,
                  timeout: 4000,
                  maximumAge: 60_000,
                });
              });
              lat = pos.coords.latitude;
              lon = pos.coords.longitude;
            }
          } catch {
            // GPS is optional; plot still persists without it.
          }
          const saved = await registerPlot({
            name: input.name,
            cropType: input.cropType,
            khasraNumber: input.khasraNumber,
            areaHectares: input.areaHectares,
            village: input.village || farmerProfile.village,
            district: farmerProfile.district,
            state: farmerProfile.state,
            lat,
            lon,
          });
          return saved;
        },
        capture: webCaptureBridge,
      }),
    [plots, claims, milestones, farmerProfile, pathname, lang, router, setLang, snoozeMilestone, completeMilestone, registerPlot],
  );

  const brokerRef = useRef(broker);
  brokerRef.current = broker;

  const snapshotRef = useRef({ pathname, lang, plots, claims, milestones });
  snapshotRef.current = { pathname, lang, plots, claims, milestones };

  const stopAudio = useCallback(() => {
    liveAudioRef.current?.stop();
    liveAudioRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    if (expiryTimerRef.current != null) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    connectingRef.current = false;
    setupCompleteRef.current = false;
    lastContextRef.current = "";
    clearTimers();
    socketRef.current?.close();
    socketRef.current = null;
    stopAudio();
    setStatus("idle");
  }, [clearTimers, stopAudio]);

  const failSession = useCallback(
    (message: string) => {
      intentionalCloseRef.current = true;
      connectingRef.current = false;
      setupCompleteRef.current = false;
      lastContextRef.current = "";
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
      stopAudio();
      setStatus("error");
      setError(message);
    },
    [clearTimers, stopAudio],
  );

  useEffect(() => () => disconnect(), [disconnect]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, error]);

  const playPcm24k = useCallback((b64: string) => {
    liveAudioRef.current?.playPcm24k(b64);
  }, []);

  const pushPortalContext = useCallback((reason: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !setupCompleteRef.current) return;
    const snap = snapshotRef.current;
    const recapture = snap.claims.filter((claim) => claim.status === "needs_recapture");
    const nextReminder = snap.milestones
      .filter((item) => !item.completed)
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return a.dueDate.localeCompare(b.dueDate);
      })[0];
    const intent = webCaptureBridge.getIntent();
    const cv = webCaptureBridge.getCvResult() as
      | { hintCode?: string; hintEn?: string; hintHi?: string; greenPct?: number; luma?: number | null }
      | null;
    const signals = webCaptureBridge.getContextSignals() as Array<{ source: string; status: string; labelEn: string; summaryEn: string }> | null;
    const payload = {
      type: "portal_context",
      reason,
      path: snap.pathname,
      screen: farmerScreenFromPath(snap.pathname),
      language: snap.lang,
      plot_count: snap.plots.length,
      claim_count: snap.claims.length,
      recapture_count: recapture.length,
      recapture_ids: recapture.slice(0, 5).map((claim) => claim.id),
      next_reminder: nextReminder
        ? {
            id: nextReminder.id,
            stage: nextReminder.stageName,
            due: nextReminder.dueDate,
            overdue: nextReminder.isOverdue,
          }
        : null,
      active_intent: intent
        ? {
            id: intent.id,
            peril: intent.peril,
            crop: intent.crop || null,
            village: intent.village || null,
            required_angles_note: "see request_evidence_angles tool",
          }
        : null,
      live_cv: cv ? { hint_code: cv.hintCode, hint_en: cv.hintEn, green_pct: cv.greenPct, luma: cv.luma } : null,
      context_signals: signals
        ? signals.map((s) => ({ source: s.source, status: s.status, label: s.labelEn }))
        : null,
    };
    const text = `PORTAL CONTEXT (internal; do not read aloud unless asked):\n${JSON.stringify(payload)}`;
    if (text === lastContextRef.current) return;
    lastContextRef.current = text;
    try {
      socket.send(
        JSON.stringify({
          realtimeInput: {
            text,
          },
        }),
      );
    } catch {
      // A dropped context frame is recoverable on the next change.
    }
  }, []);

  useEffect(() => {
    if (status !== "live") return;
    const timer = window.setTimeout(() => pushPortalContext("state_change"), 800);
    return () => window.clearTimeout(timer);
  }, [status, pathname, lang, plots, claims, milestones, pushPortalContext]);

  // Stream live camera viewfinder frames (1 frame every 1.8s) into Gemini Live during capture
  useEffect(() => {
    if (status !== "live" || !pathname?.startsWith("/farmer/capture")) return;
    const interval = window.setInterval(() => {
      const frame = webCaptureBridge.getVideoFrame();
      if (frame && liveAudioRef.current) {
        liveAudioRef.current.sendVideoFrame(frame);
      }
    }, 1800);
    return () => window.clearInterval(interval);
  }, [status, pathname]);

  const handleTools = useCallback(
    async (calls: { id: string; name: string; arguments: Record<string, unknown> }[]) => {
      const responses = [];
      for (const call of calls) {
        let result: VoiceToolResult;
        try {
          result = await brokerRef.current.execute(call.name, call.arguments, userTurnRef.current);
        } catch (err) {
          result = {
            outcome: "failed",
            message: err instanceof Error ? err.message : "The app action failed.",
          };
        }
        setLastTool(`${call.name} · ${result.outcome}`);
        responses.push({
          id: call.id,
          name: call.name,
          response: { outcome: result.outcome, message: result.message, data: result.data || {} },
        });
        setLines((prev) => [...prev, { role: "system", text: result.message }]);
      }
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
      } catch {
        failSession(
          langRef.current === "hi"
            ? "औज़ार का जवाब नहीं भेजा जा सका। फिर से बात करें।"
            : "Could not send the tool result. Tap to talk again.",
        );
      }
    },
    [failSession],
  );

  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    connectingRef.current = true;
    intentionalCloseRef.current = false;
    setupCompleteRef.current = false;
    lastContextRef.current = "";
    userTurnRef.current = 1;
    inputBufRef.current = "";
    outputBufRef.current = "";
    setLastTool(null);
    setError(null);
    setStatus("connecting");
    setLines([{ role: "system", text: langRef.current === "hi" ? "फसल साथी शुरू हो रहा है…" : "Starting Fasal Saathi…" }]);
    try {
      const minted = await apiFetch("/api/voice/session", { method: "POST" });
      const body = (await minted.json()) as {
        error?: string;
        token?: string;
        websocketUrl?: string;
        model?: string;
        expiresAt?: string;
      };
      if (!minted.ok || !body.token || !body.websocketUrl) {
        throw new Error(body.error || "Could not start voice session");
      }
      const wsUrl = `${body.websocketUrl}?access_token=${encodeURIComponent(body.token)}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Voice connection timed out")), 30000);
        socket.onopen = () => {
          try {
            socket.send(JSON.stringify({ setup: { model: `models/${body.model}` } }));
            window.clearTimeout(timer);
            resolve();
          } catch (err) {
            window.clearTimeout(timer);
            reject(err instanceof Error ? err : new Error("Voice setup failed"));
          }
        };
        socket.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error("Could not open Gemini Live"));
        };
      });
      socket.onclose = (ev) => {
        if (intentionalCloseRef.current) return;
        if (socketRef.current === socket) socketRef.current = null;
        connectingRef.current = false;
        setupCompleteRef.current = false;
        stopAudio();
        setStatus("error");
        const reasonDetail = ev.reason ? `: ${ev.reason}` : "";
        setError(
          langRef.current === "hi"
            ? `कनेक्शन टूट गया${reasonDetail}। फिर से बात करने के लिए टैप करें।`
            : `Connection dropped${reasonDetail}. Tap to talk again.`,
        );
      };
      socket.onerror = () => {
        if (intentionalCloseRef.current) return;
        failSession(
          langRef.current === "hi"
            ? "आवाज़ सत्र में त्रुटि। फिर से बात करने के लिए टैप करें।"
            : "Voice session error. Tap to talk again.",
        );
      };
      socket.onmessage = (event) => {
        void (async () => {
          try {
            const frame = await decodeGeminiLiveFrame(event.data);
            if (!frame) return;
            const parsed = parseGeminiLiveMessage(frame);
            for (const item of parsed.events) {
              if (item.type === "setupComplete") {
                setupCompleteRef.current = true;
                setStatus("live");
                pushPortalContext("session_start");
                try {
                  socket.send(
                    JSON.stringify({
                      realtimeInput: {
                        text:
                          langRef.current === "hi"
                            ? "नमस्ते किसान भाई! मैं फसल साथी हूँ। आपके खेत में क्या समस्या हुई है? मुझे बताएं।"
                            : "Hello! I am Fasal Saathi. What happened to your crop? Tell me in your words.",
                      },
                    }),
                  );
                } catch {}
              }
              if (item.type === "inputTranscript") {
                inputBufRef.current += item.text;
                setLines((prev) => {
                  const copy = [...prev];
                  const last = copy[copy.length - 1];
                  if (last?.role === "farmer") last.text = inputBufRef.current;
                  else copy.push({ role: "farmer", text: inputBufRef.current });
                  return copy;
                });
              }
              if (item.type === "outputTranscript") {
                outputBufRef.current += item.text;
                setLines((prev) => {
                  const copy = [...prev];
                  const last = copy[copy.length - 1];
                  if (last?.role === "saathi") last.text = outputBufRef.current;
                  else copy.push({ role: "saathi", text: outputBufRef.current });
                  return copy;
                });
              }
              if (item.type === "interrupted") {
                liveAudioRef.current?.interrupt();
              }
              if (item.type === "audio") playPcm24k(item.bytesBase64);
              if (item.type === "toolCalls") void handleTools(item.calls);
              if (item.type === "turnComplete") {
                const spoken = inputBufRef.current.trim();
                if (spoken) userTurnRef.current += 1;
                inputBufRef.current = "";
                outputBufRef.current = "";
              }
              if (item.type === "error") {
                const restart = /restart|session/i.test(item.message);
                failSession(
                  restart
                    ? langRef.current === "hi"
                      ? "सत्र समाप्त हो गया। फिर से बात करने के लिए टैप करें।"
                      : "Session ended. Tap to talk again."
                    : item.message,
                );
              }
            }
          } catch {
            console.warn("Ignored a non-JSON Gemini Live frame");
          }
        })();
      };
      if (body.expiresAt) {
        const remain = new Date(body.expiresAt).getTime() - Date.now() - 15_000;
        if (remain > 0) {
          expiryTimerRef.current = window.setTimeout(() => {
            failSession(
              langRef.current === "hi"
                ? "सत्र समाप्त हो रहा है। फिर से बात करने के लिए टैप करें।"
                : "Session is ending. Tap to talk again.",
            );
          }, remain);
        }
      }
      const liveAudio = await startLiveAudio({
        socket,
        micPermissionMessage:
          langRef.current === "hi"
            ? "माइक्रोफ़ोन अनुमति चाहिए। ब्राउज़र में Allow दबाएँ।"
            : "Microphone permission is required. Allow the mic in the browser prompt.",
        onSpeakingChange: setIsSpeaking,
      });
      liveAudioRef.current = liveAudio;
      connectingRef.current = false;
      setStatus("live");
    } catch (err) {
      connectingRef.current = false;
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not start Fasal Saathi");
      intentionalCloseRef.current = true;
      socketRef.current?.close();
      socketRef.current = null;
      stopAudio();
    }
  }, [failSession, handleTools, playPcm24k, pushPortalContext, stopAudio]);

  const startOrReconnect = useCallback(() => {
    setOpen(true);
    if (statusRef.current === "idle" || statusRef.current === "error") void connect();
  }, [connect]);

  if (!pathname.startsWith("/farmer") || pathname.startsWith("/farmer/saathi")) return null;

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
        {/* Idle & Live Ambient Halo */}
        {!isSpeaking && status === "idle" && (
          <span className="absolute -inset-1 rounded-full bg-emerald-400/20 mic-breathe-subtle-ring pointer-events-none" />
        )}

        {/* Animated speaking audio ripples */}
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

        {/* Dynamic Voice Indicator */}
        {isSpeaking ? (
          <span className="absolute -bottom-1 flex items-end gap-0.5 rounded-full bg-emerald-950 px-1.5 py-0.5 border border-emerald-400/40 shadow-xs">
            <span className="h-1.5 w-0.5 rounded-full bg-emerald-400 sound-bar-1" />
            <span className="h-3 w-0.5 rounded-full bg-emerald-300 sound-bar-2" />
            <span className="h-2 w-0.5 rounded-full bg-emerald-400 sound-bar-3" />
            <span className="h-3.5 w-0.5 rounded-full bg-emerald-300 sound-bar-4" />
          </span>
        ) : (
          <>
            {status === "live" && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-[var(--surface)]" />
              </span>
            )}
            {status === "connecting" && (
              <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-amber-500 ring-2 ring-[var(--surface)]" />
              </span>
            )}
          </>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 bottom-[calc(8rem+env(safe-area-inset-bottom))] z-40 max-h-[62vh] overflow-hidden rounded-2xl border border-stone-200/90 bg-[#fffdf9] shadow-2xl transition-all sm:inset-x-4 md:inset-auto md:bottom-24 md:right-4 md:w-96 flex flex-col">
          {/* Header */}
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
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={clsx(
                      "h-1.5 w-1.5 rounded-full",
                      status === "live"
                        ? "bg-emerald-400 animate-pulse"
                        : status === "connecting"
                          ? "bg-amber-400 animate-pulse"
                          : status === "error"
                            ? "bg-rose-400"
                            : "bg-slate-400",
                    )}
                  />
                  <span className="text-[11px] text-slate-300">
                    {statusLabel(status, lang)}
                  </span>
                  {lastTool && status === "live" && (
                    <span className="truncate text-[10px] text-emerald-300/80">· {lastTool}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {status === "error" && (
                <button
                  type="button"
                  onClick={() => void connect()}
                  className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-white/20 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>{lang === "hi" ? "फिर से" : "Retry"}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
                className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                aria-label={lang === "hi" ? "बंद करें" : "Close"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Conversation Area */}
          <div ref={transcriptRef} className="flex-1 max-h-64 space-y-3 overflow-y-auto p-3.5 sm:p-4 text-xs sm:text-sm">
            {/* Friendly Greeting */}
            <div className="flex items-start gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                <Sprout className="h-3.5 w-3.5" />
              </div>
              <div className="rounded-2xl rounded-tl-xs bg-white border border-stone-200/90 p-3 text-slate-800 shadow-2xs leading-relaxed max-w-[88%]">
                <p className="font-semibold text-slate-900 text-xs">
                  {t.greeting}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {t.saathiSub}
                </p>
              </div>
            </div>

            {lines.map((line, index) => (
              <div
                key={`${line.role}-${index}`}
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
                      : line.role === "saathi"
                        ? "rounded-tl-xs bg-white border border-stone-200/90 text-slate-800"
                        : "rounded-lg bg-slate-100 text-slate-600 text-[11px]",
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
                  <span>{error.includes("Sign") ? (lang === "hi" ? "साइन इन आवश्यक है" : "Sign-in required") : error}</span>
                </div>
                {error.includes("Sign") && (
                  <div className="pt-1">
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
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

          {/* Footer Bar */}
          <div className="flex items-center justify-between border-t border-stone-200/80 bg-stone-50/90 px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              {status === "live" ? (
                <div className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                  <span className="flex gap-0.5 items-end h-3">
                    <span className="w-0.5 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="w-0.5 h-3 bg-emerald-600 rounded-full animate-pulse" />
                    <span className="w-0.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  </span>
                  <span>{t.saathiListening}</span>
                </div>
              ) : (
                <span className="text-slate-500 text-[11px]">
                  {t.saathiTapToSpeak}
                </span>
              )}
            </div>
            <Link
              href="/farmer/saathi"
              onClick={() => setOpen(false)}
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
