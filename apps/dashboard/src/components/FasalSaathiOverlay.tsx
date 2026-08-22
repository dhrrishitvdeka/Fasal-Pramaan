"use client";

import { apiFetch } from "@/lib/auth-headers";
import { webCaptureBridge } from "@/lib/voice/capture-bridge";
import { decodeGeminiLiveFrame, parseGeminiLiveMessage } from "@/lib/voice/gemini-live-parse";
import { connectSilentProcessor } from "@/lib/voice/mic-graph";
import { farmerScreenFromPath, WebVoiceBroker, type VoiceToolResult } from "@/lib/voice/web-voice-broker";
import { useFarmerData } from "@/lib/farmerStore";
import type { AppLang } from "@/lib/live-indian-languages";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Line = { role: "farmer" | "saathi" | "system"; text: string };
type LiveStatus = "idle" | "connecting" | "live" | "error";

function downsampleTo16k(input: Float32Array, inputRate: number): Int16Array {
  if (inputRate === 16000) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return out;
  }
  const ratio = inputRate / 16000;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)] || 0));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function pcm16FromBase64(b64: string): Int16Array {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

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
  } = useFarmerData();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [lastTool, setLastTool] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playTimeRef = useRef(0);
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
        capture: webCaptureBridge,
      }),
    [plots, claims, milestones, farmerProfile, pathname, lang, router, setLang, snoozeMilestone, completeMilestone],
  );

  const brokerRef = useRef(broker);
  brokerRef.current = broker;

  const snapshotRef = useRef({ pathname, lang, plots, claims, milestones });
  snapshotRef.current = { pathname, lang, plots, claims, milestones };

  const stopAudio = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
  }, []);

  const clearExpiryTimer = useCallback(() => {
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
    clearExpiryTimer();
    socketRef.current?.close();
    socketRef.current = null;
    stopAudio();
    setStatus("idle");
  }, [clearExpiryTimer, stopAudio]);

  const failSession = useCallback(
    (message: string) => {
      intentionalCloseRef.current = true;
      connectingRef.current = false;
      setupCompleteRef.current = false;
      lastContextRef.current = "";
      clearExpiryTimer();
      socketRef.current?.close();
      socketRef.current = null;
      stopAudio();
      setStatus("error");
      setError(message);
    },
    [clearExpiryTimer, stopAudio],
  );

  useEffect(() => () => disconnect(), [disconnect]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, error]);

  const playPcm24k = useCallback((b64: string) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const pcm = pcm16FromBase64(b64);
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i += 1) floats[i] = pcm[i] / 0x8000;
    const buffer = ctx.createBuffer(1, floats.length, 24000);
    buffer.getChannelData(0).set(floats);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, playTimeRef.current);
    node.start(startAt);
    playTimeRef.current = startAt + buffer.duration;
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
          clientContent: {
            turns: [{ role: "user", parts: [{ text }] }],
            turnComplete: false,
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
          window.clearTimeout(timer);
          socket.send(JSON.stringify({ setup: { model: `models/${body.model}` } }));
          resolve();
        };
        socket.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error("Could not open Gemini Live"));
        };
      });
      socket.onclose = () => {
        if (intentionalCloseRef.current) return;
        if (socketRef.current === socket) socketRef.current = null;
        connectingRef.current = false;
        setupCompleteRef.current = false;
        stopAudio();
        setStatus("error");
        setError(
          langRef.current === "hi"
            ? "कनेक्शन टूट गया। फिर से बात करने के लिए टैप करें।"
            : "Connection dropped. Tap to talk again.",
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
                if (audioCtxRef.current) {
                  playTimeRef.current = audioCtxRef.current.currentTime;
                }
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
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      playTimeRef.current = ctx.currentTime;
      let stream: MediaStream;
      try {
        // Capture page owns the video device; this session is audio-only forever.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
      } catch {
        throw new Error(
          langRef.current === "hi"
            ? "माइक्रोफ़ोन अनुमति चाहिए। ब्राउज़र में Allow दबाएँ।"
            : "Microphone permission is required. Allow the mic in the browser prompt.",
        );
      }
      streamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      sourceRef.current = source;
      processorRef.current = processor;
      processor.onaudioprocess = (ev) => {
        if (socket.readyState !== WebSocket.OPEN) return;
        const input = ev.inputBuffer.getChannelData(0);
        const pcm = downsampleTo16k(input, ev.inputBuffer.sampleRate);
        const bytes = new Uint8Array(pcm.buffer);
        let binary = "";
        bytes.forEach((value) => {
          binary += String.fromCharCode(value);
        });
        socket.send(
          JSON.stringify({
            realtimeInput: {
              mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: btoa(binary) }],
            },
          }),
        );
      };
      source.connect(processor);
      connectSilentProcessor(processor, ctx);
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

  if (!pathname.startsWith("/farmer")) return null;

  return (
    <>
      <button
        type="button"
        onClick={startOrReconnect}
        className="fp-btn-primary fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-40 min-h-11 gap-2 px-3 py-2 text-xs sm:right-4 sm:px-4 sm:text-sm md:bottom-8"
      >
        <span aria-hidden>🎙️</span>
        <span className="sm:hidden">{lang === "hi" ? "साथी" : "Saathi"}</span>
        <span className="hidden sm:inline">{lang === "hi" ? "फसल साथी से बात करें" : "Talk to Fasal Saathi"}</span>
      </button>
      {open && (
        <div className="fp-panel fixed inset-x-3 bottom-[calc(8.25rem+env(safe-area-inset-bottom))] z-40 max-h-[50vh] overflow-hidden sm:inset-x-4 md:inset-auto md:bottom-24 md:right-4 md:w-96">
          <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--ink)] px-4 py-2 text-[var(--surface)]">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Fasal Saathi</div>
              <div
                className={
                  status === "error"
                    ? "text-[11px] text-rose-200"
                    : status === "connecting"
                      ? "text-[11px] text-amber-200"
                      : "text-[11px] text-emerald-200"
                }
              >
                {statusLabel(status, lang)}
              </div>
              {lastTool && status === "live" && (
                <div className="truncate text-[10px] text-emerald-100/80">{lastTool}</div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {status === "error" && (
                <button type="button" className="text-xs text-amber-100 hover:text-white" onClick={() => void connect()}>
                  {lang === "hi" ? "फिर से" : "Retry"}
                </button>
              )}
              <button
                type="button"
                className="text-xs text-emerald-100 hover:text-white"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                {lang === "hi" ? "बंद करें" : "Close"}
              </button>
            </div>
          </div>
          <div ref={transcriptRef} className="max-h-64 space-y-2 overflow-y-auto p-3 text-sm">
            {lines.map((line, index) => (
              <p
                key={`${line.role}-${index}`}
                className={
                  line.role === "farmer"
                    ? "text-slate-900"
                    : line.role === "saathi"
                      ? "text-emerald-900"
                      : "text-xs text-slate-500"
                }
              >
                {line.text}
              </p>
            ))}
            {error && <p className="text-sm text-red-700">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
