import {
  GEMINI_AUTH_TOKENS_URL,
  GEMINI_LIVE_WEBSOCKET_URL,
  WEB_FUNCTION_DECLARATIONS,
  WEB_VOICE_SYSTEM_INSTRUCTION,
} from "./function-declarations";
import {
  resolveGeminiApiKey,
  resolveGeminiLiveModel,
  resolveGeminiLiveVoice,
} from "@/lib/gemini-models";

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

export function geminiApiKey(): string {
  return resolveGeminiApiKey();
}

export function geminiLiveModel(): string {
  return resolveGeminiLiveModel();
}

export function geminiLiveVoice(): string {
  return resolveGeminiLiveVoice();
}

export function geminiLiveSessionMinutes(): number {
  const raw = Number(process.env.GEMINI_LIVE_SESSION_MINUTES || 15);
  if (!Number.isFinite(raw)) return 30;
  return Math.max(5, Math.min(Math.round(raw), 60));
}

function rfc3339(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function liveSessionConfig() {
  return {
    responseModalities: ["AUDIO"],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiLiveVoice() } },
    },
    systemInstruction: { parts: [{ text: WEB_VOICE_SYSTEM_INSTRUCTION }] },
    tools: [{ functionDeclarations: WEB_FUNCTION_DECLARATIONS }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {},
  };
}

export function buildAuthTokenRequest(now = new Date()): {
  body: Record<string, unknown>;
  legacyBody: Record<string, unknown>;
  expiresAt: Date;
  model: string;
} {
  const duration = geminiLiveSessionMinutes();
  const expiresAt = new Date(now.getTime() + duration * 60_000);
  // Window to *start* the Live socket — keep short; session length is expireTime.
  const newSessionExpireAt = new Date(now.getTime() + 2 * 60_000);
  const model = geminiLiveModel();
  const liveConfig = liveSessionConfig();
  const shared = {
    uses: 20,
    expireTime: rfc3339(expiresAt),
    newSessionExpireTime: rfc3339(newSessionExpireAt),
  };
  return {
    model,
    expiresAt,
    body: {
      ...shared,
      liveConnectConstraints: {
        model: `models/${model}`,
        config: liveConfig,
      },
    },
    // v1alpha-era field name; retried on 400 so older Gemini endpoints still mint.
    legacyBody: {
      ...shared,
      bidiGenerateContentSetup: {
        model: `models/${model}`,
        generationConfig: {
          responseModalities: liveConfig.responseModalities,
          speechConfig: liveConfig.speechConfig,
        },
        systemInstruction: liveConfig.systemInstruction,
        tools: liveConfig.tools,
        inputAudioTranscription: liveConfig.inputAudioTranscription,
        outputAudioTranscription: liveConfig.outputAudioTranscription,
      },
    },
  };
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
  const apiKey = input.apiKey ?? geminiApiKey();
  // Hosted Vercel: a server GEMINI_API_KEY is enough. The env flag is only an
  // explicit off-switch when the caller passes voiceEnabled: false (tests).
  // VOICE_ASSISTANT_ENABLED=false in .env.example used to block live sessions.
  if (!apiKey) {
    return { ok: false, status: 503, error: "Voice assistant is not configured" };
  }
  if (input.voiceEnabled === false) {
    return { ok: false, status: 503, error: "Voice assistant is not configured" };
  }
  const { body, legacyBody, expiresAt, model } = buildAuthTokenRequest(input.now);
  const fetchImpl = input.fetchImpl ?? fetch;
  const postToken = (payload: Record<string, unknown>) =>
    fetchImpl(GEMINI_AUTH_TOKENS_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(15_000)
          : undefined,
    });
  let response = await postToken(body);
  if (!response.ok && (response.status === 400 || response.status === 404)) {
    const firstError = await response.text().catch(() => "");
    console.warn("Gemini Live auth_tokens v1beta body rejected, retrying legacy setup:", response.status, firstError);
    response = await postToken(legacyBody);
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("Gemini Live auth_tokens failed:", response.status, errorText);
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
