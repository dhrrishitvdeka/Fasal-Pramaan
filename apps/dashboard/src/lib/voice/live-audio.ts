// Gemini Live duplex audio plumbing shared by FasalSaathiOverlay and the Saathi intake page.
// Uplink: microphone -> 16 kHz mono PCM16 over WebSocket. Downlink: 24 kHz PCM16 base64 -> scheduled playback.

import { connectSilentProcessor } from "./mic-graph";

export type StartOptions = {
  socket: WebSocket;
  /** Localized error thrown when the microphone is denied or unavailable. */
  micPermissionMessage?: string;
  /** Fires when queued playback starts or stops draining; drives speaking indicators. */
  onSpeakingChange?: (speaking: boolean) => void;
  /** Real-time microphone input volume (0.0 to 1.0) for UI frequency/waveform visualizers. */
  onVolumeChange?: (volume: number) => void;
};

export type LiveAudioSession = {
  context: AudioContext;
  playPcm24k: (base64: string) => void;
  /** Send a live camera video frame (JPEG base64) over the active Gemini Live WebSocket. */
  sendVideoFrame: (base64Jpeg: string) => void;
  /** Drop every queued buffer immediately (barge-in) and resync the playback clock. */
  interrupt: () => void;
  /** Full teardown: playback, mic graph, stream tracks, and the AudioContext. */
  stop: () => void;
};

export function downsampleTo16k(input: Float32Array, inputRate: number): Int16Array {
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

export function pcm16FromBase64(base64: string): Int16Array {
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const WORKLET_PROCESSOR_CODE = `
class FasalAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const channel = input[0];
      let sum = 0;
      for (let i = 0; i < channel.length; i++) {
        sum += channel[i] * channel[i];
      }
      const rms = Math.sqrt(sum / channel.length);
      this.port.postMessage({ type: 'audio', samples: channel.slice(), rms });
    }
    return true;
  }
}
registerProcessor('fasal-audio-processor', FasalAudioProcessor);
`;

export async function startLiveAudio(options: StartOptions): Promise<LiveAudioSession> {
  const { socket, micPermissionMessage, onSpeakingChange, onVolumeChange } = options;
  const ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();

  let playTime = ctx.currentTime;
  let speakingTimer: number | null = null;
  const activeNodes = new Set<AudioBufferSourceNode>();

  const clearSpeakingTimer = () => {
    if (speakingTimer != null) {
      window.clearTimeout(speakingTimer);
      speakingTimer = null;
    }
  };

  const dropQueuedNodes = () => {
    activeNodes.forEach((node) => {
      try {
        node.stop();
        node.disconnect();
      } catch {}
    });
    activeNodes.clear();
  };

  const playPcm24k = (base64: string) => {
    const pcm = pcm16FromBase64(base64);
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i += 1) floats[i] = pcm[i] / 0x8000;
    const buffer = ctx.createBuffer(1, floats.length, 24000);
    buffer.getChannelData(0).set(floats);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    activeNodes.add(node);
    node.onended = () => {
      activeNodes.delete(node);
    };
    const startAt = Math.max(ctx.currentTime, playTime);
    node.start(startAt);
    playTime = startAt + buffer.duration;

    if (onSpeakingChange) {
      onSpeakingChange(true);
      clearSpeakingTimer();
      const msRemaining = (playTime - ctx.currentTime) * 1000 + 200;
      speakingTimer = window.setTimeout(() => {
        if (ctx.currentTime >= playTime - 0.05) onSpeakingChange(false);
      }, Math.max(300, msRemaining));
    }
  };

  const interrupt = () => {
    clearSpeakingTimer();
    onSpeakingChange?.(false);
    dropQueuedNodes();
    playTime = ctx.currentTime;
  };

  const sendVideoFrame = (base64Jpeg: string) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    const cleanB64 = base64Jpeg.replace(/^data:image\/[a-z]+;base64,/, "");
    socket.send(
      JSON.stringify({
        realtimeInput: {
          video: {
            mimeType: "image/jpeg",
            data: cleanB64,
          },
        },
      }),
    );
  };

  let workletNode: AudioWorkletNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let stream: MediaStream | null = null;

  const stop = () => {
    interrupt();
    workletNode?.disconnect();
    processor?.disconnect();
    source?.disconnect();
    workletNode = null;
    processor = null;
    source = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    void ctx.close();
  };

  let mediaStream: MediaStream;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch {
    void ctx.close();
    throw new Error(micPermissionMessage || "Microphone permission is required.");
  }
  stream = mediaStream;
  source = ctx.createMediaStreamSource(mediaStream);

  const processAudioChunk = (input: Float32Array, rms: number) => {
    if (onVolumeChange) onVolumeChange(Math.min(1, rms * 4));

    // Acoustic Echo Suppression during speaker playback:
    // When the assistant is speaking through device speakers, prevent the microphone
    // from feeding the assistant's own voice back into Gemini Live.
    const isAssistantSpeaking = ctx.currentTime < playTime + 0.15;
    if (isAssistantSpeaking) {
      // Speaker bleed on phone loudspeakers routinely exceeds 0.12 RMS and used
      // to interrupt() the assistant's own audio. Drop residual echo; only
      // barge-in on a clearly louder user utterance.
      if (rms < 0.3) {
        return;
      }
      interrupt();
    }

    if (socket.readyState !== WebSocket.OPEN) return;
    const pcm = downsampleTo16k(input, ctx.sampleRate);
    socket.send(
      JSON.stringify({
        realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: pcm16ToBase64(pcm) } },
      }),
    );
  };

  // Modern AudioWorklet initialization with fallback to ScriptProcessor
  let useWorklet = false;
  if (typeof AudioWorkletNode !== "undefined" && ctx.audioWorklet) {
    try {
      const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      workletNode = new AudioWorkletNode(ctx, "fasal-audio-processor");
      workletNode.port.onmessage = (event) => {
        if (event.data?.type === "audio") {
          processAudioChunk(event.data.samples, event.data.rms || 0);
        }
      };
      source.connect(workletNode);
      connectSilentProcessor(workletNode, ctx);
      useWorklet = true;
    } catch {
      useWorklet = false;
    }
  }

  if (!useWorklet) {
    processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      let sumSquares = 0;
      for (let i = 0; i < input.length; i += 4) {
        sumSquares += input[i] * input[i];
      }
      const rms = Math.sqrt(sumSquares / (input.length / 4));
      processAudioChunk(input, rms);
    };
    source.connect(processor);
    connectSilentProcessor(processor, ctx);
  }

  return { context: ctx, playPcm24k, sendVideoFrame, interrupt, stop };
}
