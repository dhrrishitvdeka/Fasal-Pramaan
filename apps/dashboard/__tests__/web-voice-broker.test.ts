import { describe, expect, it } from "vitest";
import { WEB_FUNCTION_DECLARATIONS, WEB_VOICE_SYSTEM_INSTRUCTION } from "../src/lib/voice/function-declarations";
import { webCaptureBridge } from "../src/lib/voice/capture-bridge";
import {
  farmerScreenFromPath,
  WebVoiceBroker,
  type WebVoiceGateway,
} from "../src/lib/voice/web-voice-broker";

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
    plots: [
      {
        id: "plot-1",
        name: "North basin",
        nameHi: "उत्तरी बेसिन",
        cropType: "Wheat",
        cropTypeHi: "गेहूँ",
        khasraNumber: "12/4",
        areaHectares: 1.2,
        currentStage: "Tillering",
        village: "Rampur",
        district: "Bhopal",
        state: "MP",
      },
    ],
    claims: [
      {
        id: "claim-1",
        status: "needs_recapture",
        plotName: "North basin",
        cropType: "Wheat",
        missingAngles: ["closeup_damage", "mid_canopy"],
        recaptureReason: "Blurry close-up",
        imageCount: 3,
        createdAt: "2026-08-01",
        reviewerNotes: "Please recapture the damaged leaf.",
      },
    ],
    reminders: [
      {
        id: "rem-1",
        stageName: "Tillering",
        stageNameHi: "कल्ले फूटना",
        dueDate: "2026-09-01",
        completed: false,
        isOverdue: true,
        plotId: "plot-1",
        cropName: "Wheat",
      },
      {
        id: "rem-2",
        stageName: "Flowering",
        dueDate: "2026-10-01",
        completed: true,
        isOverdue: false,
      },
      {
        id: "rem-3",
        stageName: "Grain fill",
        dueDate: "2026-11-01",
        completed: false,
        isOverdue: false,
        plotId: "plot-1",
        cropName: "Wheat",
      },
    ],
    farmerProfile: {
      name: "Ramesh",
      nameHi: "रमेश",
      kisanId: "KISAN-1",
      phone: "9999999999",
      village: "Rampur",
      district: "Bhopal",
      state: "MP",
    },
    currentPath: "/farmer",
    language: "hi" as const,
    navigate: (path: string) => paths.push(path),
    changeLanguage: (code: string) => langs.push(code),
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
    const listed = plots.data?.plots as { name: string; area_hectares?: number; village?: string }[];
    expect(listed[0].name).toBe("North basin");
    expect(listed[0].area_hectares).toBe(1.2);
    expect(listed[0].village).toBe("Rampur");
    expect(nav.outcome).toBe("succeeded");
    expect(gw.paths).toEqual(["/farmer/capture"]);
    expect(shutter.outcome).toBe("succeeded");
    expect(note.outcome).toBe("succeeded");
    expect(gw.submits).toBe(0);
  });

  it("returns richer claim and reminder fields", async () => {
    const broker = new WebVoiceBroker(gateway());
    const claims = await broker.execute("list_my_submissions", {}, 1);
    const reminders = await broker.execute("list_evidence_reminders", {}, 1);
    const listed = claims.data?.submissions as { missing_angles: string[]; recapture_reason: string }[];
    expect(listed[0].missing_angles).toEqual(["closeup_damage", "mid_canopy"]);
    expect(listed[0].recapture_reason).toBe("Blurry close-up");
    const rem = reminders.data?.reminders as { is_overdue: boolean; stage_name_hi?: string }[];
    expect(rem[0].is_overdue).toBe(true);
    expect(rem[0].stage_name_hi).toBe("कल्ले फूटना");
  });

  it("persists register_plot through the gateway and returns the plot id", async () => {
    const plots: Array<{ name: string; cropType: string; village?: string }> = [];
    const gw = gateway({
      addPlot: async (input) => {
        plots.push(input);
        return { plotId: "plot-saved-1" };
      },
    });
    const broker = new WebVoiceBroker(gw);
    const result = await broker.execute(
      "register_plot",
      { name: "East bund", crop_type: "paddy", village: "Rampur", area_hectares: 2 },
      1,
    );
    expect(result.outcome).toBe("succeeded");
    expect(plots).toEqual([
      {
        name: "East bund",
        cropType: "paddy",
        khasraNumber: expect.stringMatching(/^KH-/),
        areaHectares: 2,
        village: "Rampur",
      },
    ]);
    expect(result.data?.plot_id).toBe("plot-saved-1");
  });

  it("does not claim plot registration succeeded when addPlot is missing", async () => {
    const broker = new WebVoiceBroker(gateway());
    const result = await broker.execute("register_plot", { name: "Ghost plot", crop_type: "wheat" }, 1);
    expect(result.outcome).toBe("failed");
    expect(result.message).toMatch(/not available/i);
  });

  it("does not report a calibrated camera when capture is closed", async () => {
    const broker = new WebVoiceBroker(gateway());
    const result = await broker.execute("check_evidence_quality", {}, 1);
    expect(result.outcome).toBe("failed");
    expect(result.message.toLowerCase()).not.toMatch(/calibrated/);
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
    const create = await broker.execute("prepare_create_plot", {}, 1);
    const logout = await broker.execute("prepare_logout", {}, 1);
    expect(farms.outcome).toBe("failed");
    expect(farms.message).toMatch(/not available on the website/i);
    expect(sync.outcome).toBe("failed");
    expect(create.outcome).toBe("failed");
    expect(logout.outcome).toBe("failed");
  });

  it("returns farmer profile and portal snapshot with recapture counts", async () => {
    const broker = new WebVoiceBroker(gateway());
    const profile = await broker.execute("get_farmer_profile", {}, 1);
    const snapshot = await broker.execute("get_portal_snapshot", {}, 1);
    expect(profile.outcome).toBe("succeeded");
    expect(profile.data?.kisan_id).toBe("KISAN-1");
    expect(profile.data?.village).toBe("Rampur");
    expect(snapshot.outcome).toBe("succeeded");
    expect(snapshot.data?.recapture_count).toBe(1);
    expect(snapshot.data?.recapture_ids).toEqual(["claim-1"]);
    expect(snapshot.data?.plot_count).toBe(1);
    expect(snapshot.data?.claim_count).toBe(1);
    expect(snapshot.data?.screen).toBe("home");
  });

  it("reads claim detail and fails without an id", async () => {
    const broker = new WebVoiceBroker(gateway());
    const missing = await broker.execute("get_claim_detail", {}, 1);
    const unknown = await broker.execute("get_claim_detail", { claim_id: "missing" }, 1);
    const detail = await broker.execute("get_claim_detail", { claim_id: "claim-1" }, 1);
    expect(missing.outcome).toBe("failed");
    expect(missing.message).toMatch(/claim id is required/i);
    expect(unknown.outcome).toBe("failed");
    expect(detail.outcome).toBe("succeeded");
    expect(detail.data?.missing_angles).toEqual(["closeup_damage", "mid_canopy"]);
    expect(detail.data?.recapture_reason).toBe("Blurry close-up");
    expect(detail.data?.reviewer_notes).toBe("Please recapture the damaged leaf.");
    expect(detail.data).not.toHaveProperty("diseaseDetected");
  });

  it("begin_recapture navigates to the capture recapture query string", async () => {
    const gw = gateway();
    const broker = new WebVoiceBroker(gw);
    const result = await broker.execute("begin_recapture", { claim_id: "claim-1" }, 1);
    expect(result.outcome).toBe("succeeded");
    expect(gw.paths).toEqual(["/farmer/capture?recapture=claim-1&angles=closeup_damage,mid_canopy"]);
    const override = await broker.execute(
      "begin_recapture",
      { claim_id: "claim-1", angles: ["wide_field"] },
      1,
    );
    expect(override.outcome).toBe("succeeded");
    expect(gw.paths[1]).toBe("/farmer/capture?recapture=claim-1&angles=wide_field");
  });

  it("open_claim navigates to the claim detail page", async () => {
    const gw = gateway();
    const broker = new WebVoiceBroker(gw);
    const result = await broker.execute("open_claim", { claim_id: "claim-1" }, 1);
    expect(result.outcome).toBe("succeeded");
    expect(gw.paths).toEqual(["/farmer/claims/claim-1"]);
    const missing = await broker.execute("open_claim", { claim_id: "nope" }, 1);
    expect(missing.outcome).toBe("failed");
  });

  it("lists only incomplete due/overdue reminders", async () => {
    const broker = new WebVoiceBroker(gateway());
    const result = await broker.execute("list_due_reminders", {}, 1);
    const due = result.data?.reminders as { id: string; is_overdue: boolean }[];
    expect(result.outcome).toBe("succeeded");
    expect(due.map((item) => item.id)).toEqual(["rem-1", "rem-3"]);
    expect(due[0].is_overdue).toBe(true);
    expect(result.data?.overdue_count).toBe(1);
  });

  it("reports the current farmer screen", async () => {
    const broker = new WebVoiceBroker(gateway({ currentPath: "/farmer/claims/claim-1" }));
    const result = await broker.execute("get_current_screen", {}, 1);
    expect(result.outcome).toBe("succeeded");
    expect(result.data?.screen).toBe("claim_detail");
    expect(result.data?.path).toBe("/farmer/claims/claim-1");
    expect(farmerScreenFromPath("/farmer/capture?recapture=x")).toBe("capture");
    expect(farmerScreenFromPath("/farmer/reminders")).toBe("reminders");
    expect(farmerScreenFromPath("/farmer")).toBe("home");
  });

  it("returns a clear fallback when capture progress is not registered", async () => {
    const broker = new WebVoiceBroker(gateway());
    const result = await broker.execute("read_capture_progress", {}, 1);
    expect(result.outcome).toBe("failed");
    expect(result.message).toMatch(/read_capture_guidance/i);
  });

  it("uses an optional readProgress handler when present", async () => {
    const broker = new WebVoiceBroker(
      gateway({
        capture: {
          captureCurrentAngle: async () => ({ ok: true, message: "ok" }),
          readGuidance: async () => ({ ok: true, message: "ok" }),
          setObservation: async () => ({ ok: true, message: "ok" }),
          submitDraft: async () => ({ ok: true, message: "ok" }),
          readProgress: async () => ({
            ok: true,
            message: "3 of 5 angles captured.",
            captured: 3,
            total: 5,
            currentAngle: "right_context",
          }),
        },
      }),
    );
    const result = await broker.execute("read_capture_progress", {}, 1);
    expect(result.outcome).toBe("succeeded");
    expect(result.data?.captured).toBe(3);
    expect(result.data?.currentAngle).toBe("right_context");
  });
});

describe("web capture bridge progress fallback", () => {
  it("does not require the capture page to register readProgress", async () => {
    const unreg = await webCaptureBridge.readProgress();
    expect(unreg.ok).toBe(false);
    expect(unreg.message).toMatch(/not open/i);
    const unregister = webCaptureBridge.register({
      captureCurrentAngle: async () => ({ ok: true, message: "ok" }),
      readGuidance: async () => ({ ok: true, message: "ok" }),
      setObservation: async () => ({ ok: true, message: "ok" }),
      submitDraft: async () => ({ ok: true, message: "ok" }),
    });
    const registered = await webCaptureBridge.readProgress();
    unregister();
    expect(registered.ok).toBe(false);
    expect(registered.message).toMatch(/read_capture_guidance/i);
  });
});

describe("web voice tool declarations", () => {
  it("declares the new portal-aware tools and recapture protocol", () => {
    const names = WEB_FUNCTION_DECLARATIONS.map((item) => item.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_farmer_profile",
        "get_portal_snapshot",
        "get_claim_detail",
        "begin_recapture",
        "open_claim",
        "list_due_reminders",
        "get_current_screen",
        "read_capture_progress",
        "confirm_pending_action",
      ]),
    );
    expect(WEB_VOICE_SYSTEM_INSTRUCTION).toMatch(/needs_recapture/);
    expect(WEB_VOICE_SYSTEM_INSTRUCTION).toMatch(/wide_field/);
    expect(WEB_VOICE_SYSTEM_INSTRUCTION).toMatch(/confirm_pending_action/);
    expect(WEB_VOICE_SYSTEM_INSTRUCTION).toMatch(/\/farmer\/capture\?recapture=/);
  });
});
