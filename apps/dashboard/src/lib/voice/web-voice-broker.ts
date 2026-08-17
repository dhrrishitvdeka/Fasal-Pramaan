export type VoiceOutcome = "succeeded" | "failed" | "confirmation_required" | "cancelled";

export type VoiceToolResult = {
  outcome: VoiceOutcome;
  message: string;
  data?: Record<string, unknown>;
  entityId?: string;
};

export type VoiceCaptureBridge = {
  captureCurrentAngle(): Promise<{ ok: boolean; message: string; angle?: string }>;
  readGuidance(): Promise<{ ok: boolean; message: string; angle?: string }>;
  setObservation(observation: string): Promise<{ ok: boolean; message: string }>;
  submitDraft(): Promise<{ ok: boolean; message: string; claimId?: string }>;
};

export type VoicePlot = { id: string; name: string; cropType?: string; khasraNumber?: string };
export type VoiceClaim = { id: string; status: string; plotName?: string; cropType?: string };
export type VoiceReminder = { id: string; stageName: string; dueDate: string; completed: boolean };

export type WebVoiceGateway = {
  plots: VoicePlot[];
  claims: VoiceClaim[];
  reminders: VoiceReminder[];
  navigate(path: string): void;
  changeLanguage(code: "en" | "hi"): void;
  snoozeReminder(id: string, days: number): Promise<void> | void;
  completeReminder(id: string): Promise<void> | void;
  capture: VoiceCaptureBridge;
};

type PendingKind = "submit_claim" | "snooze_reminder" | "complete_reminder";

type PendingAction = {
  kind: PendingKind;
  preparedOnUserTurn: number;
  expiresAt: number;
  reminderId?: string;
  days?: number;
};

const ROUTES: Record<string, string> = {
  home: "/farmer",
  capture: "/farmer/capture",
  claims: "/farmer/claims",
  queue: "/farmer/claims",
  results: "/farmer/claims",
  reminders: "/farmer/reminders",
};

const SUPPORTED_CROPS = [
  { id: "maize", name: "Maize", name_hi: "मक्का" },
  { id: "paddy", name: "Paddy", name_hi: "धान" },
  { id: "potato", name: "Potato", name_hi: "आलू" },
  { id: "wheat", name: "Wheat", name_hi: "गेहूँ" },
];

export class WebVoiceBroker {
  constructor(
    private readonly gateway: WebVoiceGateway,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private pending: PendingAction | null = null;

  get hasPendingConfirmation(): boolean {
    return this.pending != null;
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    userTurn: number,
  ): Promise<VoiceToolResult> {
    try {
      switch (name) {
        case "navigate_to_screen":
          return this.navigate(args);
        case "change_language":
          return this.changeLanguage(args);
        case "list_plots":
          return {
            outcome: "succeeded",
            message: `Found ${this.gateway.plots.length} plots.`,
            data: {
              count: this.gateway.plots.length,
              plots: this.gateway.plots.slice(0, 12).map((plot) => ({
                id: plot.id,
                name: plot.name,
                crop_type: plot.cropType,
                khasra_number: plot.khasraNumber,
              })),
            },
          };
        case "list_crop_types":
          return {
            outcome: "succeeded",
            message: `Found ${SUPPORTED_CROPS.length} crop types.`,
            data: { crop_types: SUPPORTED_CROPS },
          };
        case "list_my_submissions":
          return {
            outcome: "succeeded",
            message: `Found ${this.gateway.claims.length} claims.`,
            data: {
              count: this.gateway.claims.length,
              submissions: this.gateway.claims.slice(0, 10).map((claim) => ({
                id: claim.id,
                status: claim.status,
                plot_name: claim.plotName,
                crop_type: claim.cropType,
              })),
            },
          };
        case "list_evidence_reminders":
          return {
            outcome: "succeeded",
            message: `Found ${this.gateway.reminders.length} reminders.`,
            data: {
              count: this.gateway.reminders.length,
              reminders: this.gateway.reminders.slice(0, 12),
            },
          };
        case "list_my_farms":
        case "prepare_sync_offline_queue":
        case "prepare_create_farm":
        case "prepare_create_plot":
        case "prepare_create_crop_cycle":
        case "prepare_logout":
          return {
            outcome: "failed",
            message: "That action is not available on the website. Use plots, claims, capture, or reminders here.",
          };
        case "begin_guided_capture":
          return this.beginCapture(args);
        case "read_capture_guidance":
          return this.fromCapture(await this.gateway.capture.readGuidance());
        case "capture_current_angle":
          return this.fromCapture(await this.gateway.capture.captureCurrentAngle());
        case "set_capture_observation":
          return this.setObservation(args);
        case "prepare_submit_claim":
          return this.prepare("submit_claim", userTurn, "Ready to submit the current capture as a claim. Ask for a clear yes or no.");
        case "prepare_snooze_evidence_reminder":
          return this.prepareSnooze(args, userTurn);
        case "prepare_complete_reminder":
          return this.prepareComplete(args, userTurn);
        case "confirm_pending_action":
          return this.confirm(userTurn);
        case "cancel_pending_action":
          return this.cancel();
        default:
          return { outcome: "failed", message: "That app action is not allowed." };
      }
    } catch (error) {
      return {
        outcome: "failed",
        message: `The app action failed: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  }

  private navigate(args: Record<string, unknown>): VoiceToolResult {
    const screen = String(args.screen || "");
    const path = ROUTES[screen];
    if (!path) {
      return { outcome: "failed", message: "That screen is not on the farmer website." };
    }
    this.gateway.navigate(path);
    return { outcome: "succeeded", message: `Opened the ${screen} screen.`, data: { screen, path } };
  }

  private changeLanguage(args: Record<string, unknown>): VoiceToolResult {
    const code = String(args.language_code || "").trim().toLowerCase();
    if (code !== "en" && code !== "hi") {
      return { outcome: "failed", message: "Language must be English or Hindi." };
    }
    this.gateway.changeLanguage(code);
    return {
      outcome: "succeeded",
      message: code === "hi" ? "ऐप की भाषा हिन्दी कर दी गई है।" : "The app language is now English.",
      data: { language_code: code },
    };
  }

  private beginCapture(args: Record<string, unknown>): VoiceToolResult {
    const plotId = String(args.plot_id || "").trim();
    const path = plotId ? `/farmer/capture?plotId=${encodeURIComponent(plotId)}` : "/farmer/capture";
    this.gateway.navigate(path);
    return { outcome: "succeeded", message: "Guided capture is open.", entityId: plotId || undefined };
  }

  private async setObservation(args: Record<string, unknown>): Promise<VoiceToolResult> {
    const observation = String(args.observation || "").trim();
    if (!observation || observation.length > 1000) {
      return { outcome: "failed", message: "The observation must be between 1 and 1000 characters." };
    }
    return this.fromCapture(await this.gateway.capture.setObservation(observation));
  }

  private fromCapture(value: { ok: boolean; message: string; angle?: string; claimId?: string }): VoiceToolResult {
    return {
      outcome: value.ok ? "succeeded" : "failed",
      message: value.message,
      data: value,
      entityId: value.claimId || value.angle,
    };
  }

  private prepare(kind: PendingKind, userTurn: number, message: string, extra: Partial<PendingAction> = {}): VoiceToolResult {
    this.pending = {
      kind,
      preparedOnUserTurn: userTurn,
      expiresAt: this.now() + 60_000,
      ...extra,
    };
    return { outcome: "confirmation_required", message, entityId: extra.reminderId };
  }

  private prepareSnooze(args: Record<string, unknown>, userTurn: number): VoiceToolResult {
    const reminderId = String(args.reminder_id || "").trim();
    const days = Number(args.days);
    if (!reminderId) return { outcome: "failed", message: "A reminder id is required." };
    if (!Number.isInteger(days) || days < 1 || days > 7) {
      return { outcome: "failed", message: "A reminder can be snoozed by one to seven days." };
    }
    return this.prepare(
      "snooze_reminder",
      userTurn,
      `Ready to snooze this reminder by ${days} days. Ask for a clear yes or no.`,
      { reminderId, days },
    );
  }

  private prepareComplete(args: Record<string, unknown>, userTurn: number): VoiceToolResult {
    const reminderId = String(args.reminder_id || "").trim();
    if (!reminderId) return { outcome: "failed", message: "A reminder id is required." };
    return this.prepare(
      "complete_reminder",
      userTurn,
      "Ready to mark that reminder complete. Ask for a clear yes or no.",
      { reminderId },
    );
  }

  private async confirm(userTurn: number): Promise<VoiceToolResult> {
    const pending = this.pending;
    if (!pending) return { outcome: "failed", message: "There is no pending action to confirm." };
    if (this.now() > pending.expiresAt) {
      this.pending = null;
      return { outcome: "cancelled", message: "The pending confirmation expired. Prepare the action again." };
    }
    if (userTurn <= pending.preparedOnUserTurn) {
      return {
        outcome: "failed",
        message: "A new, explicit farmer confirmation is required before this action can run.",
      };
    }
    this.pending = null;
    if (pending.kind === "submit_claim") {
      return this.fromCapture(await this.gateway.capture.submitDraft());
    }
    if (pending.kind === "snooze_reminder" && pending.reminderId && pending.days) {
      await this.gateway.snoozeReminder(pending.reminderId, pending.days);
      return {
        outcome: "succeeded",
        message: `Snoozed the reminder by ${pending.days} days.`,
        entityId: pending.reminderId,
      };
    }
    if (pending.kind === "complete_reminder" && pending.reminderId) {
      await this.gateway.completeReminder(pending.reminderId);
      return { outcome: "succeeded", message: "Marked the reminder complete.", entityId: pending.reminderId };
    }
    return { outcome: "failed", message: "Could not complete the action." };
  }

  private cancel(): VoiceToolResult {
    const had = this.pending != null;
    this.pending = null;
    return {
      outcome: "cancelled",
      message: had ? "The pending action was cancelled." : "There was no pending action.",
    };
  }
}
