"use client";

import { apiFetch } from "@/lib/auth-headers";
import { webCaptureBridge } from "@/lib/voice/capture-bridge";
import { decodeGeminiLiveFrame, parseGeminiLiveMessage } from "@/lib/voice/gemini-live-parse";
import { connectSilentProcessor } from "@/lib/voice/mic-graph";
import { WebVoiceBroker } from "@/lib/voice/web-voice-broker";
import { useFarmerData } from "@/lib/farmerStore";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Line = { role: "farmer" | "saathi" | "system"; text: string };

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

export default function FasalSaathiOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const { lang, setLang, plots, claims, milestones, snoozeMilestone, completeMilestone } = useFarmerData();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playTimeRef = useRef(0);
  const userTurnRef = useRef(1);
  const inputBufRef = useRef("");
  const outputBufRef = useRef("");

  const broker = useMemo(
    () =>
      new WebVoiceBroker({
        plots: plots.map((plot) => ({
          id: plot.id,
          name: plot.name,
          cropType: plot.cropType,
          khasraNumber: plot.khasraNumber,
        })),
        claims: claims.map((claim) => ({
          id: claim.id,
          status: claim.status,
          plotName: claim.plotName,
          cropType: claim.cropType,
        })),
        reminders: milestones.map((item) => ({
          id: item.id,
          stageName: item.stageName,
          dueDate: item.dueDate,
          completed: item.completed,
        })),
        navigate: (path) => router.push(path),
        changeLanguage: setLang,
        snoozeReminder: (id, days) => snoozeMilestone(id, days),
        completeReminder: (id) => completeMilestone(id, "", ""),
        capture: webCaptureBridge,
      }),
    [plots, claims, milestones, router, setLang, snoozeMilestone, completeMilestone],
  );

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

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    stopAudio();
    setStatus("idle");
  }, [stopAudio]);

  useEffect(() => () => disconnect(), [disconnect]);

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

  const handleTools = useCallback(
    async (calls: { id: string; name: string; arguments: Record<string, unknown> }[]) => {
      const responses = [];
      for (const call of calls) {
        const result = await broker.execute(call.name, call.arguments, userTurnRef.current);
        responses.push({
          id: call.id,
          name: call.name,
          response: { outcome: result.outcome, message: result.message, data: result.data || {} },
        });
        setLines((prev) => [...prev, { role: "system", text: result.message }]);
      }
      socketRef.current?.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
    },
    [broker],
  );

  const connect = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    setLines([{ role: "system", text: lang === "hi" ? "फसल साथी शुरू हो रहा है…" : "Starting Fasal Saathi…" }]);
    try {
      const minted = await apiFetch("/api/voice/session", { method: "POST" });
      const body = (await minted.json()) as {
        error?: string;
        token?: string;
        websocketUrl?: string;
        model?: string;
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
      socket.onmessage = (event) => {
        void (async () => {
          try {
            const frame = await decodeGeminiLiveFrame(event.data);
            if (!frame) return;
            const parsed = parseGeminiLiveMessage(frame);
            for (const item of parsed.events) {
              if (item.type === "setupComplete") setStatus("live");
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
              if (item.type === "audio") playPcm24k(item.bytesBase64);
              if (item.type === "toolCalls") void handleTools(item.calls);
              if (item.type === "turnComplete") {
                if (inputBufRef.current.trim()) userTurnRef.current += 1;
                inputBufRef.current = "";
                outputBufRef.current = "";
              }
              if (item.type === "error") {
                setError(item.message);
                setStatus("error");
              }
            }
          } catch {
            setError("Invalid voice message");
          }
        })();
      };
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      playTimeRef.current = ctx.currentTime;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
            realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: btoa(binary) } },
          }),
        );
      };
      source.connect(processor);
      connectSilentProcessor(processor, ctx);
      setStatus("live");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not start Fasal Saathi");
      disconnect();
    }
  }, [disconnect, handleTools, lang, playPcm24k]);

  if (!pathname.startsWith("/farmer")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (status === "idle" || status === "error") void connect();
        }}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-emerald-900 md:bottom-8"
      >
        <span aria-hidden>🎙️</span>
        {lang === "hi" ? "फसल साथी से बात करें" : "Talk to Fasal Saathi"}
      </button>
      {open && (
        <div className="fixed inset-x-4 bottom-24 z-40 max-h-[60vh] overflow-hidden rounded-xl border border-emerald-900/20 bg-white shadow-2xl md:inset-auto md:bottom-24 md:right-4 md:w-96">
          <div className="flex items-center justify-between border-b border-slate-200 bg-emerald-950 px-4 py-2 text-emerald-50">
            <div>
              <div className="text-sm font-semibold">Fasal Saathi</div>
              <div className="text-[11px] text-emerald-200">
                {status === "live" ? (lang === "hi" ? "लाइव" : "Live") : status}
              </div>
            </div>
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
          <div className="max-h-64 space-y-2 overflow-y-auto p-3 text-sm">
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
