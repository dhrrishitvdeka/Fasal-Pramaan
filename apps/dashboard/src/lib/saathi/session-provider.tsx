"use client";

import { apiFetch } from "@/lib/auth-headers";
import { normalizePeril, routeForPeril } from "@/lib/claim-routing";
import { useFarmerData } from "@/lib/farmerStore";
import {
  extractSlotsFromText,
  initialSaathiGreeting,
  mergeSlots,
  nextQuestion,
  resolveAgenticAction,
  slotsToIntent,
  type SaathiMessage,
  type SaathiSlot,
} from "@/lib/saathi-agent";
import { webCaptureBridge } from "@/lib/voice/capture-bridge";
import { nativeLabelForLang } from "@/lib/live-indian-languages";
import {
  decodeGeminiLiveFrame,
  parseGeminiLiveMessage,
  type GeminiToolInvocation,
} from "@/lib/voice/gemini-live-parse";
import { startLiveAudio, type LiveAudioSession } from "@/lib/voice/live-audio";
import { WebVoiceBroker } from "@/lib/voice/web-voice-broker";
import { usePathname, useRouter } from "next/navigation";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type SaathiLiveStatus = "idle" | "connecting" | "live" | "error";

const STORAGE_KEY = "fp_saathi_session_v1";
const MAX_STORED_MESSAGES = 80;

type StoredSession = { messages: SaathiMessage[]; slots: SaathiSlot };

function loadStored(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!Array.isArray(parsed?.messages) || parsed.messages.length === 0) return null;
    return { messages: parsed.messages.slice(-MAX_STORED_MESSAGES), slots: parsed.slots || {} };
  } catch {
    return null;
  }
}

function persistStored(messages: SaathiMessage[], slots: SaathiSlot) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ messages: messages.slice(-MAX_STORED_MESSAGES), slots }),
    );
  } catch {
    // quota / private mode
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type SaathiSessionValue = {
  messages: SaathiMessage[];
  slots: SaathiSlot;
  liveStatus: SaathiLiveStatus;
  error: string | null;
  isSpeaking: boolean;
  isAnalyzing: boolean;
  lastTool: string | null;
  overlayOpen: boolean;
  setOverlayOpen: (open: boolean) => void;
  connectVoice: () => Promise<void>;
  disconnectVoice: () => void;
  toggleVoice: () => void;
  resetSession: () => void;
  sendText: (text: string, source?: "text" | "voice") => Promise<void>;
  proceedToCapture: () => void;
};

const SaathiSessionContext = createContext<SaathiSessionValue | null>(null);

export function useSaathiSession(): SaathiSessionValue {
  const ctx = useContext(SaathiSessionContext);
  if (!ctx) {
    throw new Error("useSaathiSession must be used inside SaathiSessionProvider");
  }
  return ctx;
}

export function SaathiSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    lang,
    setLang,
    plots,
    claims,
    milestones,
    farmerProfile,
    setActiveIntent,
    registerPlot,
    snoozeMilestone,
    completeMilestone,
  } = useFarmerData();

  const [messages, setMessages] = useState<SaathiMessage[]>(() => [initialSaathiGreeting(lang)]);
  const [slots, setSlots] = useState<SaathiSlot>({});
  const [liveStatus, setLiveStatus] = useState<SaathiLiveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastTool, setLastTool] = useState<string | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);

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
  const reconnectTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const statusRef = useRef<SaathiLiveStatus>("idle");
  const langRef = useRef(lang);
  const prevLangRef = useRef(lang);
  const slotsRef = useRef(slots);
  const pathnameRef = useRef(pathname);
  const registerPlotRef = useRef(registerPlot);
  const mountedRef = useRef(true);
  const connectVoiceRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const hasGreetedRef = useRef(false);
  const openingRef = useRef(false);
  const openingTimerRef = useRef<number | null>(null);

  statusRef.current = liveStatus;
  langRef.current = lang;
  slotsRef.current = slots;
  pathnameRef.current = pathname;
  registerPlotRef.current = registerPlot;

  useEffect(() => {
    const s = loadStored();
    if (s && s.messages.length > 0) {
      setMessages(s.messages);
      if (s.slots && Object.keys(s.slots).length > 0) {
        setSlots(s.slots);
      }
      hasGreetedRef.current = s.messages.length > 1;
    }
  }, []);

  useEffect(() => {
    persistStored(messages, slots);
  }, [messages, slots]);

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
        navigate: (path) => {
          // Keep the live session — the provider lives in the farmer layout.
          router.push(path);
        },
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
            // GPS optional
          }
          return await registerPlotRef.current({
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
        },
        capture: webCaptureBridge,
      }),
    [
      plots,
      claims,
      milestones,
      farmerProfile,
      pathname,
      lang,
      router,
      setLang,
      snoozeMilestone,
      completeMilestone,
    ],
  );
  const brokerRef = useRef(broker);
  brokerRef.current = broker;

  const snapshotRef = useRef({ pathname, lang, plots, claims, milestones });
  snapshotRef.current = { pathname, lang, plots, claims, milestones };

  const pushNote = useCallback((text: string) => {
    setMessages((m) => [
      ...m,
      { id: newId("sys"), role: "saathi", text, at: new Date().toISOString() },
    ]);
  }, []);

  const upsertTranscript = useCallback((role: "farmer" | "saathi", buf: string) => {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && last.id.startsWith("live-") && last.role === role) {
        copy[copy.length - 1] = { ...last, text: buf };
      } else if (
        role === "saathi" &&
        last?.role === "saathi" &&
        !last.id.startsWith("live-") &&
        !last.id.startsWith("sys-")
      ) {
        copy[copy.length - 1] = {
          id: `live-saathi-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role,
          text: buf,
          at: new Date().toISOString(),
        };
      } else {
        copy.push({
          id: `live-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role,
          text: buf,
          at: new Date().toISOString(),
        });
      }
      return copy;
    });
  }, []);

  const stopAudio = useCallback(() => {
    liveAudioRef.current?.stop();
    liveAudioRef.current = null;
    setIsSpeaking(false);
  }, []);

  const clearTimers = useCallback(() => {
    if (expiryTimerRef.current != null) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (openingTimerRef.current != null) {
      window.clearTimeout(openingTimerRef.current);
      openingTimerRef.current = null;
    }
  }, []);

  const disconnectVoice = useCallback(() => {
    intentionalCloseRef.current = true;
    connectingRef.current = false;
    setupCompleteRef.current = false;
    openingRef.current = false;
    lastContextRef.current = "";
    retryCountRef.current = 0;
    clearTimers();
    socketRef.current?.close();
    socketRef.current = null;
    stopAudio();
    setLiveStatus("idle");
    setError(null);
  }, [clearTimers, stopAudio]);

  const failSession = useCallback(
    (message: string) => {
      intentionalCloseRef.current = true;
      connectingRef.current = false;
      setupCompleteRef.current = false;
      openingRef.current = false;
      lastContextRef.current = "";
      retryCountRef.current = 0;
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
      stopAudio();
      setLiveStatus("error");
      setError(message);
      pushNote(message);
    },
    [clearTimers, stopAudio, pushNote],
  );

  const pushPortalContext = useCallback((reason: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !setupCompleteRef.current) return;
    if (openingRef.current) return;
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
    const signals = webCaptureBridge.getContextSignals() as Array<{
      source: string;
      status: string;
      labelEn: string;
    }> | null;
    const payload = {
      type: "portal_context",
      path: snap.pathname,
      language: snap.lang,
      plot_count: snap.plots.length,
      plots_summary: snap.plots.map((p) => ({
        id: p.id,
        name: p.name,
        crop: p.cropType,
        khasra: p.khasraNumber,
      })),
      claim_count: snap.claims.length,
      recapture_count: recapture.length,
      next_reminder: nextReminder
        ? { id: nextReminder.id, stage: nextReminder.stageName, due: nextReminder.dueDate }
        : null,
      active_intent: intent
        ? { peril: intent.peril, crop: intent.crop || null, village: intent.village || null }
        : null,
      live_cv: cv ? { hint_code: cv.hintCode, hint_en: cv.hintEn, green_pct: cv.greenPct, luma: cv.luma } : null,
      context_signals: signals
        ? signals.map((s) => ({ source: s.source, status: s.status, label: s.labelEn }))
        : null,
    };
    void reason;
    const text = `PORTAL CONTEXT (internal; do not read aloud unless asked):\n${JSON.stringify(payload)}`;
    if (text === lastContextRef.current) return;
    lastContextRef.current = text;
    try {
      socket.send(JSON.stringify({ realtimeInput: { text } }));
    } catch {
      // recoverable
    }
  }, []);

  const handleTools = useCallback(
    async (calls: GeminiToolInvocation[]) => {
      const responses = [];
      for (const call of calls) {
        let result;
        try {
          result = await brokerRef.current.execute(call.name, call.arguments, userTurnRef.current);
        } catch (err) {
          result = {
            outcome: "failed" as const,
            message: err instanceof Error ? err.message : "The app action failed.",
          };
        }
        setLastTool(`${call.name} · ${result.outcome}`);
        // Tool ACKs stay off the transcript — Gemini already speaks the farmer-facing reply.
        // Dumping result.message here produced English "Done." bubbles after every classify/angles call.
        responses.push({
          id: call.id,
          name: call.name,
          response: { outcome: result.outcome, message: result.message, data: result.data || {} },
        });
      }
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
      } catch {
        // model may retry the tool
      }
    },
    [],
  );

  const connectVoice = useCallback(async () => {
    if (connectingRef.current) return;
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    connectingRef.current = true;
    intentionalCloseRef.current = false;
    setupCompleteRef.current = false;
    lastContextRef.current = "";
    inputBufRef.current = "";
    outputBufRef.current = "";
    setLastTool(null);
    setError(null);
    setLiveStatus("connecting");
    try {
      const minted = await apiFetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: langRef.current }),
      });
      // Guard: disconnect or unmount happened while minting the token
      if (intentionalCloseRef.current || !mountedRef.current) {
        connectingRef.current = false;
        return;
      }
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
      const socket = new WebSocket(`${body.websocketUrl}?access_token=${encodeURIComponent(body.token)}`);
      socketRef.current = socket;

      const consumeFrame = async (event: MessageEvent) => {
        try {
          const frame = await decodeGeminiLiveFrame(event.data);
          if (!frame) return false;
          const parsed = parseGeminiLiveMessage(frame);
          for (const item of parsed.events) {
            if (item.type === "setupComplete") {
              setupCompleteRef.current = true;
              setLiveStatus("live");
              retryCountRef.current = 0;
              if (!hasGreetedRef.current) {
                openingRef.current = true;
                liveAudioRef.current?.setHoldUplink(true);
                pushPortalContext("session_start");
                if (openingTimerRef.current != null) window.clearTimeout(openingTimerRef.current);
                openingTimerRef.current = window.setTimeout(() => {
                  if (!openingRef.current) return;
                  openingRef.current = false;
                  liveAudioRef.current?.setHoldUplink(false);
                }, 12_000);
                hasGreetedRef.current = true;
                const activeLang = langRef.current;
                const isHi = activeLang === "hi";
                const isEn = activeLang === "en";
                const targetLabel = nativeLabelForLang(activeLang);
                const greetingPrompt = isHi
                  ? "किसान अभी जुड़े हैं। सत्र की सक्रिय भाषा केवल 'हिन्दी' (Hindi) है। किसान को संक्षेप में (1-2 वाक्यों में) नमस्ते कहें और पूछें कि उनकी फसल में क्या नुकसान हुआ है। पूरी बातचीत हिन्दी में ही करें, अंग्रेजी शब्दों (जैसे crop, paddy, photo, claim, damage, status) के कारण कभी अंग्रेजी में न बदलें।"
                  : isEn
                    ? "The farmer just joined. The active session language is strictly English. Greet them warmly and briefly (1-2 sentences) in English and ask what happened to their crop. Speak strictly in English unless explicitly commanded to switch."
                    : `The farmer just joined. The active session language is strictly ${targetLabel} ('${activeLang}'). Greet them warmly and briefly (1-2 sentences) in ${targetLabel} and ask what happened to their crop. Speak strictly in ${targetLabel}. Do not switch languages on incidental loanwords.`;
                try {
                  socket.send(
                    JSON.stringify({
                      realtimeInput: {
                        text: greetingPrompt,
                      },
                    }),
                  );
                } catch {
                  // ignore
                }
              } else {
                openingRef.current = false;
                liveAudioRef.current?.setHoldUplink(false);
                pushPortalContext("resume");
              }
            }
            if (item.type === "inputTranscript") {
              if (openingRef.current) continue;
              inputBufRef.current += item.text;
              upsertTranscript("farmer", inputBufRef.current);
            }
            if (item.type === "outputTranscript") {
              outputBufRef.current += item.text;
              upsertTranscript("saathi", outputBufRef.current);
            }
            if (item.type === "interrupted") liveAudioRef.current?.interrupt();
            if (item.type === "audio") liveAudioRef.current?.playPcm24k(item.bytesBase64);
            if (item.type === "toolCalls") void handleTools(item.calls);
            if (item.type === "turnComplete") {
              const spoken = inputBufRef.current.trim();
              if (spoken && !openingRef.current) {
                userTurnRef.current += 1;
                const extracted = extractSlotsFromText(spoken, plots as never);
                if (Object.keys(extracted).length) setSlots((s) => mergeSlots(s, extracted));
              }
              inputBufRef.current = "";
              outputBufRef.current = "";
              if (openingRef.current) {
                openingRef.current = false;
                if (openingTimerRef.current != null) {
                  window.clearTimeout(openingTimerRef.current);
                  openingTimerRef.current = null;
                }
                liveAudioRef.current?.setHoldUplink(false);
                pushPortalContext("session_start");
              }
            }
            if (item.type === "error") {
              failSession(
                langRef.current === "hi"
                  ? `आवाज़ सत्र त्रुटि: ${item.message}`
                  : `Voice session error: ${item.message}`,
              );
            }
          }
          return parsed.setupComplete;
        } catch {
          console.warn("Ignored a non-JSON Gemini Live frame");
          return false;
        }
      };

      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          try {
            socket.close();
          } catch {
            // ignore
          }
          reject(new Error("Voice connection timed out"));
        }, 15000);
        socket.onopen = () => {
          try {
            socket.send(JSON.stringify({ setup: { model: `models/${body.model}` } }));
          } catch (err) {
            window.clearTimeout(timer);
            try {
              socket.close();
            } catch {
              // ignore
            }
            reject(err instanceof Error ? err : new Error("Voice setup failed"));
          }
        };
        socket.onerror = () => {
          window.clearTimeout(timer);
          try {
            socket.close();
          } catch {
            // ignore
          }
          reject(new Error(langRef.current === "hi" ? "Gemini Live नहीं खुला।" : "Could not open Gemini Live."));
        };
        socket.onclose = () => {
          window.clearTimeout(timer);
          reject(
            new Error(
              langRef.current === "hi"
                ? "Gemini Live सेटअप से पहले बंद हो गया।"
                : "Gemini Live closed before setup completed.",
            ),
          );
        };
        socket.onmessage = (event) => {
          void consumeFrame(event).then((ready) => {
            if (!ready) return;
            window.clearTimeout(timer);
            resolve();
          });
        };
      });

      socket.onclose = (ev) => {
        if (intentionalCloseRef.current || !mountedRef.current) return;
        if (socketRef.current === socket) socketRef.current = null;
        connectingRef.current = false;
        setupCompleteRef.current = false;
        stopAudio();
        if (retryCountRef.current < 2) {
          retryCountRef.current += 1;
          pushNote(
            langRef.current === "hi"
              ? `दोबारा जुड़ रहा है… (${retryCountRef.current}/2)`
              : `Reconnecting… (${retryCountRef.current}/2)`,
          );
          reconnectTimerRef.current = window.setTimeout(() => {
            void connectVoiceRef.current();
          }, 1200 * retryCountRef.current);
          return;
        }
        setLiveStatus("error");
        const reasonDetail = ev.reason ? `: ${ev.reason}` : "";
        const msg =
          langRef.current === "hi"
            ? `कनेक्शन टूट गया${reasonDetail}। फिर से माइक दबाएँ।`
            : `Connection dropped${reasonDetail}. Tap the mic to talk again.`;
        setError(msg);
        pushNote(msg);
      };
      socket.onerror = () => {
        // onclose drives retry
      };
      socket.onmessage = (event) => {
        void consumeFrame(event);
      };
      if (body.expiresAt) {
        const remain = new Date(body.expiresAt).getTime() - Date.now() - 15_000;
        if (remain > 0) {
          expiryTimerRef.current = window.setTimeout(() => {
            failSession(
              langRef.current === "hi"
                ? "सत्र समाप्त हो रहा है। फिर से माइक दबाएँ।"
                : "Session is ending. Tap the mic to talk again.",
            );
          }, remain);
        }
      }
      const micPermissionMessage =
        langRef.current === "hi"
          ? "माइक्रोफ़ोन अनुमति चाहिए। ब्राउज़र में Allow दबाएँ। तब तक टाइप कर सकते हैं।"
          : "Microphone permission is required. Allow the mic in the browser prompt. You can keep typing until then.";
      try {
        const liveAudio = await startLiveAudio({
          socket,
          micPermissionMessage,
          onSpeakingChange: setIsSpeaking,
        });
        if (intentionalCloseRef.current || !mountedRef.current) {
          liveAudio.stop();
          connectingRef.current = false;
          return;
        }
        liveAudioRef.current = liveAudio;
        liveAudio.setHoldUplink(openingRef.current);
      } catch (micErr) {
        pushNote(micErr instanceof Error ? micErr.message : micPermissionMessage);
      }
      connectingRef.current = false;
      retryCountRef.current = 0;
      setLiveStatus("live");
    } catch (err) {
      connectingRef.current = false;
      failSession(err instanceof Error ? err.message : "Could not start Fasal Saathi");
    }
  }, [failSession, handleTools, plots, pushNote, pushPortalContext, stopAudio, upsertTranscript]);
  connectVoiceRef.current = connectVoice;

  const toggleVoice = useCallback(() => {
    if (statusRef.current === "live" || statusRef.current === "connecting") {
      disconnectVoice();
      pushNote(
        langRef.current === "hi" ? "वॉइस मोड बंद — टाइप करते रहें।" : "Voice mode off — you can keep typing.",
      );
      return;
    }
    void connectVoice();
  }, [connectVoice, disconnectVoice, pushNote]);

  const resetSession = useCallback(() => {
    disconnectVoice();
    hasGreetedRef.current = false;
    setSlots({});
    setLastTool(null);
    setError(null);
    setIsAnalyzing(false);
    const greeting = initialSaathiGreeting(langRef.current);
    setMessages([greeting]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, [disconnectVoice]);

  const sendText = useCallback(
    async (raw: string, source: "text" | "voice" = "text") => {
      const text = raw.trim();
      if (!text) return;
      hasGreetedRef.current = true;
      setMessages((m) => [
        ...m,
        { id: newId("f"), role: "farmer", text, at: new Date().toISOString() },
      ]);
      const liveSocket = socketRef.current;
      const liveOpen =
        Boolean(liveSocket) &&
        liveSocket?.readyState === WebSocket.OPEN &&
        setupCompleteRef.current;
      if (liveOpen && liveSocket) {
        try {
          liveSocket.send(JSON.stringify({ realtimeInput: { text } }));
        } catch {
          // fall through to local reply
        }
      }
      const res = resolveAgenticAction(text, slotsRef.current, plots as never, langRef.current);
      setSlots(res.slots);
      if (!liveOpen) {
        setTimeout(() => {
          setMessages((m) => [...m, res.replyMessage]);
        }, 350);
      }
      if (res.action) {
        const action = res.action;
        if (action.type === "open_camera") {
          const intent = slotsToIntent(res.slots, source === "voice" ? "saathi_voice" : "saathi_text");
          setActiveIntent(intent);
          webCaptureBridge.setIntent(intent);
          const peril = action.peril || intent.peril || "normal";
          const cameraUrl = `/farmer/capture?intentId=${encodeURIComponent(intent.id)}&peril=${encodeURIComponent(peril)}${
            res.slots.plotId ? `&plotId=${encodeURIComponent(res.slots.plotId)}` : ""
          }${res.slots.crop ? `&crop=${encodeURIComponent(res.slots.crop)}` : ""}`;
          setTimeout(() => router.push(cameraUrl), 800);
        } else if (action.type === "navigate") {
          setTimeout(() => router.push(action.url), 600);
        } else if (action.type === "switch_language") {
          setLang(action.lang);
        }
      } else if (!liveOpen) {
        const q = nextQuestion(res.slots, langRef.current);
        if (q) setTimeout(() => setMessages((m) => [...m, q]), 900);
      }

      setIsAnalyzing(true);
      try {
        const classify = await apiFetch("/api/saathi/tool", {
          method: "POST",
          body: JSON.stringify({
            name: "classify_claim",
            args: { text: text.slice(0, 1000), lang: langRef.current },
          }),
        });
        if (!classify.ok) return;
        const json = (await classify.json().catch(() => null)) as
          | { ok?: boolean; data?: { peril?: string; confidence?: number; reasoning?: string } }
          | null;
        const llmData = json?.data;
        if (!json?.ok || !llmData || typeof llmData.confidence !== "number" || !llmData.peril) return;
        const llm = {
          peril: normalizePeril(llmData.peril),
          confidence: llmData.confidence,
          reasoning: String(llmData.reasoning || ""),
        };
        if (llm.confidence < 0.6) return;
        const current = slotsRef.current;
        if (!current.peril || llm.confidence > (current.perilConfidence || 0)) {
          const refined = mergeSlots(current, { peril: llm.peril, perilConfidence: llm.confidence });
          setSlots(refined);
        }
      } catch {
        // heuristic already replied
      } finally {
        setIsAnalyzing(false);
      }
    },
    [plots, router, setActiveIntent, setLang],
  );

  const proceedToCapture = useCallback(() => {
    const s = slotsRef.current;
    if (!s.peril) return;
    const intent = slotsToIntent(s);
    setActiveIntent(intent);
    webCaptureBridge.setIntent(intent);
    const params = new URLSearchParams({ intentId: intent.id, peril: intent.peril });
    if (s.plotId) params.set("plotId", s.plotId);
    if (intent.crop) params.set("crop", intent.crop);
    router.push(`/farmer/capture?${params.toString()}`);
  }, [router, setActiveIntent]);

  useEffect(() => {
    if (liveStatus !== "live") return;
    if (openingRef.current) return;
    const timer = window.setTimeout(() => pushPortalContext("state_change"), 1500);
    return () => window.clearTimeout(timer);
  }, [liveStatus, pathname, lang, plots, claims, milestones, pushPortalContext]);

  useEffect(() => {
    const prevLang = prevLangRef.current;
    if (prevLang === lang) return;
    prevLangRef.current = lang;

    // 1. If conversation has not started or is at initial greeting, update greeting to match new language
    setMessages((prev) => {
      if (prev.length <= 1) {
        return [initialSaathiGreeting(lang)];
      }
      return prev;
    });

    // 2. If voice session is active, instruct Gemini Live immediately about language change
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN && setupCompleteRef.current) {
      const targetLabel = nativeLabelForLang(lang);
      const directive =
        lang === "hi"
          ? "[SYSTEM DIRECTIVE: किसान ने पोर्टल की भाषा बदलकर 'हिन्दी' (hi) कर दी है। अब से आपको केवल और केवल शुद्ध एवं सरल हिन्दी (Hindi) में ही बात करनी है। अंग्रेजी शब्दों (crop, photo, claim, damage, status आदि) के कारण कभी अंग्रेजी में न बदलें। 1 छोटे वाक्य में हिन्दी में पुष्टि करें।]\n"
          : `[SYSTEM DIRECTIVE: The user has switched the portal language to ${targetLabel} ('${lang}'). From now on, you MUST strictly speak and respond in ${targetLabel} ('${lang}'). Do not switch languages on incidental loanwords. Briefly acknowledge this language change in ${targetLabel} in 1 short sentence.]\n`;
      try {
        socket.send(JSON.stringify({ realtimeInput: { text: directive } }));
      } catch {
        // ignore
      }
      pushPortalContext("language_change");
    }
  }, [lang, pushPortalContext]);

  // Voice is audio-only. Live camera frames stay on-device for the OpenCV shutter
  // lock; Gemini sees stills only when the farmer submits a claim.

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      intentionalCloseRef.current = true;
      connectingRef.current = false;
      clearTimers();
      socketRef.current?.close();
      socketRef.current = null;
      liveAudioRef.current?.stop();
      liveAudioRef.current = null;
    };
  }, [clearTimers]);

  const value = useMemo<SaathiSessionValue>(
    () => ({
      messages,
      slots,
      liveStatus,
      error,
      isSpeaking,
      isAnalyzing,
      lastTool,
      overlayOpen,
      setOverlayOpen,
      connectVoice,
      disconnectVoice,
      toggleVoice,
      resetSession,
      sendText,
      proceedToCapture,
    }),
    [
      messages,
      slots,
      liveStatus,
      error,
      isSpeaking,
      isAnalyzing,
      lastTool,
      overlayOpen,
      connectVoice,
      disconnectVoice,
      toggleVoice,
      resetSession,
      sendText,
      proceedToCapture,
    ],
  );

  return <SaathiSessionContext.Provider value={value}>{children}</SaathiSessionContext.Provider>;
}

export function saathiRouteLabel(slots: SaathiSlot) {
  return slots.peril ? routeForPeril(slots.peril) : null;
}
