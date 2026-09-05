import { isUnusableLighting } from "../evidence";

export type VoiceActionResult = {
  ok: boolean;
  message: string;
  angle?: string;
  claimId?: string;
};

/** Outcome used by the capture page and the Fasal Saathi shutter tool. */
export async function runVoiceShutter(input: {
  cameraActive: boolean;
  grabFrame: () =>
    | Promise<{ dataUrl: string; lightingScore?: number } | null>
    | ({ dataUrl: string; lightingScore?: number } | null);
  saveFrame: (dataUrl: string, extras?: { lightingScore?: number }) => Promise<void>;
  angleId?: string;
  peril?: string;
}): Promise<VoiceActionResult> {
  if (!input.cameraActive) {
    return { ok: false, message: "Camera is not active. Open capture first." };
  }
  const frame = await input.grabFrame();
  if (!frame?.dataUrl) {
    return { ok: false, message: "Could not capture a photo." };
  }
  if (input.peril !== "fire_burn" && isUnusableLighting(frame.lightingScore)) {
    return {
      ok: false,
      message: "Frame is too dark. Point the camera at the crop, or use Upload.",
    };
  }
  await input.saveFrame(frame.dataUrl, { lightingScore: frame.lightingScore });
  return {
    ok: true,
    message: `Captured ${input.angleId || "angle"}.`,
    angle: input.angleId,
  };
}

/** Outcome used by the capture page and the Fasal Saathi submit-claim confirm tool. */
export async function runVoiceSubmitDraft(input: {
  allCaptured: boolean;
  incompleteMessage: string;
  persist: () => Promise<{ id: string }>;
}): Promise<VoiceActionResult> {
  if (!input.allCaptured) {
    return { ok: false, message: input.incompleteMessage };
  }
  try {
    const saved = await input.persist();
    return { ok: true, message: "Claim submitted for review.", claimId: saved.id };
  } catch (error) {
    const detail = error instanceof Error ? error.message.trim() : "";
    return {
      ok: false,
      message: detail ? `Submission failed: ${detail}` : "Submission failed. Please try again.",
    };
  }
}
