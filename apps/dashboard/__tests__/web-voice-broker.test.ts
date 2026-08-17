import { describe, expect, it } from "vitest";
import { WebVoiceBroker, type WebVoiceGateway } from "../src/lib/voice/web-voice-broker";

function gateway(overrides: Partial<WebVoiceGateway> = {}): WebVoiceGateway & {
  paths: string[];
  langs: string[];
  snoozed: Array<{ id: string; days: number }>;
  submits: number;
} {
  const paths: string[] = [];
  const langs: string[] = [];
  const snoozed: Array<{ id: string; days: number }> = [];
  let submits = 0;
  const value = {
    paths,
    langs,
    snoozed,
    get submits() {
      return submits;
    },
    plots: [{ id: "plot-1", name: "North basin", cropType: "Wheat" }],
    claims: [{ id: "claim-1", status: "under_review", plotName: "North basin" }],
    reminders: [{ id: "rem-1", stageName: "Tillering", dueDate: "2026-09-01", completed: false }],
    navigate: (path: string) => paths.push(path),
    changeLanguage: (code: "en" | "hi") => langs.push(code),
    snoozeReminder: (id: string, days: number) => {
      snoozed.push({ id, days });
    },
    completeReminder: () => undefined,
    capture: {
      captureCurrentAngle: async () => ({ ok: true, message: "Captured closeup_damage", angle: "closeup_damage" }),
      readGuidance: async () => ({ ok: true, message: "Aim at the leaf", angle: "closeup_damage" }),
      setObservation: async (observation: string) => ({ ok: true, message: observation }),
      submitDraft: async () => {
        submits += 1;
        return { ok: true, message: "Claim submitted", claimId: "claim-new" };
      },
    },
    ...overrides,
  };
  return value as WebVoiceGateway & {
    paths: string[];
    langs: string[];
    snoozed: Array<{ id: string; days: number }>;
    submits: number;
  };
}

describe("web Fasal Saathi broker", () => {
  it("runs read, navigate, shutter, and observation immediately", async () => {
    const gw = gateway();
    const broker = new WebVoiceBroker(gw);
    const plots = await broker.execute("list_plots", {}, 1);
    const nav = await broker.execute("navigate_to_screen", { screen: "capture" }, 1);
    const shutter = await broker.execute("capture_current_angle", {}, 1);
    const note = await broker.execute(
      "set_capture_observation",
      { observation: "brown leaf spots" },
      1,
    );
    expect(plots.outcome).toBe("succeeded");
    expect((plots.data?.plots as { name: string }[])[0].name).toBe("North basin");
    expect(nav.outcome).toBe("succeeded");
    expect(gw.paths).toEqual(["/farmer/capture"]);
    expect(shutter.outcome).toBe("succeeded");
    expect(note.outcome).toBe("succeeded");
    expect(gw.submits).toBe(0);
  });

  it("does not mutate on prepare, mutates on a later yes, and cancel does not submit", async () => {
    const gw = gateway();
    const broker = new WebVoiceBroker(gw);
    const prepared = await broker.execute("prepare_submit_claim", {}, 4);
    const sameTurn = await broker.execute("confirm_pending_action", {}, 4);
    expect(prepared.outcome).toBe("confirmation_required");
    expect(sameTurn.outcome).toBe("failed");
    expect(gw.submits).toBe(0);

    const confirmed = await broker.execute("confirm_pending_action", {}, 5);
    expect(confirmed.outcome).toBe("succeeded");
    expect(gw.submits).toBe(1);
    const replay = await broker.execute("confirm_pending_action", {}, 6);
    expect(replay.outcome).toBe("failed");
    expect(gw.submits).toBe(1);
  });

  it("cancel after prepare does not snooze", async () => {
    const gw = gateway();
    const broker = new WebVoiceBroker(gw);
    const prepared = await broker.execute(
      "prepare_snooze_evidence_reminder",
      { reminder_id: "rem-1", days: 3 },
      1,
    );
    const cancelled = await broker.execute("cancel_pending_action", {}, 2);
    const after = await broker.execute("confirm_pending_action", {}, 3);
    expect(prepared.outcome).toBe("confirmation_required");
    expect(cancelled.outcome).toBe("cancelled");
    expect(after.outcome).toBe("failed");
    expect(gw.snoozed).toEqual([]);
  });

  it("rejects farms/offline-queue tools as unavailable on the website", async () => {
    const broker = new WebVoiceBroker(gateway());
    const farms = await broker.execute("list_my_farms", {}, 1);
    const sync = await broker.execute("prepare_sync_offline_queue", {}, 1);
    expect(farms.outcome).toBe("failed");
    expect(farms.message).toMatch(/not available on the website/i);
    expect(sync.outcome).toBe("failed");
  });
});
