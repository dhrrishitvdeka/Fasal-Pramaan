"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mic, MicOff, Send, Sprout, Loader2, ArrowRight, ShieldCheck, Camera, Volume2 } from "lucide-react";
import { useFarmerData } from "@/lib/farmerStore";
import { getFarmerT } from "@/lib/farmerI18n";
import { normalizePeril, routeForPeril } from "@/lib/claim-routing";
import {
  initialSaathiGreeting,
  extractSlotsFromText,
  mergeSlots,
  buildSaathiReply,
  nextQuestion,
  slotsToIntent,
  buildSystemPrompt,
  SAATHI_FUNCTION_DECLARATIONS,
  type SaathiMessage,
  type SaathiSlot,
} from "@/lib/saathi-agent";
import { apiFetch } from "@/lib/auth-headers";
import {
  decodeGeminiLiveFrame,
  parseGeminiLiveMessage,
  type GeminiToolInvocation,
} from "@/lib/voice/gemini-live-parse";
import { connectSilentProcessor } from "@/lib/voice/mic-graph";
import clsx from "clsx";

type ContextSignalLite = { source: string; status: string; labelEn: string; summaryEn: string };
type LiveStatus = "idle" | "connecting" | "live";

// --- Gemini Live audio plumbing (mirrors FasalSaathiOverlay) -----------------

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

// -----------------------------------------------------------------------------

export default function SaathiIntakePage() {
  const router = useRouter();
  const { lang, plots, setActiveIntent, activeIntent } = useFarmerData();
  const t = getFarmerT(lang);
  const [messages, setMessages] = useState<SaathiMessage[]>(() => [initialSaathiGreeting(lang)]);
  const [slots, setSlots] = useState<SaathiSlot>({});
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playTimeRef = useRef(0);
  const inputBufRef = useRef("");
  const outputBufRef = useRef("");
  const connectingRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const expiryTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);
  const slotsRef = useRef(slots);
  const langRef = useRef(lang);
  const teardownRef = useRef<() => void>(() => {});

  slotsRef.current = slots;
  langRef.current = lang;

  useEffect(() => {
    if (typeof window !== "undefined") {
      setVoiceSupported("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // hydrate from existing intent if returning
  useEffect(() => {
    if (activeIntent && !slots.peril) {
      setSlots((s) => ({ ...s, peril: activeIntent.peril, crop: activeIntent.crop, village: activeIntent.village, plotId: activeIntent.plotId }));
      const cfg = routeForPeril(activeIntent.peril);
      setMessages((m) => [
        ...m,
        {
          id: `sys-${Date.now()}`,
          role: "saathi",
          text: lang === "hi" ? `पिछला इरादा: ${cfg.labelHi} — जारी रखें या नया बताएँ।` : `Previous intent: ${cfg.labelEn} — continue or tell me a new issue.`,
          at: new Date().toISOString(),
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushFarmer = (text: string) => {
    // eslint-disable-next-line react-hooks/purity
    const msg: SaathiMessage = { id: `f-${Date.now()}-${Math.random().toString(16).slice(2)}`, role: "farmer", text, at: new Date().toISOString() };
    setMessages((m) => [...m, msg]);
    return msg;
  };
  const pushSaathi = (msg: SaathiMessage) => setMessages((m) => [...m, msg]);
  const pushSystemNote = (text: string) =>
    setMessages((m) => [...m, { id: `sys-${Date.now()}-${Math.random().toString(16).slice(2)}`, role: "saathi", text, at: new Date().toISOString() }]);

  /** Streaming transcript bubbles share the main chat area. */
  const upsertTranscript = (role: "farmer" | "saathi", buf: string) => {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && last.id.startsWith("live-") && last.role === role) {
        copy[copy.length - 1] = { ...last, text: buf };
      } else {
        copy.push({ id: `live-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text: buf, at: new Date().toISOString() });
      }
      return copy;
    });
  };

  // ---------------------------------------------------------------------------
  // Contextual injection (server tools) — skipped silently without coordinates
  // ---------------------------------------------------------------------------

  const fetchContextSignals = async (): Promise<ContextSignalLite[] | null> => {
    try {
      const plot = plots.find((p) => p.id === slotsRef.current.plotId) ?? plots[0];
      if (!plot || typeof plot.lat !== "number" || typeof plot.lon !== "number") return null;
      const res = await apiFetch("/api/saathi/tool", {
        method: "POST",
        body: JSON.stringify({
          name: "call_context_signal",
          args: {
            lat: plot.lat,
            lon: plot.lon,
            peril: slotsRef.current.peril || "normal",
            sowingDate: plot.sowingDate || undefined,
          },
        }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { ok?: boolean; data?: { signals?: ContextSignalLite[] } };
      if (body?.ok && Array.isArray(body.data?.signals)) return body.data.signals ?? null;
      return null;
    } catch {
      return null;
    }
  };

  /** buildSystemPrompt(intent, lang) merged with live multi-signal context. */
  const composeSystemPrompt = async (): Promise<string> => {
    const s = slotsRef.current;
    const intent = s.peril ? slotsToIntent(s) : null;
    let prompt = buildSystemPrompt(intent, langRef.current);
    const signals = await fetchContextSignals();
    if (signals && signals.length) {
      prompt +=
        "\nCONTEXT SIGNALS (internal):\n" +
        signals.map((sig) => `- ${sig.source}/${sig.status}: ${sig.labelEn} — ${sig.summaryEn}`).join("\n");
    }
    return prompt;
  };

  const handleText = (raw: string, source: "text" | "voice" = "text") => {
    const text = raw.trim();
    if (!text) return;
    pushFarmer(text);
    const extracted = extractSlotsFromText(text, plots as any);
    const nextSlots = mergeSlots(slots, extracted);
    setSlots(nextSlots);
    // first reply to extraction
    const reply = buildSaathiReply(nextSlots, lang);
    setTimeout(() => pushSaathi(reply), 350);
    const q = nextQuestion(nextSlots, lang);
    if (q) setTimeout(() => pushSaathi(q), 900);
  };

  // Autonomous LLM classification — runs server-side via /api/saathi/tool so
  // GEMINI_API_KEY stays on the server. Falls back to the heuristic on failure.
  const handleTextAutonomous = async (raw: string, source: "text" | "voice" = "text") => {
    handleText(raw, source);
    setIsAnalyzing(true);
    try {
      // Contextual injection on every text turn — silent when GPS/plot unknown.
      let contextNotes: string | undefined;
      const signals = await fetchContextSignals();
      if (signals && signals.length) {
        contextNotes = signals.map((sig) => `- ${sig.source}/${sig.status}: ${sig.labelEn} — ${sig.summaryEn}`).join("\n");
      }
      const s = slotsRef.current;
      const res = await apiFetch("/api/saathi/tool", {
        method: "POST",
        body: JSON.stringify({
          name: "classify_claim",
          args: { text: raw.trim().slice(0, 1000), lang, contextNotes },
        }),
      });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: { peril?: string; confidence?: number; reasoning?: string } }
        | null;
      const llmData = json?.data;
      if (!json?.ok || !llmData || typeof llmData.confidence !== "number" || !llmData.peril) return;
      const llm = {
        peril: normalizePeril(llmData.peril),
        confidence: llmData.confidence,
        reasoning: String(llmData.reasoning || ""),
      };
      if (llm.confidence < 0.6) {
        setTimeout(
          () =>
            pushSaathi({
              id: `clarify-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              role: "saathi",
              text:
                lang === "hi"
                  ? `क्या आप ${llm.peril} की बात कर रहे हैं? कृपया थोड़ा स्पष्ट करें (${llm.reasoning}).`
                  : `Did you mean ${llm.peril}? Please clarify briefly. (${llm.reasoning})`,
              at: new Date().toISOString(),
            }),
          1100,
        );
        return;
      }
      if (!s.peril || s.perilConfidence == null || llm.confidence > (s.perilConfidence || 0)) {
        const refined = mergeSlots(s, { peril: llm.peril, perilConfidence: llm.confidence });
        setSlots(refined);
        setTimeout(
          () =>
            pushSaathi({
              id: `llm-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              role: "saathi",
              text:
                lang === "hi"
                  ? `समझ गया — ${routeForPeril(refined.peril!).labelHi}. कारण: ${llm.reasoning}`
                  : `Understood — ${routeForPeril(refined.peril!).labelEn}. Reason: ${llm.reasoning}`,
              at: new Date().toISOString(),
            }),
          1200,
        );
      }
    } catch {
      // heuristic already handled the reply
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Gemini Live duplex voice session
  // ---------------------------------------------------------------------------

  const stopAudio = () => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
  };

  const clearTimers = () => {
    if (expiryTimerRef.current != null) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const playPcm24k = (b64: string) => {
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
  };

  const failVoice = (message: string) => {
    intentionalCloseRef.current = true;
    connectingRef.current = false;
    clearTimers();
    socketRef.current?.close();
    socketRef.current = null;
    stopAudio();
    retryCountRef.current = 0;
    setLiveStatus("idle");
    setVoiceMode(false);
    pushSystemNote(message);
  };

  const disconnectVoice = () => {
    intentionalCloseRef.current = true;
    connectingRef.current = false;
    clearTimers();
    socketRef.current?.close();
    socketRef.current = null;
    stopAudio();
    setLiveStatus("idle");
  };

  teardownRef.current = disconnectVoice;

  useEffect(
    () => () => {
      mountedRef.current = false;
      teardownRef.current();
    },
    [],
  );

  /** classify_claim runs client-side: merge slots + reply, never hits the tool API. */
  const applyClassifyClaim = (args: Record<string, unknown>): Record<string, unknown> => {
    const rawPeril = typeof args.peril === "string" ? args.peril : "";
    const confRaw = Number(args.confidence);
    const reasoning = typeof args.reasoning === "string" ? args.reasoning : "";
    if (!rawPeril.trim() || !Number.isFinite(confRaw)) {
      return { outcome: "failed", message: "classify_claim needs a peril and numeric confidence." };
    }
    const hi = langRef.current === "hi";
    const peril = normalizePeril(rawPeril);
    const confidence = Math.max(0, Math.min(1, confRaw));
    if (confidence < 0.6) {
      pushSaathi({
        id: `v-clarify-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: "saathi",
        text: hi
          ? `क्या आप ${peril} की बात कर रहे हैं? कृपया थोड़ा स्पष्ट करें।`
          : `Did you mean ${peril}? Please clarify briefly.`,
        at: new Date().toISOString(),
      });
      return { outcome: "ok", data: { peril, confidence, intentComplete: false } };
    }
    const current = slotsRef.current;
    if (!current.peril || current.perilConfidence == null || confidence > (current.perilConfidence || 0)) {
      const refined = mergeSlots(current, { peril, perilConfidence: confidence });
      setSlots(refined);
      const cfg = routeForPeril(peril);
      pushSaathi({
        id: `v-llm-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: "saathi",
        text: hi
          ? `समझ गया — ${cfg.labelHi}. कारण: ${reasoning || "आपकी आवाज़ से पहचाना।"}`
          : `Understood — ${cfg.labelEn}. Reason: ${reasoning || "recognized from your voice."}`,
        at: new Date().toISOString(),
      });
    }
    return { outcome: "ok", data: { peril, confidence, intentComplete: true } };
  };

  /** Tool dispatcher for Live toolCalls — mirrors the overlay's handleTools. */
  const handleTools = async (calls: GeminiToolInvocation[]) => {
    const responses: Array<{ id: string; name: string; response: Record<string, unknown> }> = [];
    for (const call of calls) {
      let payload: Record<string, unknown>;
      if (call.name === "classify_claim") {
        payload = applyClassifyClaim(call.arguments);
      } else {
        try {
          const res = await apiFetch("/api/saathi/tool", {
            method: "POST",
            body: JSON.stringify({ name: call.name, args: call.arguments }),
          });
          const body = (await res.json().catch(() => null)) as { ok?: boolean; data?: unknown; error?: string } | null;
          if (!res.ok || !body?.ok) throw new Error(body?.error || `Tool ${call.name} unavailable (${res.status}).`);
          payload = { outcome: "ok", data: (body.data ?? {}) as Record<string, unknown> };
        } catch (err) {
          payload = { outcome: "failed", message: err instanceof Error ? err.message : "The app action failed." };
        }
      }
      responses.push({ id: call.id, name: call.name, response: payload });
    }
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
    } catch {
      // A dropped tool result is recoverable; the model may re-call the tool.
    }
  };

  /** Silent heuristic merge once a spoken turn settles. */
  const processFinalSpokenTurn = (spoken: string) => {
    const extracted = extractSlotsFromText(spoken, plots as any);
    if (Object.keys(extracted).length) setSlots((s) => mergeSlots(s, extracted));
  };

  const handlersRef = useRef({ handleTools, processFinalSpokenTurn, failVoice });
  handlersRef.current = { handleTools, processFinalSpokenTurn, failVoice };

  const scheduleReconnect = () => {
    if (!mountedRef.current) return;
    if (retryCountRef.current >= 2) {
      failVoice(
        langRef.current === "hi"
          ? "आवाज़ कनेक्शन बार-बार टूटा — टेक्स्ट मोड चालू है।"
          : "Voice connection kept dropping — switched back to text.",
      );
      return;
    }
    retryCountRef.current += 1;
    pushSystemNote(
      langRef.current === "hi"
        ? `दोबारा जुड़ रहा है… (${retryCountRef.current}/2)`
        : `Reconnecting… (${retryCountRef.current}/2)`,
    );
    reconnectTimerRef.current = window.setTimeout(() => {
      void startVoiceCore();
    }, 1200 * retryCountRef.current);
  };

  const startVoiceCore = async () => {
    if (connectingRef.current) return;
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    connectingRef.current = true;
    intentionalCloseRef.current = false;
    inputBufRef.current = "";
    outputBufRef.current = "";
    setLiveStatus("connecting");
    try {
      const minted = await apiFetch("/api/voice/session", { method: "POST" });
      const body = (await minted.json().catch(() => ({}))) as {
        error?: string;
        token?: string;
        websocketUrl?: string;
        model?: string;
        expiresAt?: string;
      };
      if (!minted.ok || !body.token || !body.websocketUrl) {
        throw new Error(body.error || (minted.status === 401 ? "Sign in required for Voice Mode." : "Could not start voice session."));
      }

      // Contextual injection before opening the Live session.
      const systemInstruction = await composeSystemPrompt();

      const socket = new WebSocket(`${body.websocketUrl}?access_token=${encodeURIComponent(body.token)}`);
      socketRef.current = socket;

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Voice connection timed out")), 30000);
        socket.onopen = () => {
          window.clearTimeout(timer);
          socket.send(
            JSON.stringify({
              setup: {
                model: `models/${body.model}`,
                tools: [{ functionDeclarations: SAATHI_FUNCTION_DECLARATIONS }],
                systemInstruction: { parts: [{ text: systemInstruction }] },
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
              },
            }),
          );
          resolve();
        };
        socket.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error(langRef.current === "hi" ? "Gemini Live नहीं खुला।" : "Could not open Gemini Live."));
        };
      });

      socket.onclose = () => {
        if (intentionalCloseRef.current || !mountedRef.current) return;
        if (socketRef.current === socket) socketRef.current = null;
        connectingRef.current = false;
        stopAudio();
        scheduleReconnect();
      };
      socket.onerror = () => {
        // socket.onclose follows and drives the bounded retry.
      };
      socket.onmessage = (event) => {
        void (async () => {
          try {
            const frame = await decodeGeminiLiveFrame(event.data);
            if (!frame) return;
            const parsed = parseGeminiLiveMessage(frame);
            for (const item of parsed.events) {
              if (item.type === "setupComplete") setLiveStatus("live");
              if (item.type === "inputTranscript") {
                inputBufRef.current += item.text;
                upsertTranscript("farmer", inputBufRef.current);
              }
              if (item.type === "outputTranscript") {
                outputBufRef.current += item.text;
                upsertTranscript("saathi", outputBufRef.current);
              }
              if (item.type === "audio") playPcm24k(item.bytesBase64);
              if (item.type === "interrupted") {
                // Drop queued playback so the farmer can barge-in immediately.
                playTimeRef.current = audioCtxRef.current?.currentTime ?? playTimeRef.current;
              }
              if (item.type === "toolCalls") void handlersRef.current.handleTools(item.calls);
              if (item.type === "turnComplete") {
                const spoken = inputBufRef.current.trim();
                inputBufRef.current = "";
                outputBufRef.current = "";
                if (spoken) handlersRef.current.processFinalSpokenTurn(spoken);
              }
              if (item.type === "error") {
                failVoice(
                  langRef.current === "hi"
                    ? `आवाज़ सत्र त्रुटि: ${item.message}`
                    : `Voice session error: ${item.message}`,
                );
              }
            }
          } catch {
            console.warn("Ignored a non-JSON Gemini Live frame");
          }
        })();
      };

      if (body.expiresAt) {
        const remain = new Date(body.expiresAt).getTime() - Date.now() - 15000;
        if (remain > 0) {
          expiryTimerRef.current = window.setTimeout(() => {
            handlersRef.current.failVoice(
              langRef.current === "hi"
                ? "सत्र समाप्त हुआ — दोबारा माइक दबाएँ।"
                : "Session ended — tap the mic again.",
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
        const chunk = ev.inputBuffer.getChannelData(0);
        const pcm = downsampleTo16k(chunk, ev.inputBuffer.sampleRate);
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

      connectingRef.current = false;
      retryCountRef.current = 0;
      setLiveStatus("live");
    } catch (err) {
      connectingRef.current = false;
      handlersRef.current.failVoice(err instanceof Error ? err.message : "Could not start Fasal Saathi voice.");
    }
  };

  const toggleVoiceMode = () => {
    if (voiceMode || liveStatus !== "idle") {
      disconnectVoice();
      setVoiceMode(false);
      retryCountRef.current = 0;
      pushSystemNote(lang === "hi" ? "वॉइस मोड बंद — टाइप करते रहें।" : "Voice mode off — you can keep typing.");
      return;
    }
    if (typeof window !== "undefined" && !("WebSocket" in window)) {
      pushSystemNote(lang === "hi" ? "यह ब्राउज़र लाइव वॉइस सपोर्ट नहीं करता।" : "This browser does not support live voice.");
      return;
    }
    setVoiceMode(true);
    retryCountRef.current = 0;
    void startVoiceCore();
  };

  const toggleVoice = () => {
    if (listening) {
      setListening(false);
      return;
    }
    if (liveStatus !== "idle") return; // duplex voice owns the microphone
    if (typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      try {
        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const rec = new SpeechRec();
        rec.lang = lang === "hi" ? "hi-IN" : "en-IN";
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.onstart = () => setListening(true);
        rec.onresult = (e: any) => {
          const transcript = e.results[0][0].transcript as string;
          setListening(false);
          void handleTextAutonomous(transcript, "voice");
        };
        rec.onerror = () => setListening(false);
        rec.onend = () => setListening(false);
        rec.start();
      } catch {
        setListening(false);
      }
    }
  };

  const canProceed = Boolean(slots.peril);
  const intentPreview = canProceed ? slotsToIntent(slots) : null;
  const route = slots.peril ? routeForPeril(slots.peril) : null;

  const proceedToCapture = () => {
    if (!canProceed || !intentPreview) return;
    // persist intent before navigation
    setActiveIntent(intentPreview);
    const params = new URLSearchParams({ intentId: intentPreview.id, peril: intentPreview.peril });
    if (slots.plotId) params.set("plotId", slots.plotId);
    if (intentPreview.crop) params.set("crop", intentPreview.crop);
    router.push(`/farmer/capture?${params.toString()}`);
  };

  const quickPerils: Array<{ peril: any; label: string; emoji: string }> = [
    { peril: "normal", label: lang === "hi" ? "सामान्य" : "General", emoji: "🌾" },
    { peril: "fire_burn", label: lang === "hi" ? "आग" : "Fire", emoji: "🔥" },
    { peril: "animal_damage", label: lang === "hi" ? "जानवर" : "Animal", emoji: "🐗" },
    { peril: "flood", label: lang === "hi" ? "बाढ़" : "Flood", emoji: "🌊" },
    { peril: "pest_disease", label: lang === "hi" ? "कीट/रोग" : "Pest", emoji: "🐛" },
    { peril: "hailstorm", label: lang === "hi" ? "ओला" : "Hail", emoji: "🧊" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="fp-panel p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--surface)]">
            <Sprout className="h-4 w-4 text-emerald-400" />
          </span>
          <div>
            <h1 className="text-sm font-bold text-slate-900 sm:text-base">
              {lang === "hi" ? "फसल साथी — पहला संपर्क" : "Fasal Saathi — First Contact"}
            </h1>
            <p className="text-xs text-slate-600">
              {lang === "hi" ? "बताएँ क्या हुआ, साथी आगे का रास्ता तय करेगा।" : "Tell what happened — Saathi will route evidence collection."}
            </p>
          </div>
          {liveStatus !== "idle" && (
            <span
              className={clsx(
                "ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold",
                liveStatus === "live"
                  ? "animate-pulse border-red-200 bg-red-50 text-red-700"
                  : "border-amber-200 bg-amber-50 text-amber-800",
              )}
            >
              ● {liveStatus === "live" ? (lang === "hi" ? "लाइव" : "Live") : lang === "hi" ? "जुड़ रहा है…" : "Connecting…"}
            </span>
          )}
          <span
            className={clsx(
              "hidden items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 sm:inline-flex",
              liveStatus === "idle" && "ml-auto",
            )}
          >
            <ShieldCheck className="h-3 w-3" />
            {lang === "hi" ? "स्वायत्त एजेंट" : "Autonomous"}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          {lang === "hi"
            ? "उदाहरण: “खेत में आग लग गई”, “जंगली सूअर ने धान खा लिया”, “बाढ़ से फसल डूबी”, “पत्तियों पर पीले धब्बे”।"
            : 'Examples: "fire in field", "wild boar grazed paddy", "flood waterlogging", "yellow spots on leaves".'}
        </p>
      </div>

      <div className="fp-panel p-2 sm:p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {quickPerils.map((q) => (
            <button
              key={q.peril}
              type="button"
              onClick={() => handleText(q.label)}
              className={clsx(
                "inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-semibold",
                slots.peril === q.peril ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-slate-200 bg-white hover:bg-slate-50"
              )}
            >
              <span className="mr-1">{q.emoji}</span>
              {q.label}
            </button>
          ))}
        </div>

        <div ref={scrollRef} className="max-h-[42vh] min-h-[22vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 sm:max-h-[48vh]">
          <div className="space-y-2">
            {messages.map((m) => (
              <div key={m.id} className={clsx("flex", m.role === "farmer" ? "justify-end" : "justify-start")}>
                <div
                  className={clsx(
                    "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed sm:max-w-[85%]",
                    m.role === "farmer" ? "bg-[var(--ink)] text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {isAnalyzing && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-500 shadow-2xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
                  <span className="animate-pulse">
                    {lang === "hi" ? "साथी विश्लेषण कर रहा है…" : "Saathi is analyzing…"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {!voiceSupported && (
          <p className="mt-2 text-xs text-slate-500">
            {lang === "hi" ? "ब्राउज़र में वॉइस नहीं — टाइप करें।" : "Voice not available in this browser — type instead."}
          </p>
        )}
      </div>

      {/* Docked composer — pinned above the bottom nav / home indicator on phone */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 -mx-3 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-[0_-4px_12px_rgba(28,25,21,0.08)] backdrop-blur-md sm:-mx-4 sm:px-4 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none md:backdrop-blur-none">
        <div className="fp-panel flex items-center gap-1.5 p-1.5">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = input;
                setInput("");
                void handleTextAutonomous(v);
              }
            }}
            placeholder={lang === "hi" ? "यहाँ लिखें या बोलें…" : "Type or speak your issue…"}
            aria-label={lang === "hi" ? "अपनी समस्या लिखें" : "Describe your issue"}
            className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={toggleVoiceMode}
            title={lang === "hi" ? "वॉइस मोड (लाइव)" : "Voice Mode (duplex)"}
            aria-label={lang === "hi" ? "वॉइस मोड (लाइव)" : "Voice Mode (duplex)"}
            className={clsx(
              "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-colors",
              liveStatus === "live"
                ? "animate-pulse bg-red-600"
                : liveStatus === "connecting"
                  ? "animate-pulse bg-amber-500"
                  : "bg-emerald-600 hover:bg-emerald-700",
              !voiceMode && voiceSupported === false && "opacity-60",
            )}
          >
            <Mic className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggleVoice}
            disabled={liveStatus !== "idle"}
            className={clsx(
              "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors",
              listening ? "bg-red-600 text-white animate-pulse" : "bg-slate-100 text-slate-700",
              liveStatus !== "idle" && "opacity-40",
            )}
            aria-label={
              listening
                ? lang === "hi"
                  ? "आवाज़ लिखना रोकें"
                  : "Stop voice dictation"
                : lang === "hi"
                  ? "बोलकर लिखवाएँ"
                  : "Start voice dictation"
            }
          >
            {listening ? <MicOff className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => {
              const v = input;
              setInput("");
              void handleTextAutonomous(v);
            }}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-white transition-colors hover:bg-[var(--accent)]"
            aria-label={lang === "hi" ? "भेजें" : "Send message"}
          >
            <Send className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {route && (
        <div className="fp-panel p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">Route</h2>
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">{route.requiredAngles.length} angles</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {lang === "hi" ? route.labelHi : route.labelEn} — {lang === "hi" ? route.descriptionHi : route.descriptionEn}
          </p>
          <p className="mt-1 text-xs text-slate-600">{lang === "hi" ? route.guidanceExtraHi : route.guidanceExtraEn}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {route.requiredAngles.map((a) => (
              <span key={a} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs">
                {a}
              </span>
            ))}
            {route.contextChecks.length > 0 && (
              <span className="ml-1 text-xs text-slate-500">+ {route.contextChecks.join(", ")}</span>
            )}
          </div>
          {route.needsSatellite && (
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-800">
              <Volume2 className="h-3.5 w-3.5" />
              {lang === "hi" ? "सैटेलाइट जाँच (Sentinel) इस दावे में जुड़ेगी।" : "Satellite check (Sentinel) will be attached for this peril."}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={proceedToCapture} disabled={!canProceed} className="fp-btn-primary flex-1 gap-2 disabled:opacity-40">
              <Camera className="h-4 w-4" />
              {lang === "hi" ? "कैप्चर खोलें" : "Open Capture"}
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link href="/farmer/capture" className="fp-btn-secondary">
              {lang === "hi" ? "सीधे कैप्चर" : "Skip"}
            </Link>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {lang === "hi" ? "टिप: फोटो के बाद Gemini + CV जाँच होगी, साथी मार्गदर्शन देता रहेगा।" : "Note: After each photo, Gemini + CV will verify usability and Saathi keeps guiding."}
          </p>
        </div>
      )}

      <div className="flex justify-center">
        <Link href="/farmer" className="text-xs text-slate-500 underline underline-offset-2">
          ← {lang === "hi" ? "डैशबोर्ड" : "Back to dashboard"}
        </Link>
      </div>
    </div>
  );
}
