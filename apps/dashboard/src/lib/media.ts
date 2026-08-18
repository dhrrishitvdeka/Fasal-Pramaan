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
  return [
    {
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    {
      audio: false,
      video: { facingMode: { ideal: facing } },
    },
    { audio: false, video: true },
  ];
}

export function videoHasFrame(video: Pick<HTMLVideoElement, "videoWidth" | "readyState">): boolean {
  return video.videoWidth > 0 && video.readyState >= 2;
}

/** Wait until the live element has decoded at least one frame. */
export function waitForVideoFrame(
  video: HTMLVideoElement,
  timeoutMs = 4000,
): Promise<void> {
  if (videoHasFrame(video)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onReady = () => {
      if (!videoHasFrame(video)) return;
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Camera started but produced no video frames"));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("playing", onReady);
      video.removeEventListener("canplay", onReady);
    };
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("playing", onReady);
    video.addEventListener("canplay", onReady);
  });
}
