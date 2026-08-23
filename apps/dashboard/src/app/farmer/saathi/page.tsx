"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Mic,
  MicOff,
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
} from "lucide-react";
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
  resolveAgenticAction,
  SAATHI_FUNCTION_DECLARATIONS,
  type SaathiMessage,
  type SaathiSlot,
  type AgentAction,
} from "@/lib/saathi-agent";
import { apiFetch } from "@/lib/auth-headers";
import {
  decodeGeminiLiveFrame,
  parseGeminiLiveMessage,
  type GeminiToolInvocation,
} from "@/lib/voice/gemini-live-parse";
import { startLiveAudio, type LiveAudioSession } from "@/lib/voice/live-audio";
import clsx from "clsx";

type ContextSignalLite = { source: string; status: string; labelEn: string; summaryEn: string };
type LiveStatus = "idle" | "connecting" | "live";

export default function SaathiIntakePage() {
  const router = useRouter();
  const { lang, setLang, plots, setActiveIntent, activeIntent } = useFarmerData();
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
  const liveAudioRef = useRef<LiveAudioSession | null>(null);
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
      setVoiceSupported(
        Boolean(
          typeof navigator?.mediaDevices?.getUserMedia === "function" &&
            (window.AudioContext || (window as any).webkitAudioContext),
        ),
      );
    }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length <= 1) {
        return [initialSaathiGreeting(lang)];
      }
      return prev;
    });
  }, [lang]);

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
          textHi: `पिछला इरादा: ${cfg.labelHi} — जारी रखें या नया बताएँ।`,
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
  const pushSaathi = (msg: SaathiMessage) => {
    setMessages((m) => [...m, msg]);
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

    // Agentic Intent & Action Resolution
    const res = resolveAgenticAction(text, slots, plots as any, lang);
    setSlots(res.slots);

    setTimeout(() => pushSaathi(res.replyMessage), 350);

    // Execute Autonomous Agent Action
    if (res.action) {
      const action = res.action;
      if (action.type === "open_camera") {
        const intent = slotsToIntent(res.slots, source === "voice" ? "saathi_voice" : "saathi_text");
        setActiveIntent(intent);
        const peril = action.peril || "normal";
        const cameraUrl = `/farmer/capture?peril=${encodeURIComponent(peril)}${res.slots.plotId ? `&plotId=${encodeURIComponent(res.slots.plotId)}` : ""}${res.slots.crop ? `&crop=${encodeURIComponent(res.slots.crop)}` : ""}`;
        setTimeout(() => {
          router.push(cameraUrl);
        }, 1200);
      } else if (action.type === "navigate") {
        setTimeout(() => {
          router.push(action.url);
        }, 1000);
      } else if (action.type === "switch_language") {
        setLang(action.lang);
      }
    } else {
      const q = nextQuestion(res.slots, lang);
      if (q) setTimeout(() => pushSaathi(q), 900);
    }
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
                  ? `क्या आप ${routeForPeril(llm.peril).labelHi || llm.peril} की बात कर रहे हैं? कृपया थोड़ा स्पष्ट करें (${llm.reasoning})।`
                  : `Did you mean ${routeForPeril(llm.peril).labelEn || llm.peril}? Please clarify briefly. (${llm.reasoning})`,
              textHi: `क्या आप ${routeForPeril(llm.peril).labelHi || llm.peril} की बात कर रहे हैं? कृपया थोड़ा स्पष्ट करें (${llm.reasoning})।`,
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
                  ? `समझ गया — ${routeForPeril(refined.peril!).labelHi}। ${llm.reasoning ? `कारण: ${llm.reasoning}` : ""}`
                  : `Understood — ${routeForPeril(refined.peril!).labelEn}. Reason: ${llm.reasoning}`,
              textHi: `समझ गया — ${routeForPeril(refined.peril!).labelHi}। ${llm.reasoning ? `कारण: ${llm.reasoning}` : ""}`,
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
    liveAudioRef.current?.stop();
    liveAudioRef.current = null;
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
    liveAudioRef.current?.playPcm24k(b64);
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
          ? "Gemini Live सत्र पुनः कनेक्ट नहीं हो सका। दोबारा माइक दबाएँ।"
          : "Gemini Live session could not reconnect. Tap mic to restart.",
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
        failVoice(
          body.error ||
            (langRef.current === "hi"
              ? "Gemini Live सत्र उपलब्ध नहीं है। कृपया GEMINI_API_KEY जांचें।"
              : "Gemini Live session unavailable. Please check GEMINI_API_KEY."),
        );
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
                liveAudioRef.current?.interrupt();
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

      const liveAudio = await startLiveAudio({
        socket,
        micPermissionMessage:
          langRef.current === "hi"
            ? "माइक्रोफ़ोन अनुमति चाहिए। ब्राउज़र में Allow दबाएँ।"
            : "Microphone permission is required. Allow the mic in the browser prompt.",
      });
      liveAudioRef.current = liveAudio;

      connectingRef.current = false;
      retryCountRef.current = 0;
      setLiveStatus("live");
    } catch (err) {
      connectingRef.current = false;
      failVoice(err instanceof Error ? err.message : "Gemini Live connection failed");
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

  const quickPerils = [
    {
      peril: "fire_burn",
      label: t.perilFire,
      icon: Flame,
      phrase: t.perilFirePhrase,
    },
    {
      peril: "animal_damage",
      label: t.perilAnimals,
      icon: PawPrint,
      phrase: t.perilAnimalsPhrase,
    },
    {
      peril: "flood",
      label: t.perilFlood,
      icon: Waves,
      phrase: t.perilFloodPhrase,
    },
    {
      peril: "pest_disease",
      label: t.perilPest,
      icon: Bug,
      phrase: t.perilPestPhrase,
    },
    {
      peril: "hailstorm",
      label: t.perilHail,
      icon: CloudHail,
      phrase: t.perilHailPhrase,
    },
    {
      peril: "normal",
      label: t.perilOther,
      icon: Sprout,
      phrase: t.perilOtherPhrase,
    },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      {/* Header Banner */}
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
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 whitespace-nowrap">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
            <span>{lang === "hi" ? "सहायता पोर्टल" : "PMFBY Intake"}</span>
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-600 leading-relaxed border-t border-stone-100 pt-2.5">
          {lang === "hi"
            ? "माइक दबाकर अपनी फसल समस्या बोलें — साथी आवश्यक फोटो और नियम तैयार करेगा।"
            : "Tap the microphone below and describe your crop issue — Saathi sets up the damage protocol and camera angles."}
        </p>
      </div>

      {/* Hero Voice Orb Hub */}
      <div className="fp-panel rounded-2xl p-6 text-center sm:p-7 border border-stone-200/90 bg-[#fffdf9] shadow-2xs">
        <div className="relative mx-auto mb-4 flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center">
          {/* Animated Ambient Acoustic Rings */}
          {liveStatus === "live" ? (
            <>
              <span className="absolute inset-0 rounded-full bg-rose-500/25 animate-ping pointer-events-none" />
              <span className="absolute -inset-2 rounded-full bg-rose-400/20 animate-pulse pointer-events-none" />
            </>
          ) : liveStatus === "connecting" ? (
            <>
              <span className="absolute inset-0 rounded-full bg-amber-400/20 animate-ping pointer-events-none" />
            </>
          ) : (
            <>
              <span className="absolute inset-0 rounded-full bg-emerald-500/15 mic-breathe-ring pointer-events-none" />
              <span className="absolute -inset-1.5 rounded-full bg-emerald-400/10 mic-breathe-subtle-ring pointer-events-none" />
            </>
          )}

          <button
            type="button"
            onClick={toggleVoiceMode}
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

        {/* Live status label */}
        <div className="space-y-1 select-none cursor-default">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 py-1 text-xs font-semibold shadow-2xs select-none cursor-default">
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
          <p className="text-[11px] text-slate-500 select-none cursor-default">
            {t.saathiLangSupported}
          </p>
        </div>

        {/* Quick Voice Phrase Chips */}
        <div className="mt-6 w-full pt-4 border-t border-stone-100">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 select-none cursor-default">
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
                    void handleTextAutonomous(q.phrase, "voice");
                    if (liveStatus === "idle") {
                      void startVoiceCore();
                    }
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

      {/* Live Transcript / Response Feed */}
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

        {/* Manual Input Fallback */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim()) return;
            void handleTextAutonomous(input, "text");
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

      {/* Autonomous Route Resolution Card */}
      {route && (
        <div className="fp-panel rounded-2xl border-emerald-300 bg-emerald-50/50 p-4 sm:p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-700 text-white">
                <Camera className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {lang === "en" ? route.labelEn : (lang === "hi" ? route.labelHi : route.labelHi || route.labelEn)}
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
            {lang === "en" ? route.descriptionEn : (lang === "hi" ? route.descriptionHi : route.descriptionHi || route.descriptionEn)}
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
            {route.contextChecks.length > 0 && (
              <span className="ml-1 text-xs text-slate-500 self-center">
                + {route.contextChecks.join(", ")}
              </span>
            )}
          </div>

          {route.needsSatellite && (
            <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200/80 rounded-xl p-2.5">
              <Volume2 className="h-3.5 w-3.5 text-amber-700 shrink-0" />
              <span>{lang === "en" ? "Sentinel-2 satellite burn scar verification attached." : "सैटेलाइट जाँच (Sentinel-2 L2A) इस दावे में स्वतः जुड़ेगी।"}</span>
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
            <Link href="/farmer/capture" className="fp-btn-secondary py-2.5 text-xs rounded-xl">
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
