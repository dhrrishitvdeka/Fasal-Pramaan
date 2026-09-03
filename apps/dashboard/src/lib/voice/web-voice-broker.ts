import { nativeLabelForLang, parseAppLang, type AppLang } from "../live-indian-languages";
import { apiFetch } from "@/lib/auth-headers";
import { resolveSaathiToolName } from "@/lib/saathi/tool-catalog";
import { webCaptureBridge } from "./capture-bridge";
import { normalizePeril } from "@/lib/claim-routing";

export type VoiceOutcome = "succeeded" | "failed" | "confirmation_required" | "cancelled";

export type VoiceToolResult = {
  outcome: VoiceOutcome;
  message: string;
  data?: Record<string, unknown>;
  entityId?: string;
};

export type VoiceCaptureProgress = {
  ok: boolean;
  message: string;
  captured?: number;
  total?: number;
  currentAngle?: string;
};

export type VoiceCaptureBridge = {
  captureCurrentAngle(): Promise<{ ok: boolean; message: string; angle?: string }>;
  switchCamera?(): Promise<{ ok: boolean; message: string; facing?: string }>;
  selectAngle?(angleId: string): Promise<{ ok: boolean; message: string; angleId?: string }>;
  retakeAngle?(angleId: string): Promise<{ ok: boolean; message: string; angleId?: string }>;
  readGuidance(): Promise<{ ok: boolean; message: string; angle?: string }>;
  setObservation(observation: string): Promise<{ ok: boolean; message: string }>;
  submitDraft(): Promise<{ ok: boolean; message: string; claimId?: string }>;
  readProgress?(): Promise<VoiceCaptureProgress>;
  checkEvidenceQuality?(): Promise<{
    ok: boolean;
    message: string;
    canopyPct?: number;
    blurScore?: number;
    hintCode?: string;
    shutterReady?: boolean;
  }>;
};

export type VoiceFarmerProfile = {
  name?: string;
  nameHi?: string;
  kisanId?: string;
  phone?: string;
  village?: string;
  district?: string;
  state?: string;
};

export type VoicePlot = {
  id: string;
  name: string;
  nameHi?: string;
  cropType?: string;
  cropTypeHi?: string;
  khasraNumber?: string;
  areaHectares?: number;
  currentStage?: string;
  village?: string;
  district?: string;
  state?: string;
};

export type VoiceClaim = {
  id: string;
  status: string;
  plotName?: string;
  cropType?: string;
  missingAngles?: string[];
  recaptureReason?: string;
  imageCount?: number;
  createdAt?: string;
  reviewerNotes?: string;
};

export type VoiceReminder = {
  id: string;
  stageName: string;
  stageNameHi?: string;
  dueDate: string;
  completed: boolean;
  isOverdue?: boolean;
  plotId?: string;
  cropName?: string;
};

export type WebVoiceGateway = {
  plots: VoicePlot[];
  claims: VoiceClaim[];
  reminders: VoiceReminder[];
  farmerProfile?: VoiceFarmerProfile;
  currentPath?: string;
  language?: AppLang;
  navigate(path: string): void;
  changeLanguage(code: AppLang): void;
  snoozeReminder(id: string, days: number): Promise<void> | void;
  completeReminder(id: string): Promise<void> | void;
  addPlot?: (plot: {
    name: string;
    cropType: string;
    khasraNumber?: string;
    areaHectares?: number;
    village?: string;
  }) => void | Promise<{ plotId?: string } | void>;
  capture: VoiceCaptureBridge;
};

export type FarmerScreen =
  | "home"
  | "capture"
  | "claims"
  | "claim_detail"
  | "reminders"
  | "help"
  | "profile"
  | "queue"
  | "other";

const SCREEN_LABELS: Record<FarmerScreen, string> = {
  home: "Home",
  capture: "Guided capture",
  claims: "Claims list",
  claim_detail: "Claim detail",
  reminders: "Reminders",
  help: "Help",
  profile: "Profile",
  queue: "Offline draft",
  other: "Other",
};

export function farmerScreenFromPath(path: string): FarmerScreen {
  const raw = (path || "").split("?")[0].replace(/\/+$/, "") || "/";
  if (raw === "/farmer") return "home";
  if (raw.startsWith("/farmer/capture")) return "capture";
  if (/^\/farmer\/claims\/[^/]+$/.test(raw)) return "claim_detail";
  if (raw === "/farmer/claims" || raw.startsWith("/farmer/claims/")) return "claims";
  if (raw.startsWith("/farmer/reminders")) return "reminders";
  if (raw.startsWith("/farmer/help")) return "help";
  if (raw.startsWith("/farmer/profile")) return "profile";
  if (raw.startsWith("/farmer/queue")) return "queue";
  return "other";
}

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
  queue: "/farmer/queue",
  results: "/farmer/claims",
  reminders: "/farmer/reminders",
  help: "/farmer/help",
  profile: "/farmer/profile",
};

const SUPPORTED_CROPS = [
  { id: "maize", name: "Maize", name_hi: "मक्का" },
  { id: "paddy", name: "Paddy", name_hi: "धान" },
  { id: "potato", name: "Potato", name_hi: "आलू" },
  { id: "wheat", name: "Wheat", name_hi: "गेहूँ" },
];

const WEBSITE_UNAVAILABLE =
  "That action is not available on the website. Use plots, claims, capture, or reminders here.";

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

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
      switch (resolveSaathiToolName(name)) {
        case "navigate_to_screen":
          return this.navigate(args);
        case "change_language":
          return this.changeLanguage(args);
        case "get_farmer_profile":
          return this.getFarmerProfile();
        case "get_portal_snapshot":
          return this.getPortalSnapshot();
        case "get_current_screen":
          return this.getCurrentScreen();
        case "list_plots":
          return this.listPlots();
        case "list_crop_types":
          return {
            outcome: "succeeded",
            message: `Found ${SUPPORTED_CROPS.length} crop types.`,
            data: { crop_types: SUPPORTED_CROPS },
          };
        case "list_my_submissions":
          return this.listSubmissions();
        case "get_claim_detail":
          return this.getClaimDetail(args);
        case "open_claim":
          return this.openClaim(args);
        case "list_evidence_reminders":
          return this.listReminders();
        case "list_due_reminders":
          return this.listDueReminders();
        case "register_plot":
        case "create_plot":
          return this.registerPlot(args);
        case "check_plot_geofence":
          return this.checkPlotGeofence(args);
        case "fetch_agro_weather_alerts":
          return this.fetchAgroWeatherAlerts(args);
        case "explain_claim_audit":
          return this.explainClaimAudit(args);
        case "request_evidence_angles":
          return this.fromServer("request_evidence_angles", args, "Could not load evidence angles.");
        case "call_context_signal":
          return this.fromServer("call_context_signal", await this.withGps(args), "Could not load field context.");
        case "guide_capture":
          return this.guideCapture(args);
        case "classify_claim":
          return this.fromServer("classify_claim", args, "Could not classify the claim.");
        case "list_my_farms":
        case "prepare_sync_offline_queue":
        case "prepare_create_farm":
        case "prepare_create_plot":
        case "prepare_create_crop_cycle":
        case "prepare_logout":
          return { outcome: "failed", message: WEBSITE_UNAVAILABLE };
        case "begin_guided_capture":
          return this.beginCapture(args);
        case "begin_recapture":
          return this.beginRecapture(args);
        case "read_capture_guidance":
          return this.fromCapture(await this.gateway.capture.readGuidance());
        case "read_capture_progress":
          return this.readCaptureProgress();
        case "capture_current_angle":
          return this.fromCapture(await this.gateway.capture.captureCurrentAngle());
        case "switch_camera":
          return this.fromCapture(
            this.gateway.capture.switchCamera
              ? await this.gateway.capture.switchCamera()
              : { ok: false, message: "Camera switching is not supported in this view." }
          );
        case "select_capture_angle":
          return this.fromCapture(
            this.gateway.capture.selectAngle
              ? await this.gateway.capture.selectAngle(String(args.angle || ""))
              : { ok: false, message: "Angle selection is not supported in this view." }
          );
        case "retake_capture_angle":
          return this.fromCapture(
            this.gateway.capture.retakeAngle
              ? await this.gateway.capture.retakeAngle(String(args.angle || ""))
              : { ok: false, message: "Retake is not supported in this view." }
          );
        case "check_evidence_quality":
          return this.fromCapture(
            this.gateway.capture.checkEvidenceQuality
              ? await this.gateway.capture.checkEvidenceQuality()
              : { ok: false, message: "Guided capture is not open, so evidence quality cannot be checked." }
          );
        case "set_capture_observation":
          return this.setObservation(args);
        case "prepare_submit_claim":
          return this.prepare(
            "submit_claim",
            userTurn,
            "Ready to submit the current capture as a claim. Ask for a clear yes or no.",
          );
        case "prepare_snooze_evidence_reminder":
          return this.prepareSnooze(args, userTurn);
        case "prepare_complete_reminder":
          return this.prepareComplete(args, userTurn);
        case "confirm_pending_action":
          return this.confirm(userTurn);
        case "cancel_pending_action":
          return this.cancel();
        default:
          return {
            outcome: "failed",
            message: `That app action is not allowed (${resolveSaathiToolName(name)}).`,
          };
      }
    } catch (error) {
      return {
        outcome: "failed",
        message: `The app action failed: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  }

  private listPlots(): VoiceToolResult {
    const plots = this.gateway.plots.slice(0, 12).map((plot) => ({
      id: plot.id,
      name: plot.name,
      name_hi: plot.nameHi,
      crop_type: plot.cropType,
      crop_type_hi: plot.cropTypeHi,
      khasra_number: plot.khasraNumber,
      area_hectares: plot.areaHectares,
      current_stage: plot.currentStage,
      village: plot.village,
      district: plot.district,
      state: plot.state,
    }));
    return {
      outcome: "succeeded",
      message:
        plots.length === 0
          ? "No registered plots. The farmer can still file a claim without a stored plot."
          : `Found ${this.gateway.plots.length} plots.`,
      data: { count: this.gateway.plots.length, plots },
    };
  }

  private async registerPlot(args: Record<string, unknown>): Promise<VoiceToolResult> {
    const name = String(args.name || args.plot_name || "Farm Plot").trim();
    const cropType = String(args.crop_type || args.crop || "wheat").trim().toLowerCase();
    const khasra = args.khasra_number ? String(args.khasra_number).trim() : `KH-${Math.floor(100 + Math.random() * 900)}`;
    const area = args.area_hectares ? Number(args.area_hectares) : 1.0;
    const village = args.village ? String(args.village).trim() : undefined;

    if (this.gateway.addPlot) {
      try {
        const saved = await this.gateway.addPlot({
          name,
          cropType,
          khasraNumber: khasra,
          areaHectares: isNaN(area) ? 1.0 : area,
          village,
        });
        const plotId = saved && typeof saved === "object" ? saved.plotId : undefined;
        return {
          outcome: "succeeded",
          message: `Registered plot '${name}' with ${cropType} crop. It is saved to your farms.`,
          data: { name, crop_type: cropType, khasra_number: khasra, area_hectares: area, plot_id: plotId },
        };
      } catch (error) {
        return {
          outcome: "failed",
          message: `Could not save plot '${name}': ${error instanceof Error ? error.message : "unknown error"}`,
        };
      }
    }
    return {
      outcome: "failed",
      message: "Plot registration is not available in this view. Open Home or Profile to add a plot.",
      data: { name, crop_type: cropType },
    };
  }

  private listSubmissions(): VoiceToolResult {
    const submissions = this.gateway.claims.slice(0, 10).map((claim) => this.serializeClaim(claim));
    const recaptureCount = this.gateway.claims.filter((claim) => claim.status === "needs_recapture").length;
    return {
      outcome: "succeeded",
      message:
        submissions.length === 0
          ? "No claims yet."
          : `Found ${this.gateway.claims.length} claims${recaptureCount ? `, ${recaptureCount} need recapture` : ""}.`,
      data: { count: this.gateway.claims.length, recapture_count: recaptureCount, submissions },
    };
  }

  private listReminders(): VoiceToolResult {
    const reminders = this.gateway.reminders.slice(0, 12).map((item) => this.serializeReminder(item));
    return {
      outcome: "succeeded",
      message:
        reminders.length === 0 ? "No reminders are stored." : `Found ${this.gateway.reminders.length} reminders.`,
      data: { count: this.gateway.reminders.length, reminders },
    };
  }

  private listDueReminders(): VoiceToolResult {
    const due = this.gateway.reminders
      .filter((item) => !item.completed)
      .sort((a, b) => {
        if (Boolean(a.isOverdue) !== Boolean(b.isOverdue)) return a.isOverdue ? -1 : 1;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, 12)
      .map((item) => this.serializeReminder(item));
    const overdueCount = due.filter((item) => item.is_overdue).length;
    return {
      outcome: "succeeded",
      message:
        due.length === 0
          ? "No overdue or upcoming reminders."
          : `Found ${due.length} incomplete reminders${overdueCount ? `, ${overdueCount} overdue` : ""}.`,
      data: { count: due.length, overdue_count: overdueCount, reminders: due },
    };
  }

  private getFarmerProfile(): VoiceToolResult {
    const profile = this.gateway.farmerProfile || {};
    const stored =
      Boolean(profile.kisanId) ||
      Boolean(profile.phone) ||
      Boolean(profile.village) ||
      Boolean(profile.district) ||
      (Boolean(profile.name) && profile.name !== "Farmer");
    return {
      outcome: "succeeded",
      message: stored ? "Loaded the farmer profile." : "No farmer profile details are stored yet.",
      data: {
        name: profile.name || null,
        name_hi: profile.nameHi || null,
        kisan_id: profile.kisanId || null,
        phone: profile.phone || null,
        village: profile.village || null,
        district: profile.district || null,
        state: profile.state || null,
      },
    };
  }

  private getPortalSnapshot(): VoiceToolResult {
    const path = this.gateway.currentPath || "";
    const screen = farmerScreenFromPath(path);
    const recapture = this.gateway.claims.filter((claim) => claim.status === "needs_recapture");
    const verifiedCount = this.gateway.claims.filter((claim) => claim.status === "verified").length;
    const nextReminders = this.gateway.reminders
      .filter((item) => !item.completed)
      .sort((a, b) => {
        if (Boolean(a.isOverdue) !== Boolean(b.isOverdue)) return a.isOverdue ? -1 : 1;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, 3)
      .map((item) => this.serializeReminder(item));
    return {
      outcome: "succeeded",
      message: `Portal snapshot: ${this.gateway.plots.length} plots, ${this.gateway.claims.length} claims, ${recapture.length} need recapture.`,
      data: {
        path: path || null,
        screen,
        language: this.gateway.language || null,
        plot_count: this.gateway.plots.length,
        claim_count: this.gateway.claims.length,
        verified_count: verifiedCount,
        recapture_count: recapture.length,
        recapture_ids: recapture.slice(0, 5).map((claim) => claim.id),
        recapture: recapture.slice(0, 5).map((claim) => ({
          id: claim.id,
          plot_name: claim.plotName,
          crop_type: claim.cropType,
          missing_angles: claim.missingAngles || [],
        })),
        next_reminders: nextReminders,
      },
    };
  }

  private getCurrentScreen(): VoiceToolResult {
    const path = this.gateway.currentPath || "";
    const screen = farmerScreenFromPath(path);
    return {
      outcome: "succeeded",
      message: path ? `The farmer is on ${SCREEN_LABELS[screen]} (${path}).` : "Current screen is not known yet.",
      data: { path: path || null, screen, label: SCREEN_LABELS[screen] },
    };
  }

  private getClaimDetail(args: Record<string, unknown>): VoiceToolResult {
    const rawId = String(args.claim_id || "").trim();
    if (!rawId) return { outcome: "failed", message: "A claim id is required." };
    const found = this.findClaim(rawId);
    if (found === "ambiguous") {
      return { outcome: "failed", message: "Several claims match that id. Use the full claim id." };
    }
    if (!found) return { outcome: "failed", message: "No claim found with that id." };
    return {
      outcome: "succeeded",
      message:
        found.status === "needs_recapture"
          ? `Claim ${found.id} needs recapture.`
          : `Loaded claim ${found.id} (${found.status}).`,
      data: {
        ...this.serializeClaim(found),
        recapture_reason: found.recaptureReason || null,
        reviewer_notes: found.reviewerNotes || null,
      },
      entityId: found.id,
    };
  }

  private openClaim(args: Record<string, unknown>): VoiceToolResult {
    const rawId = String(args.claim_id || "").trim();
    if (!rawId) return { outcome: "failed", message: "A claim id is required." };
    const found = this.findClaim(rawId);
    if (found === "ambiguous") {
      return { outcome: "failed", message: "Several claims match that id. Use the full claim id." };
    }
    if (!found) return { outcome: "failed", message: "No claim found with that id." };
    const path = `/farmer/claims/${found.id}`;
    this.gateway.navigate(path);
    return { outcome: "succeeded", message: `Opened claim ${found.id}.`, data: { path }, entityId: found.id };
  }

  private beginRecapture(args: Record<string, unknown>): VoiceToolResult {
    const rawId = String(args.claim_id || "").trim();
    if (!rawId) return { outcome: "failed", message: "A claim id is required." };
    const found = this.findClaim(rawId);
    if (found === "ambiguous") {
      return { outcome: "failed", message: "Several claims match that id. Use the full claim id." };
    }
    if (!found) return { outcome: "failed", message: "No claim found with that id." };
    const requested = asStringList(args.angles);
    const angles = requested.length ? requested : found.missingAngles || [];
    const path = angles.length
      ? `/farmer/capture?recapture=${encodeURIComponent(found.id)}&angles=${angles.join(",")}`
      : `/farmer/capture?recapture=${encodeURIComponent(found.id)}`;
    this.gateway.navigate(path);
    return {
      outcome: "succeeded",
      message: angles.length
        ? `Opened recapture for claim ${found.id} (${angles.join(", ")}).`
        : `Opened recapture for claim ${found.id}.`,
      data: { path, claim_id: found.id, angles, status: found.status },
      entityId: found.id,
    };
  }

  private async readCaptureProgress(): Promise<VoiceToolResult> {
    const reader = this.gateway.capture.readProgress;
    if (!reader) {
      return {
        outcome: "failed",
        message: "Capture progress is not available. Use read_capture_guidance.",
      };
    }
    const value = await reader();
    return {
      outcome: value.ok ? "succeeded" : "failed",
      message: value.message,
      data: value,
      entityId: value.currentAngle,
    };
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

  private async serverTool(name: string, args: Record<string, unknown>): Promise<VoiceToolResult | null> {
    try {
      const res = await apiFetch("/api/saathi/tool", {
        method: "POST",
        body: JSON.stringify({ name, args }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: Record<string, unknown>; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        return {
          outcome: "failed",
          message: String(body?.error || `Could not run ${name}.`),
          data: body?.data,
        };
      }
      const data = body.data && typeof body.data === "object" ? body.data : {};
      return {
        outcome: "succeeded",
        message:
          typeof data.message === "string" && data.message
            ? data.message
            : typeof data.reasoning === "string" && data.reasoning
              ? data.reasoning
              : `Tool ${name} succeeded.`,
        data,
      };
    } catch {
      return null;
    }
  }

  private async fromServer(
    name: string,
    args: Record<string, unknown>,
    fallback: string,
  ): Promise<VoiceToolResult> {
    const result = await this.serverTool(name, args);
    if (result) return result;
    return { outcome: "failed", message: fallback };
  }

  private async withGps(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (args.lat != null && args.lon != null) return args;
    if (typeof navigator === "undefined" || !navigator.geolocation) return args;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 4000,
          maximumAge: 60_000,
        });
      });
      return {
        ...args,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
      };
    } catch {
      return args;
    }
  }

  private async guideCapture(args: Record<string, unknown>): Promise<VoiceToolResult> {
    const angle = String(args.angle || "").trim();
    if (angle && this.gateway.capture.selectAngle) {
      await this.gateway.capture.selectAngle(angle);
    }
    const server = await this.serverTool("guide_capture", args);
    if (server?.outcome === "succeeded") return server;
    return this.fromCapture(await this.gateway.capture.readGuidance());
  }

  private async checkPlotGeofence(args: Record<string, unknown>): Promise<VoiceToolResult> {
    const server = await this.serverTool("check_plot_geofence", await this.withGps(args));
    if (server) return server;
    const plotId = String(args.plot_id || "").trim();
    const plot = plotId
      ? this.gateway.plots.find((p) => p.id === plotId || p.id.startsWith(plotId))
      : this.gateway.plots[0];

    if (!plot) {
      return {
        outcome: "succeeded",
        message: "No registered plot found to verify against. You can register a plot or file without one.",
        data: { geofence_status: "no_plot" },
      };
    }

    return {
      outcome: "succeeded",
      message: `Found plot '${plot.name}' (${plot.cropType || "crop"}), khasra ${plot.khasraNumber || "n/a"}, village ${plot.village || "unknown"}. Live GPS boundary check is unavailable right now, so the position was not verified.`,
      data: {
        plot_id: plot.id,
        plot_name: plot.name,
        village: plot.village,
        khasra: plot.khasraNumber,
        geofence_status: "unverified",
      },
    };
  }

  private async fetchAgroWeatherAlerts(args: Record<string, unknown>): Promise<VoiceToolResult> {
    const server = await this.serverTool("fetch_agro_weather_alerts", await this.withGps(args));
    if (server) return server;
    const plotId = String(args.plot_id || "").trim();
    const plot = plotId ? this.gateway.plots.find((p) => p.id === plotId) : this.gateway.plots[0];
    const village = plot?.village || this.gateway.farmerProfile?.village || "local area";

    return {
      outcome: "failed",
      message: `Live agro-weather radar for ${village} is unavailable right now. Please try again shortly.`,
      data: { location: village, source: "unavailable" },
    };
  }

  private async explainClaimAudit(args: Record<string, unknown>): Promise<VoiceToolResult> {
    const server = await this.serverTool("explain_claim_audit", args);
    if (server) return server;
    const rawId = String(args.claim_id || "").trim();
    const found = rawId ? this.findClaim(rawId) : this.gateway.claims[0];
    if (!found || found === "ambiguous") {
      return { outcome: "failed", message: "Could not find that claim to audit." };
    }

    const isRecapture = found.status === "needs_recapture";
    const statusMsg = isRecapture
      ? `Claim ${found.id} needs recapture for missing angle(s): ${(found.missingAngles || []).join(", ")}. Reason: ${found.recaptureReason || "Angle clarity needed"}.`
      : `Claim ${found.id} status is '${found.status}'. The detailed 3-stage AI audit breakdown is unavailable right now.`;

    return {
      outcome: "succeeded",
      message: statusMsg,
      data: {
        claim_id: found.id,
        status: found.status,
        stage_1_gate: null,
        stage_2_gemini_analysis: null,
        stage_3_sentinel_crosscheck: null,
        missing_angles: found.missingAngles || [],
        reviewer_notes: found.reviewerNotes || null,
      },
      entityId: found.id,
    };
  }

  private changeLanguage(args: Record<string, unknown>): VoiceToolResult {
    const parsed = parseAppLang(args.language_code);
    if (!parsed) {
      return {
        outcome: "failed",
        message: "That language is not available. Use an Indian Gemini Live language.",
      };
    }
    this.gateway.changeLanguage(parsed);
    const label = nativeLabelForLang(parsed);
    return {
      outcome: "succeeded",
      message:
        parsed === "hi"
          ? "ऐप की भाषा हिन्दी कर दी गई है।"
          : `The app language is now ${label}.`,
      data: { language_code: parsed },
    };
  }

  private beginCapture(args: Record<string, unknown>): VoiceToolResult {
    const plotId = String(args.plot_id || "").trim();
    const intent = webCaptureBridge.getIntent();
    const perilRaw = args.peril != null ? String(args.peril) : intent?.peril;
    const peril = perilRaw ? normalizePeril(perilRaw) : undefined;
    const params = new URLSearchParams();
    if (plotId) params.set("plotId", plotId);
    if (peril) params.set("peril", peril);
    if (intent?.id) params.set("intentId", intent.id);
    if (intent?.crop) params.set("crop", intent.crop);
    const query = params.toString();
    const path = query ? `/farmer/capture?${query}` : "/farmer/capture";
    this.gateway.navigate(path);
    return {
      outcome: "succeeded",
      message: peril ? `Guided capture is open for ${peril}.` : "Guided capture is open.",
      entityId: plotId || undefined,
      data: { path, peril: peril || null },
    };
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

  private findClaim(rawId: string): VoiceClaim | "ambiguous" | undefined {
    const id = rawId.toLowerCase();
    const exact = this.gateway.claims.find((claim) => claim.id.toLowerCase() === id);
    if (exact) return exact;
    const prefix = this.gateway.claims.filter((claim) => claim.id.toLowerCase().startsWith(id));
    if (prefix.length === 1) return prefix[0];
    if (prefix.length > 1) return "ambiguous";
    return undefined;
  }

  private serializeClaim(claim: VoiceClaim) {
    return {
      id: claim.id,
      status: claim.status,
      plot_name: claim.plotName,
      crop_type: claim.cropType,
      missing_angles: claim.missingAngles || [],
      recapture_reason: claim.recaptureReason || null,
      image_count: claim.imageCount ?? 0,
      created_at: claim.createdAt || null,
    };
  }

  private serializeReminder(item: VoiceReminder) {
    return {
      id: item.id,
      stage_name: item.stageName,
      stage_name_hi: item.stageNameHi,
      due_date: item.dueDate,
      completed: item.completed,
      is_overdue: item.isOverdue ?? false,
      plot_id: item.plotId,
      crop_name: item.cropName,
    };
  }
}
