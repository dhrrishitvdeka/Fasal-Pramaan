export type GeminiToolInvocation = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type GeminiLiveEvent =
  | { type: "setupComplete" }
  | { type: "audio"; bytesBase64: string }
  | { type: "inputTranscript"; text: string }
  | { type: "outputTranscript"; text: string }
  | { type: "toolCalls"; calls: GeminiToolInvocation[] }
  | { type: "turnComplete" }
  | { type: "interrupted" }
  | { type: "error"; message: string };

export type GeminiLiveMessageParse = {
  events: GeminiLiveEvent[];
  setupComplete: boolean;
  fatalError?: string;
};

function transcriptionText(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const text = String((raw as { text?: unknown }).text ?? "");
  if (!text.trim()) return null;
  return text;
}

function describeError(error: unknown): string {
  if (error && typeof error === "object") {
    const map = error as Record<string, unknown>;
    const parts = [map.status, map.code && `code ${map.code}`, map.message]
      .map((part) => (part == null ? "" : String(part).trim()))
      .filter(Boolean);
    if (parts.length) return parts.join(": ");
  }
  return String(error);
}

export async function frameToText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (typeof Blob !== "undefined" && data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  }
  throw new Error(`Unsupported Gemini Live frame type: ${Object.prototype.toString.call(data)}`);
}

/** Browser Gemini Live often delivers JSON as Blob/ArrayBuffer, not a string. */
export async function decodeGeminiLiveFrame(data: unknown): Promise<Record<string, unknown> | null> {
  const text = (await frameToText(data)).trim();
  if (!text) return null;
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Voice frame was not a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/** Decode one Gemini Live JSON frame. Shipped parser used by the overlay. */
export function parseGeminiLiveMessage(message: Record<string, unknown>): GeminiLiveMessageParse {
  const events: GeminiLiveEvent[] = [];
  let setupComplete = false;
  let fatalError: string | undefined;

  if (message.error != null) {
    fatalError = describeError(message.error);
    events.push({ type: "error", message: fatalError });
  }
  if ("setupComplete" in message) {
    setupComplete = true;
    events.push({ type: "setupComplete" });
  }

  const serverContent = message.serverContent;
  if (serverContent && typeof serverContent === "object") {
    const content = serverContent as Record<string, unknown>;
    const input = transcriptionText(content.inputTranscription);
    if (input) events.push({ type: "inputTranscript", text: input });
    const output = transcriptionText(content.outputTranscription);
    if (output) events.push({ type: "outputTranscript", text: output });
    const modelTurn = content.modelTurn;
    if (modelTurn && typeof modelTurn === "object") {
      const parts = (modelTurn as { parts?: unknown }).parts;
      if (Array.isArray(parts)) {
        for (const rawPart of parts) {
          if (!rawPart || typeof rawPart !== "object") continue;
          const inline = (rawPart as { inlineData?: { data?: unknown } }).inlineData;
          if (inline && typeof inline.data === "string") {
            events.push({ type: "audio", bytesBase64: inline.data });
          }
        }
      }
    }
    if (content.interrupted === true) events.push({ type: "interrupted" });
    if (content.turnComplete === true) events.push({ type: "turnComplete" });
  }

  const toolCall = message.toolCall;
  if (toolCall && typeof toolCall === "object") {
    const rawCalls = (toolCall as { functionCalls?: unknown }).functionCalls;
    const calls: GeminiToolInvocation[] = [];
    if (Array.isArray(rawCalls)) {
      for (const raw of rawCalls) {
        if (!raw || typeof raw !== "object") continue;
        const call = raw as { id?: unknown; name?: unknown; args?: unknown };
        const name = String(call.name || "");
        if (!name) continue;
        const id = String(call.id || "").trim() || `missing-${name}-${calls.length}`;
        calls.push({
          id,
          name,
          arguments: call.args && typeof call.args === "object" ? (call.args as Record<string, unknown>) : {},
        });
      }
    }
    if (calls.length) events.push({ type: "toolCalls", calls });
  }

  if (message.goAway && typeof message.goAway === "object") {
    events.push({ type: "error", message: "Gemini Live requested a session restart." });
  }

  return { events, setupComplete, fatalError };
}
