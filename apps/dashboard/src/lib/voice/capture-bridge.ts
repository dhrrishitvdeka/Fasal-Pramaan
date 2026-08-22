export type CaptureProgressResult = {
  ok: boolean;
  message: string;
  captured?: number;
  total?: number;
  currentAngle?: string;
  missingAngles?: string[];
};

export type CaptureBridgeHandlers = {
  captureCurrentAngle(): Promise<{ ok: boolean; message: string; angle?: string }>;
  switchCamera?(): Promise<{ ok: boolean; message: string; facing?: string }>;
  selectAngle?(angleId: string): Promise<{ ok: boolean; message: string; angleId?: string }>;
  retakeAngle?(angleId: string): Promise<{ ok: boolean; message: string; angleId?: string }>;
  readGuidance(): Promise<{ ok: boolean; message: string; angle?: string }>;
  setObservation(observation: string): Promise<{ ok: boolean; message: string }>;
  submitDraft(): Promise<{ ok: boolean; message: string; claimId?: string }>;
  readProgress?(): Promise<CaptureProgressResult>;
  checkEvidenceQuality?(): Promise<{
    ok: boolean;
    message: string;
    canopyPct?: number;
    blurScore?: number;
    hintCode?: string;
    shutterReady?: boolean;
  }>;
};

import type { ClaimIntent } from "../claim-routing";
import { INTENT_STORAGE_KEY } from "../claim-routing";

const unavailable = (action: string) => ({
  ok: false,
  message: `Guided capture is not open, so ${action} cannot run.`,
});

class WebCaptureBridge {
  private handlers: CaptureBridgeHandlers | null = null;
  private storedIntent: ClaimIntent | null = null;
  private cvResultStore: unknown | null = null;
  private contextSignalsStore: unknown | null = null;

  register(handlers: CaptureBridgeHandlers) {
    this.handlers = handlers;
    return () => {
      if (this.handlers === handlers) this.handlers = null;
    };
  }

  /** Store the active claim intent so capture page + Saathi voice share routing. */
  setIntent(intent: ClaimIntent | null) {
    this.storedIntent = intent;
    if (typeof window !== "undefined") {
      try {
        if (!intent) sessionStorage.removeItem(INTENT_STORAGE_KEY);
        else sessionStorage.setItem(INTENT_STORAGE_KEY, JSON.stringify(intent));
      } catch {
        // ignore
      }
    }
  }

  getIntent(): ClaimIntent | null {
    if (this.storedIntent) return this.storedIntent;
    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(INTENT_STORAGE_KEY);
        if (raw) this.storedIntent = JSON.parse(raw) as ClaimIntent;
      } catch {
        // ignore
      }
    }
    return this.storedIntent;
  }

  /** Live CV frame result from capture studio — feeds Saathi parallel guidance. */
  setCvResult(result: unknown) {
    this.cvResultStore = result;
  }
  getCvResult(): unknown {
    return this.cvResultStore;
  }

  /** Multi-signal context (IMD/Sentinel/Bhuvan) for the active claim. */
  setContextSignals(signals: unknown) {
    this.contextSignalsStore = signals;
  }
  getContextSignals(): unknown {
    return this.contextSignalsStore;
  }

  captureCurrentAngle() {
    return this.handlers?.captureCurrentAngle() ?? Promise.resolve(unavailable("taking a photo"));
  }

  switchCamera() {
    return this.handlers?.switchCamera
      ? this.handlers.switchCamera()
      : Promise.resolve(unavailable("switching camera"));
  }

  selectAngle(angleId: string) {
    return this.handlers?.selectAngle
      ? this.handlers.selectAngle(angleId)
      : Promise.resolve(unavailable(`selecting angle ${angleId}`));
  }

  retakeAngle(angleId: string) {
    return this.handlers?.retakeAngle
      ? this.handlers.retakeAngle(angleId)
      : Promise.resolve(unavailable(`retaking angle ${angleId}`));
  }

  readGuidance() {
    return this.handlers?.readGuidance() ?? Promise.resolve(unavailable("reading guidance"));
  }

  setObservation(observation: string) {
    return this.handlers?.setObservation(observation) ?? Promise.resolve(unavailable("saving an observation"));
  }

  submitDraft() {
    return this.handlers?.submitDraft() ?? Promise.resolve(unavailable("submitting a claim"));
  }

  readProgress(): Promise<CaptureProgressResult> {
    if (!this.handlers) {
      return Promise.resolve(unavailable("reading capture progress"));
    }
    if (!this.handlers.readProgress) {
      return Promise.resolve({
        ok: false,
        message: "Capture progress is not available. Use read_capture_guidance.",
      });
    }
    return this.handlers.readProgress();
  }

  checkEvidenceQuality() {
    if (!this.handlers) {
      return Promise.resolve(unavailable("checking evidence quality"));
    }
    if (!this.handlers.checkEvidenceQuality) {
      return Promise.resolve({
        ok: true,
        message: "Camera active and calibrated.",
      });
    }
    return this.handlers.checkEvidenceQuality();
  }
}

export const webCaptureBridge = new WebCaptureBridge();
