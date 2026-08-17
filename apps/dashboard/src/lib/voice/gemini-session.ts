import {
  GEMINI_AUTH_TOKENS_URL,
  GEMINI_LIVE_WEBSOCKET_URL,
  WEB_FUNCTION_DECLARATIONS,
  WEB_VOICE_SYSTEM_INSTRUCTION,
} from "./function-declarations";

export type VoiceSessionOk = {
  ok: true;
  token: string;
  model: string;
  websocketUrl: string;
  expiresAt: string;
  sessionId: string;
};

export type VoiceSessionErr = {
  ok: false;
  status: number;
  error: string;
};

export type VoiceSessionResult = VoiceSessionOk | VoiceSessionErr;

export function voiceAssistantEnabled(): boolean {
  const flag = (process.env.VOICE_ASSISTANT_ENABLED || "").trim().toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}

export function geminiApiKey(): string {
  return (process.env.GEMINI_API_KEY || "").trim();
}

export function geminiLiveModel(): string {
  return (process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview").replace(
    /^models\//,
    "",
  );
}

export function geminiLiveVoice(): string {
  return process.env.GEMINI_LIVE_VOICE || "Kore";
}

export function geminiLiveSessionMinutes(): number {
  const raw = Number(process.env.GEMINI_LIVE_SESSION_MINUTES || 15);
  if (!Number.isFinite(raw)) return 15;
  return Math.max(5, Math.min(Math.round(raw), 30));
}

export function buildAuthTokenRequest(now = new Date()): {
  body: Record<string, unknown>;
  expiresAt: Date;
  model: string;
} {
  const duration = geminiLiveSessionMinutes();
  const expiresAt = new Date(now.getTime() + duration * 60_000);
  const newSessionExpiresAt = new Date(now.getTime() + 60_000);
  const model = geminiLiveModel();
  const rfc = (value: Date) => value.toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    model,
    expiresAt,
    body: {
      uses: 1,
      expireTime: rfc(expiresAt),
      newSessionExpireTime: rfc(newSessionExpiresAt),
      bidiGenerateContentSetup: {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiLiveVoice() } },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        sessionResumption: {},
        systemInstruction: { parts: [{ text: WEB_VOICE_SYSTEM_INSTRUCTION }] },
        tools: [{ functionDeclarations: WEB_FUNCTION_DECLARATIONS }],
      },
    },
  };
}

export function redactVoiceError(text: string): string {
  return text
    .replace(/GEMINI_API_KEY\s*=\s*\S+/gi, "GEMINI_API_KEY=[redacted]")
    .replace(/SITE_LOCK_PASSWORD\s*=\s*\S+/gi, "SITE_LOCK_PASSWORD=[redacted]")
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[redacted-key]");
}

export async function mintVoiceSession(input: {
  lockActive: boolean;
  unlocked: boolean;
  voiceEnabled?: boolean;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<VoiceSessionResult> {
  if (input.lockActive && !input.unlocked) {
    return { ok: false, status: 401, error: "Site locked" };
  }
  const enabled = input.voiceEnabled ?? voiceAssistantEnabled();
  const apiKey = input.apiKey ?? geminiApiKey();
  if (!enabled || !apiKey) {
    return { ok: false, status: 503, error: "Voice assistant is not configured" };
  }
  const { body, expiresAt, model } = buildAuthTokenRequest(input.now);
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(GEMINI_AUTH_TOKENS_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    return {
      ok: false,
      status: 503,
      error: "Voice service is temporarily unavailable. Please try again.",
    };
  }
  const payload = (await response.json()) as { name?: string };
  if (!payload?.name) {
    return { ok: false, status: 503, error: "Gemini Live returned an invalid session token" };
  }
  return {
    ok: true,
    token: payload.name,
    model,
    websocketUrl: GEMINI_LIVE_WEBSOCKET_URL,
    expiresAt: expiresAt.toISOString(),
    sessionId: crypto.randomUUID(),
  };
}

export function assertNoSecretLeak(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (/GEMINI_API_KEY|SITE_LOCK_PASSWORD|AIza[0-9A-Za-z_\-]{20,}/i.test(text)) {
    throw new Error("Refusing to return a payload that contains a secret");
  }
}
