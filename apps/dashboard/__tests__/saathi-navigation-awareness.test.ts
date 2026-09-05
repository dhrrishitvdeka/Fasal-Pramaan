import { describe, expect, it } from "vitest";
import { WebVoiceBroker, type WebVoiceGateway } from "../src/lib/voice/web-voice-broker";

function createMockGateway(overrides: Partial<WebVoiceGateway> = {}) {
  const navigatedPaths: string[] = [];
  const agentNavigatedPaths: string[] = [];

  const gateway: WebVoiceGateway = {
    plots: [
      {
        id: "plot-wheat-1",
        name: "North Basin",
        cropType: "Wheat",
        khasraNumber: "14/2",
        areaHectares: 1.5,
        village: "Rampur",
        district: "Bhopal",
        state: "MP",
      },
    ],
    claims: [
      {
        id: "claim-recapture-1",
        status: "needs_recapture",
        plotName: "North Basin",
        cropType: "Wheat",
        missingAngles: ["closeup_damage"],
        recaptureReason: "Blurry closeup",
      },
    ],
    reminders: [],
    currentPath: "/farmer",
    language: "hi",
    navigate: (path: string) => {
      navigatedPaths.push(path);
      gateway.currentPath = path;
    },
    onAgentNavigate: (path: string) => {
      agentNavigatedPaths.push(path);
    },
    changeLanguage: () => {},
    snoozeReminder: () => {},
    completeReminder: () => {},
    capture: {
      captureCurrentAngle: async () => ({ ok: true, message: "Captured" }),
      readGuidance: async () => ({ ok: true, message: "Guidance" }),
      submitDraft: async () => ({ ok: true, message: "Submitted" }),
      setObservation: async (obs) => ({ ok: true, message: obs }),
    },
    ...overrides,
  };

  return { gateway, navigatedPaths, agentNavigatedPaths };
}

describe("Saathi Page Awareness & Navigation Awareness", () => {
  it("signals onAgentNavigate when agent tool initiates navigation to a screen", async () => {
    const { gateway, navigatedPaths, agentNavigatedPaths } = createMockGateway();
    const broker = new WebVoiceBroker(gateway);

    const result = await broker.execute("navigate_to_screen", { screen: "claims" }, 1);
    expect(result.outcome).toBe("succeeded");
    expect(navigatedPaths).toEqual(["/farmer/claims"]);
    expect(agentNavigatedPaths).toEqual(["/farmer/claims"]);
  });

  it("signals onAgentNavigate when opening a claim detail", async () => {
    const { gateway, navigatedPaths, agentNavigatedPaths } = createMockGateway();
    const broker = new WebVoiceBroker(gateway);

    const result = await broker.execute("open_claim", { claim_id: "claim-recapture-1" }, 1);
    expect(result.outcome).toBe("succeeded");
    expect(navigatedPaths).toEqual(["/farmer/claims/claim-recapture-1"]);
    expect(agentNavigatedPaths).toEqual(["/farmer/claims/claim-recapture-1"]);
  });

  it("signals onAgentNavigate when beginning recapture", async () => {
    const { gateway, navigatedPaths, agentNavigatedPaths } = createMockGateway();
    const broker = new WebVoiceBroker(gateway);

    const result = await broker.execute("begin_recapture", { claim_id: "claim-recapture-1" }, 1);
    expect(result.outcome).toBe("succeeded");
    expect(navigatedPaths[0]).toContain("/farmer/capture?recapture=claim-recapture-1");
    expect(agentNavigatedPaths[0]).toContain("/farmer/capture?recapture=claim-recapture-1");
  });

  it("signals onAgentNavigate when beginning guided capture", async () => {
    const { gateway, navigatedPaths, agentNavigatedPaths } = createMockGateway();
    const broker = new WebVoiceBroker(gateway);

    const result = await broker.execute("begin_guided_capture", { peril: "flood" }, 1);
    expect(result.outcome).toBe("succeeded");
    expect(navigatedPaths[0]).toContain("/farmer/capture?plotId=plot-wheat-1&peril=flood");
    expect(agentNavigatedPaths[0]).toContain("/farmer/capture?plotId=plot-wheat-1&peril=flood");
  });

  it("allows seamless silent path updates via updateCurrentPath", async () => {
    const { gateway } = createMockGateway();
    const broker = new WebVoiceBroker(gateway);

    expect(gateway.currentPath).toBe("/farmer");
    let screen = await broker.execute("get_current_screen", {}, 1);
    expect(screen.data?.screen).toBe("home");

    // Route change happens silently
    broker.updateCurrentPath("/farmer/capture");
    screen = await broker.execute("get_current_screen", {}, 1);
    expect(screen.data?.screen).toBe("capture");
    expect(screen.data?.path).toBe("/farmer/capture");

    // Portal snapshot reflects new screen
    const snap = await broker.execute("get_portal_snapshot", {}, 1);
    expect(snap.data?.screen).toBe("capture");
  });

  it("preserves pending confirmation across silent route path updates", async () => {
    const { gateway } = createMockGateway();
    const broker = new WebVoiceBroker(gateway);

    // Prepare a sensitive action (e.g. submit claim)
    const prep = await broker.execute("prepare_submit_claim", {}, 1);
    expect(prep.outcome).toBe("confirmation_required");
    expect(broker.hasPendingConfirmation).toBe(true);

    // Path changes as user or agent switches screen
    broker.updateCurrentPath("/farmer/capture");
    expect(broker.hasPendingConfirmation).toBe(true);

    // Confirms successfully on next user turn
    const confirmed = await broker.execute("confirm_pending_action", {}, 2);
    expect(confirmed.outcome).toBe("succeeded");
    expect(broker.hasPendingConfirmation).toBe(false);
  });

  it("navigates to capture screen when capture_current_angle is invoked from non-capture screens", async () => {
    const { gateway, navigatedPaths, agentNavigatedPaths } = createMockGateway({ currentPath: "/farmer" });
    const broker = new WebVoiceBroker(gateway);

    const result = await broker.execute("capture_current_angle", {}, 1);
    expect(result.outcome).toBe("succeeded");
    expect(navigatedPaths[0]).toContain("/farmer/capture?plotId=plot-wheat-1");
    expect(agentNavigatedPaths[0]).toContain("/farmer/capture?plotId=plot-wheat-1");
  });

  it("fails capture_current_angle gracefully when no plots are registered", async () => {
    const { gateway } = createMockGateway({ plots: [], currentPath: "/farmer" });
    const broker = new WebVoiceBroker(gateway);

    const result = await broker.execute("capture_current_angle", {}, 1);
    expect(result.outcome).toBe("failed");
    expect(result.message).toContain("पंजीकृत होना अनिवार्य है");
  });

  it("delegates capture_current_angle to capture bridge when already on capture screen", async () => {
    let captured = false;
    const { gateway } = createMockGateway({
      currentPath: "/farmer/capture",
      capture: {
        captureCurrentAngle: async () => {
          captured = true;
          return { ok: true, message: "Photo captured" };
        },
        readGuidance: async () => ({ ok: true, message: "OK" }),
        submitDraft: async () => ({ ok: true, message: "OK" }),
        setObservation: async () => ({ ok: true, message: "OK" }),
      },
    });
    const broker = new WebVoiceBroker(gateway);

    const result = await broker.execute("capture_current_angle", {}, 1);
    expect(result.outcome).toBe("succeeded");
    expect(captured).toBe(true);
  });

  it("provides localized Hindi response for explain_claim_audit on recapture claims", async () => {
    const { gateway } = createMockGateway({ language: "hi" });
    const broker = new WebVoiceBroker(gateway);

    const result = await broker.execute("explain_claim_audit", { claim_id: "claim-recapture-1" }, 1);
    expect(result.outcome).toBe("succeeded");
    expect(result.message).toContain("दावा claim-recapture-1 में पुनः फोटो आवश्यक है");
    expect(result.message).toContain("closeup_damage");
  });
});
