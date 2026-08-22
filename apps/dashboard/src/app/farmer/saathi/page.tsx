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
  const speechRecRef = useRef<any>(null);
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

  const speakAloud = (text: string, currentLang: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = currentLang === "hi" ? "hi-IN" : "en-IN";
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("speechSynthesis error:", err);
    }
  };

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
  const pushSaathi = (msg: SaathiMessage, shouldSpeak = false) => {
    setMessages((m) => [...m, msg]);
    if (shouldSpeak || voiceMode || listening) {
      speakAloud(msg.text, langRef.current);
    }
  };
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
      console.warn("Retries exhausted, falling back to Web Speech mode");
      startWebSpeechMode();
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

  const startWebSpeechMode = () => {
    if (typeof window === "undefined") return;
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      failVoice(
        langRef.current === "hi"
          ? "यह ब्राउज़र लाइव वॉइस इनपुट सपोर्ट नहीं करता। कृपया टेक्स्ट का उपयोग करें।"
          : "Live voice input is not supported on this browser. Please type your message.",
      );
      return;
    }
    try {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SpeechRec();
      rec.lang = langRef.current === "hi" ? "hi-IN" : "en-IN";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onstart = () => {
        setLiveStatus("live");
        setListening(true);
        connectingRef.current = false;
        pushSystemNote(
          langRef.current === "hi"
            ? "साथी सुन रहा है — अपनी फसल की समस्या बोलें।"
            : "Saathi is listening — speak your crop issue naturally.",
        );
      };
      rec.onresult = (e: any) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) {
            const finalTranscript = (e.results[i][0]?.transcript || "").trim();
            if (finalTranscript) {
              upsertTranscript("farmer", finalTranscript);
              void handleTextAutonomous(finalTranscript, "voice");
            }
          } else {
            interim += e.results[i][0]?.transcript || "";
          }
        }
        if (interim) {
          upsertTranscript("farmer", interim);
        }
      };
      rec.onerror = (e: any) => {
        console.warn("Web Speech error:", e?.error);
        if (e?.error === "not-allowed") {
          failVoice(
            langRef.current === "hi"
              ? "माइक्रोफ़ोन अनुमति अस्वीकृत। ब्राउज़र में Allow दबाएँ।"
              : "Microphone permission denied. Allow the mic in browser.",
          );
        }
      };
      rec.onend = () => {
        if (voiceMode && mountedRef.current && !intentionalCloseRef.current) {
          try {
            rec.start();
          } catch {
            setListening(false);
            setLiveStatus("idle");
          }
        } else {
          setListening(false);
          setLiveStatus("idle");
        }
      };
      speechRecRef.current = rec;
      rec.start();
    } catch (err) {
      failVoice(err instanceof Error ? err.message : "Speech recognition failed");
    }
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
        console.warn("Gemini Live session unavailable, falling back to Web Speech:", body.error);
        startWebSpeechMode();
        return;
      }

      // Contextual injection before opening the Live session.
      const systemInstruction = await composeSystemPrompt();

      const socket = new WebSocket(`${body.websocketUrl}?access_token=${encodeURIComponent(body.token)}`);
      socketRef.current = socket;

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Voice connection timed out")), 15000);
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
            realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: btoa(binary) }] },
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
      console.warn("Live audio WebSocket unavailable, falling back to Web Speech:", err);
      startWebSpeechMode();
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

  const quickPerils: Array<{ peril: any; label: string; emoji: string; phrase: string }> = [
    { peril: "fire_burn", label: lang === "hi" ? "खेत में आग" : "Fire in Field", emoji: "🔥", phrase: lang === "hi" ? "खेत में आग लग गई है" : "There is a fire in my field" },
    { peril: "animal_damage", label: lang === "hi" ? "जंगली जानवर" : "Wild Animals", emoji: "🐗", phrase: lang === "hi" ? "जंगली जानवर ने फसल नुकसान किया" : "Wild animals damaged my crop" },
    { peril: "flood", label: lang === "hi" ? "बाढ़ / जलभराव" : "Flood / Waterlogging", emoji: "🌊", phrase: lang === "hi" ? "बाढ़ का पानी खेत में भर गया है" : "Flood water is logged in the field" },
    { peril: "pest_disease", label: lang === "hi" ? "कीट / रोग" : "Pest & Disease", emoji: "🐛", phrase: lang === "hi" ? "फसल पर कीट और रोग लगा है" : "Pest and disease on my crop" },
    { peril: "hailstorm", label: lang === "hi" ? "ओलावृष्टि" : "Hailstorm", emoji: "🧊", phrase: lang === "hi" ? "ओले गिरने से फसल बर्बाद हुई" : "Hailstorm damaged the field" },
    { peril: "normal", label: lang === "hi" ? "अन्य नुकसान" : "General Loss", emoji: "🌾", phrase: lang === "hi" ? "फसल का नुकसान हुआ है" : "I have general crop loss" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      {/* Header Banner */}
      <div className="fp-panel p-4 text-center sm:p-5">
        <div className="mx-auto flex items-center justify-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--surface)]">
            <Sprout className="h-4 w-4 text-emerald-400" />
          </span>
          <h1 className="text-base font-bold text-slate-900 sm:text-lg">
            {lang === "hi" ? "फ़सल साथी — स्वायत्त आवाज़ सहायक" : "Fasal Saathi — Autonomous Voice Agent"}
          </h1>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
            <ShieldCheck className="h-3 w-3" />
            {lang === "hi" ? "लाइव आवाज़" : "Voice AI"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          {lang === "hi"
            ? "माइक दबाएँ और अपनी भाषा में बताएँ — साथी समस्या समझकर कैमरा तैयार करेगा।"
            : "Tap the mic and speak naturally — Saathi will extract the disaster protocol and set up camera capture."}
        </p>
      </div>

      {/* Hero Voice Orb Hub */}
      <div className="fp-panel flex flex-col items-center justify-center p-6 text-center sm:p-8">
        <div className="relative mb-4 flex items-center justify-center">
          {/* Animated pulse wave rings when live */}
          {liveStatus === "live" && (
            <>
              <span className="absolute h-36 w-36 animate-ping rounded-full bg-red-400/20" />
              <span className="absolute h-28 w-28 animate-pulse rounded-full bg-emerald-400/30" />
            </>
          )}
          {liveStatus === "connecting" && (
            <span className="absolute h-32 w-32 animate-pulse rounded-full bg-amber-400/30" />
          )}

          <button
            type="button"
            onClick={toggleVoiceMode}
            aria-label={liveStatus === "live" ? "Stop Voice" : "Start Voice"}
            className={clsx(
              "relative z-10 flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 sm:h-28 sm:w-28",
              liveStatus === "live"
                ? "bg-red-600 ring-4 ring-red-200 ring-offset-2"
                : liveStatus === "connecting"
                  ? "bg-amber-500 ring-4 ring-amber-200 ring-offset-2"
                  : "bg-emerald-600 ring-4 ring-emerald-100 hover:bg-emerald-700",
            )}
          >
            {liveStatus === "connecting" ? (
              <Loader2 className="h-10 w-10 animate-spin text-white" />
            ) : liveStatus === "live" ? (
              <Mic className="h-10 w-10 animate-pulse text-white" />
            ) : (
              <Mic className="h-10 w-10 text-white" />
            )}
          </button>
        </div>

        {/* Live status label */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold">
            {liveStatus === "live" ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="text-red-700">{lang === "hi" ? "साथी सुन रहा है (बोलें)…" : "Saathi is listening (speak now)…"}</span>
              </>
            ) : liveStatus === "connecting" ? (
              <>
                <span className="h-2 w-2 animate-spin rounded-full bg-amber-500" />
                <span className="text-amber-700">{lang === "hi" ? "जेमिनी लाइव से जुड़ रहा है…" : "Connecting to Gemini Live…"}</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-slate-700">{lang === "hi" ? "बोलने के लिए माइक दबाएँ" : "Tap mic to speak with Saathi"}</span>
              </>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            {lang === "hi" ? "15 भारतीय भाषाएँ समर्थित · पूर्ण द्विमार्गी ऑडियो" : "15 Indian languages supported · Full duplex audio"}
          </p>
        </div>

        {/* Quick Voice Phrase Chips */}
        <div className="mt-6 w-full">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {lang === "hi" ? "त्वरित आवाज़ विषय (टैप या बोलें)" : "Quick Voice Starters (tap or speak)"}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {quickPerils.map((q) => (
              <button
                key={q.peril}
                type="button"
                onClick={() => {
                  void handleTextAutonomous(q.phrase, "voice");
                  if (liveStatus === "idle") {
                    void startVoiceCore();
                  }
                }}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-slate-100",
                  slots.peril === q.peril
                    ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                    : "border-slate-200 bg-white text-slate-700",
                )}
              >
                <span>{q.emoji}</span>
                <span>{q.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Transcript / Response Feed */}
      <div className="fp-panel p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            {lang === "hi" ? "साथी संवाद" : "Saathi Conversation"}
          </span>
          {isAnalyzing && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" />
              {lang === "hi" ? "विश्लेषण…" : "Analyzing…"}
            </span>
          )}
        </div>

        <div
          ref={scrollRef}
          className="max-h-[32vh] min-h-[14vh] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          {messages.map((m) => (
            <div key={m.id} className={clsx("flex", m.role === "farmer" ? "justify-end" : "justify-start")}>
              <div
                className={clsx(
                  "max-w-[90%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed sm:text-sm",
                  m.role === "farmer"
                    ? "bg-[var(--ink)] text-white rounded-br-sm"
                    : "border border-slate-200 bg-white text-slate-800 rounded-bl-sm",
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Autonomous Route Resolution Card */}
      {route && (
        <div className="fp-panel border-emerald-300 bg-emerald-50/40 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Camera className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-sm font-bold text-slate-900">
                {lang === "hi" ? route.labelHi : route.labelEn}
              </h2>
            </div>
            <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-xs font-bold text-white">
              {route.requiredAngles.length} {lang === "hi" ? "फोटो आवश्यक" : "Angles Required"}
            </span>
          </div>

          <p className="mt-1.5 text-xs text-slate-600">
            {lang === "hi" ? route.descriptionHi : route.descriptionEn}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {route.requiredAngles.map((a) => (
              <span key={a} className="rounded border border-emerald-200 bg-white px-2 py-0.5 font-mono text-xs font-medium text-emerald-900">
                {a}
              </span>
            ))}
            {route.contextChecks.length > 0 && (
              <span className="ml-1 text-xs text-slate-500 self-center">+ {route.contextChecks.join(", ")}</span>
            )}
          </div>

          {route.needsSatellite && (
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-800">
              <Volume2 className="h-3.5 w-3.5" />
              {lang === "hi" ? "सैटेलाइट जाँच (Sentinel-2 L2A) इस दावे में स्वतः जुड़ेगी।" : "Sentinel-2 satellite burn scar check attached."}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={proceedToCapture}
              disabled={!canProceed}
              className="fp-btn-primary flex-1 justify-center gap-2 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              <Camera className="h-4 w-4" />
              {lang === "hi" ? "कैमरा खोलें — फोटो लें" : "Open Camera Studio"}
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link href="/farmer/capture" className="fp-btn-secondary py-2.5 text-xs">
              {lang === "hi" ? "स्किप" : "Skip"}
            </Link>
          </div>
        </div>
      )}

      {/* Return to Dashboard */}
      <div className="flex justify-center pt-2">
        <Link href="/farmer" className="text-xs text-slate-500 hover:text-slate-900 underline underline-offset-2">
          ← {lang === "hi" ? "किसान डैशबोर्ड पर लौटें" : "Back to Farmer Dashboard"}
        </Link>
      </div>
    </div>
  );
}
