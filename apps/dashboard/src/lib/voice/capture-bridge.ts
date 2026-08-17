export type CaptureBridgeHandlers = {
  captureCurrentAngle(): Promise<{ ok: boolean; message: string; angle?: string }>;
  readGuidance(): Promise<{ ok: boolean; message: string; angle?: string }>;
  setObservation(observation: string): Promise<{ ok: boolean; message: string }>;
  submitDraft(): Promise<{ ok: boolean; message: string; claimId?: string }>;
};

const unavailable = (action: string) => ({
  ok: false,
  message: `Guided capture is not open, so ${action} cannot run.`,
});

class WebCaptureBridge {
  private handlers: CaptureBridgeHandlers | null = null;

  register(handlers: CaptureBridgeHandlers) {
    this.handlers = handlers;
    return () => {
      if (this.handlers === handlers) this.handlers = null;
    };
  }

  captureCurrentAngle() {
    return this.handlers?.captureCurrentAngle() ?? Promise.resolve(unavailable("taking a photo"));
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
}

export const webCaptureBridge = new WebCaptureBridge();
