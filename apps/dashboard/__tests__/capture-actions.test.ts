import { describe, expect, it } from "vitest";
import { runVoiceShutter, runVoiceSubmitDraft } from "../src/lib/voice/capture-actions";
import { connectSilentProcessor } from "../src/lib/voice/mic-graph";
import { WebVoiceBroker } from "../src/lib/voice/web-voice-broker";

describe("voice shutter and submit outcomes", () => {
  it("fails shutter when the camera frame cannot be grabbed", async () => {
    const saved: string[] = [];
    const result = await runVoiceShutter({
      cameraActive: true,
      grabFrame: async () => null,
      saveFrame: async (dataUrl) => {
        saved.push(dataUrl);
      },
      angleId: "closeup_damage",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/could not capture/i);
    expect(saved).toEqual([]);
  });

  it("fails shutter when the camera is off and does not save", async () => {
    const saved: string[] = [];
    const result = await runVoiceShutter({
      cameraActive: false,
      grabFrame: async () => ({ dataUrl: "data:image/jpeg;base64,xx" }),
      saveFrame: async (dataUrl) => {
        saved.push(dataUrl);
      },
    });
    expect(result.ok).toBe(false);
    expect(saved).toEqual([]);
  });

  it("awaits save before reporting shutter success", async () => {
    const order: string[] = [];
    const result = await runVoiceShutter({
      cameraActive: true,
      grabFrame: async () => ({ dataUrl: "data:image/jpeg;base64,xx", lightingScore: 70 }),
      saveFrame: async () => {
        order.push("saved");
      },
      angleId: "mid_canopy",
    });
    order.push("returned");
    expect(result).toEqual({
      ok: true,
      message: "Captured mid_canopy.",
      angle: "mid_canopy",
    });
    expect(order).toEqual(["saved", "returned"]);
  });

  it("does not persist when required angles are missing", async () => {
    let persisted = 0;
    const result = await runVoiceSubmitDraft({
      allCaptured: false,
      incompleteMessage: "Capture all required angles first.",
      persist: async () => {
        persisted += 1;
        return { id: "should-not-write" };
      },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Capture all required angles first.");
    expect(persisted).toBe(0);
  });

  it("surfaces persist failure instead of claiming success", async () => {
    const result = await runVoiceSubmitDraft({
      allCaptured: true,
      incompleteMessage: "missing",
      persist: async () => {
        throw new Error("network");
      },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/failed/i);
  });
});

describe("voice confirm uses real submitDraft outcome", () => {
  it("reports failure when confirm submit finds incomplete capture", async () => {
    const broker = new WebVoiceBroker({
      plots: [],
      claims: [],
      reminders: [],
      navigate: () => undefined,
      changeLanguage: () => undefined,
      snoozeReminder: () => undefined,
      completeReminder: () => undefined,
      capture: {
        captureCurrentAngle: async () => ({ ok: false, message: "unused" }),
        readGuidance: async () => ({ ok: true, message: "ok" }),
        setObservation: async () => ({ ok: true, message: "ok" }),
        submitDraft: () =>
          runVoiceSubmitDraft({
            allCaptured: false,
            incompleteMessage: "Capture all required angles first.",
            persist: async () => ({ id: "nope" }),
          }),
      },
    });
    await broker.execute("prepare_submit_claim", {}, 1);
    const confirmed = await broker.execute("confirm_pending_action", {}, 2);
    expect(confirmed.outcome).toBe("failed");
    expect(confirmed.message).toBe("Capture all required angles first.");
  });
});

describe("mic graph", () => {
  it("connects the processor through a muted gain, not the speakers", () => {
    const links: string[] = [];
    const mute = { gain: { value: 1 }, connect: (node: unknown) => links.push(`mute->${node}`) };
    const ctx = {
      destination: "speakers",
      createGain: () => mute,
    };
    const processor = {
      connect: (node: unknown) => links.push(`processor->${node === mute ? "mute" : "other"}`),
    };
    const attached = connectSilentProcessor(processor, ctx);
    expect(attached.gain.value).toBe(0);
    expect(links).toEqual(["processor->mute", "mute->speakers"]);
  });
});
