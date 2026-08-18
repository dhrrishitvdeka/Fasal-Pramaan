export type FacingMode = "environment" | "user";

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

/** Only http(s), data, or blob may be used as img/src on the hosted site. */
export function isSafeDisplayUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const value = url.trim();
  if (!value) return false;
  if (value.startsWith("data:image/")) return true;
  if (value.startsWith("blob:")) return true;
  if (value.startsWith("https://")) return true;
  if (value.startsWith("http://")) return true;
  return false;
}

export function safeDisplayUrl(url: string | null | undefined): string | undefined {
  return isSafeDisplayUrl(url) ? String(url).trim() : undefined;
}

export function cameraConstraintLadder(facing: FacingMode): MediaStreamConstraints[] {
  const opposite: FacingMode = facing === "environment" ? "user" : "environment";
  return [
    { audio: false, video: { facingMode: facing } },
    { audio: false, video: { facingMode: { ideal: facing } } },
    {
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    { audio: false, video: true },
    { audio: false, video: { facingMode: { ideal: opposite } } },
  ];
}

export function videoHasFrame(video: Pick<HTMLVideoElement, "videoWidth" | "videoHeight">): boolean {
  return Number(video.videoWidth) > 0 && Number(video.videoHeight) > 0;
}

export function applyVideoPlaybackFlags(video: HTMLVideoElement): void {
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
}

/** Wait until the live element reports a non-zero frame size. Polls — events are easy to miss. */
export function waitForVideoFrame(video: HTMLVideoElement, timeoutMs = 8000): Promise<void> {
  if (videoHasFrame(video)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => {
      if (videoHasFrame(video)) finish();
    };
    const timer = setTimeout(() => {
      finish(new Error("Camera started but produced no video frames"));
    }, timeoutMs);
    const interval = setInterval(onReady, 80);
    const videoWithFrameCb = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };
    let frameCbId: number | undefined;
    if (typeof videoWithFrameCb.requestVideoFrameCallback === "function") {
      frameCbId = videoWithFrameCb.requestVideoFrameCallback.call(video, onReady);
    }
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(interval);
      if (frameCbId != null) videoWithFrameCb.cancelVideoFrameCallback?.(frameCbId);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("playing", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("resize", onReady);
    };
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("playing", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("resize", onReady);
  });
}

/** Mean luma 0–100 from the current video frame. Null if nothing can be sampled. */
export function sampleVideoMeanLuma(video: HTMLVideoElement): number | null {
  if (!videoHasFrame(video)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(video.videoWidth, 64);
  canvas.height = Math.min(video.videoHeight, 64);
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.width || !canvas.height) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      count += 1;
    }
    if (!count) return null;
    return Math.round((sum / count / 255) * 100);
  } catch {
    return null;
  }
}

/** Bind a live stream so preview can start. A missing first frame is not fatal. */
export async function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
  timeoutMs = 8000,
): Promise<boolean> {
  applyVideoPlaybackFlags(video);
  const waiting = waitForVideoFrame(video, timeoutMs);
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  await video.play().catch(() => undefined);
  try {
    await waiting;
    return true;
  } catch {
    return videoHasFrame(video);
  }
}
