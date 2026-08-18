import { describe, expect, it } from "vitest";
import {
  assertNoSecretLeak,
  buildAuthTokenRequest,
  mintVoiceSession,
} from "../src/lib/voice/gemini-session";
import { decodeGeminiLiveFrame, parseGeminiLiveMessage } from "../src/lib/voice/gemini-live-parse";

describe("voice session mint", () => {
  it("fails closed when the site lock is on and the request is locked", async () => {
    const result = await mintVoiceSession({
      lockActive: true,
      unlocked: false,
      voiceEnabled: true,
      apiKey: "test-key",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.error).toMatch(/locked/i);
      expect(JSON.stringify(result)).not.toMatch(/GEMINI_API_KEY|SITE_LOCK_PASSWORD/i);
    }
  });

  it("fails closed when voice is disabled or the key is missing", async () => {
    const disabled = await mintVoiceSession({
      lockActive: false,
      unlocked: true,
      voiceEnabled: false,
      apiKey: "test-key",
    });
    const missing = await mintVoiceSession({
      lockActive: true,
      unlocked: true,
      voiceEnabled: true,
      apiKey: "",
    });
    expect(disabled.ok).toBe(false);
    expect(missing.ok).toBe(false);
    if (!disabled.ok) expect(disabled.status).toBe(503);
    if (!missing.ok) expect(missing.status).toBe(503);
    expect(JSON.stringify(disabled)).not.toMatch(/GEMINI_API_KEY|SITE_LOCK_PASSWORD/i);
    expect(JSON.stringify(missing)).not.toMatch(/GEMINI_API_KEY|SITE_LOCK_PASSWORD/i);
  });

  it("mints when GEMINI_API_KEY is provided even if the env flag is omitted", async () => {
    const result = await mintVoiceSession({
      lockActive: false,
      unlocked: true,
      apiKey: "server-only-key",
      fetchImpl: async () =>
        new Response(JSON.stringify({ name: "auth_tokens/ephemeral-demo" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.token).toBe("auth_tokens/ephemeral-demo");
  });

  it("returns only ephemeral session fields when mint succeeds", async () => {
    const result = await mintVoiceSession({
      lockActive: true,
      unlocked: true,
      voiceEnabled: true,
      apiKey: "server-only-key",
      fetchImpl: async () =>
        new Response(JSON.stringify({ name: "auth_tokens/ephemeral-demo" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toBe("auth_tokens/ephemeral-demo");
      expect(result.websocketUrl).toMatch(/^wss:\/\//);
      expect(result.model).toBeTruthy();
      expect(result.sessionId).toBeTruthy();
      expect(JSON.stringify(result)).not.toMatch(/server-only-key|GEMINI_API_KEY/i);
      assertNoSecretLeak(result);
    }
    const request = buildAuthTokenRequest();
    const body = JSON.stringify(request.body);
    expect(body).toContain("list_plots");
    expect(body).toContain("confirm_pending_action");
    expect(body).toContain("get_portal_snapshot");
    expect(body).toContain("begin_recapture");
    expect(body).toContain("get_claim_detail");
    expect(body).toContain("needs_recapture");
  });

  it("second locked call still rejects without leaking secrets", async () => {
    const again = await mintVoiceSession({
      lockActive: true,
      unlocked: false,
      voiceEnabled: true,
      apiKey: "test-key",
    });
    expect(again.ok).toBe(false);
    expect(JSON.stringify(again)).not.toMatch(/GEMINI_API_KEY|SITE_LOCK_PASSWORD|test-key/i);
  });
});

describe("gemini live parser", () => {
  it("parses setup, transcripts, audio, and tool calls", () => {
    const parsed = parseGeminiLiveMessage({
      setupComplete: {},
      serverContent: {
        inputTranscription: { text: " list plots" },
        outputTranscription: { text: " तीन भूखंड" },
        modelTurn: { parts: [{ inlineData: { data: "AAAA", mimeType: "audio/pcm" } }] },
        turnComplete: true,
      },
      toolCall: {
        functionCalls: [{ id: "c1", name: "list_plots", args: {} }],
      },
    });
    expect(parsed.setupComplete).toBe(true);
    expect(parsed.events.some((event) => event.type === "toolCalls")).toBe(true);
    expect(parsed.events.some((event) => event.type === "audio")).toBe(true);
    expect(parsed.events.some((event) => event.type === "inputTranscript")).toBe(true);
  });

  it("decodes browser Blob and ArrayBuffer Live frames instead of String(blob)", async () => {
    const payload = JSON.stringify({ setupComplete: {} });
    const fromString = await decodeGeminiLiveFrame(payload);
    const fromBlob = await decodeGeminiLiveFrame(new Blob([payload], { type: "application/json" }));
    const fromBytes = await decodeGeminiLiveFrame(new TextEncoder().encode(payload));
    expect(fromString).toEqual({ setupComplete: {} });
    expect(fromBlob).toEqual({ setupComplete: {} });
    expect(fromBytes).toEqual({ setupComplete: {} });
    expect(await decodeGeminiLiveFrame("   ")).toBeNull();
    await expect(decodeGeminiLiveFrame("[object Blob]")).rejects.toThrow();
  });
});
